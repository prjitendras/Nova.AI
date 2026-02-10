"""Notification Repository - Data access for notification outbox

Provides robust distributed locking for multi-server deployments using MongoDB
atomic operations. Ensures no duplicate processing of notifications.
"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from pymongo.collection import Collection
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

from .mongo_client import get_collection
from ..domain.models import NotificationOutbox
from ..domain.enums import NotificationStatus, NotificationTemplateKey
from ..domain.errors import NotFoundError
from ..utils.logger import get_logger
from ..utils.time import utc_now
from ..config.settings import settings

logger = get_logger(__name__)


class NotificationRepository:
    """Repository for notification outbox operations"""
    
    def __init__(self):
        self._outbox: Collection = get_collection("notification_outbox")
    
    def create_notification(self, notification: NotificationOutbox) -> NotificationOutbox:
        """Create a notification in outbox"""
        doc = notification.model_dump(mode="json")
        doc["_id"] = notification.notification_id
        
        self._outbox.insert_one(doc)
        logger.info(
            f"Created notification: {notification.template_key.value}",
            extra={
                "notification_id": notification.notification_id,
                "ticket_id": notification.ticket_id
            }
        )
        return notification
    
    def create_notifications_bulk(self, notifications: List[NotificationOutbox]) -> List[NotificationOutbox]:
        """Create multiple notifications"""
        if not notifications:
            return []
        
        docs = []
        for notification in notifications:
            doc = notification.model_dump(mode="json")
            doc["_id"] = notification.notification_id
            docs.append(doc)
        
        self._outbox.insert_many(docs)
        logger.info(f"Created {len(notifications)} notifications")
        return notifications
    
    def get_notification(self, notification_id: str) -> Optional[NotificationOutbox]:
        """Get notification by ID"""
        doc = self._outbox.find_one({"notification_id": notification_id})
        if doc:
            doc.pop("_id", None)
            return NotificationOutbox.model_validate(doc)
        return None
    
    def get_pending_notifications(
        self,
        limit: int = 100
    ) -> List[NotificationOutbox]:
        """
        Get pending notifications ready for sending.
        
        Uses proper MongoDB query to avoid duplicate $or conditions bug.
        Only returns notifications that:
        - Have PENDING status
        - Are not locked (or lock expired)
        - Are ready for retry (or first attempt)
        """
        now = utc_now()
        
        try:
            # Fixed query: using $and to combine conditions properly
            cursor = self._outbox.find({
                "status": NotificationStatus.PENDING.value,
                "$and": [
                    {"$or": [
                        {"next_retry_at": {"$lte": now}},
                        {"next_retry_at": None}
                    ]},
                    {"$or": [
                        {"locked_until": {"$lte": now}},
                        {"locked_until": None}
                    ]}
                ]
            }).sort("created_at", ASCENDING).limit(limit)
            
            notifications = []
            for doc in cursor:
                doc.pop("_id", None)
                notifications.append(NotificationOutbox.model_validate(doc))
            
            logger.debug(
                f"Found {len(notifications)} pending notifications",
                extra={"limit": limit}
            )
            
            return notifications
            
        except PyMongoError as e:
            logger.error(
                f"Database error fetching pending notifications: {e}",
                extra={"error_type": type(e).__name__}
            )
            return []
        except Exception as e:
            logger.error(
                f"Unexpected error fetching pending notifications: {e}",
                extra={"error_type": type(e).__name__}
            )
            return []
    
    def acquire_lock(
        self,
        notification_id: str,
        lock_by: str,
        lock_duration_seconds: int = 60
    ) -> bool:
        """
        Try to acquire distributed lock on notification using atomic MongoDB operation.
        
        This ensures only ONE server/process can process this notification at a time.
        Uses optimistic locking with atomic find-and-modify.
        
        Args:
            notification_id: The notification to lock
            lock_by: Unique identifier for this locker (e.g., "server1-pid123-uuid")
            lock_duration_seconds: How long to hold the lock (default 60s)
            
        Returns:
            True if lock acquired, False otherwise
        """
        now = utc_now()
        lock_until = now + timedelta(seconds=lock_duration_seconds)
        
        try:
            # Use findAndModify (find_one_and_update) for atomic operation
            # This ensures only one process can acquire the lock
            result = self._outbox.find_one_and_update(
                {
                    "notification_id": notification_id,
                    "status": NotificationStatus.PENDING.value,  # Extra safety
                    "$or": [
                        {"locked_until": {"$lte": now}},
                        {"locked_until": None}
                    ]
                },
                {
                    "$set": {
                        "locked_until": lock_until,
                        "locked_by": lock_by,
                        "lock_acquired_at": now
                    }
                },
                return_document=False  # Return the document BEFORE update
            )
            
            if result:
                logger.debug(
                    f"Lock acquired on notification {notification_id}",
                    extra={
                        "notification_id": notification_id,
                        "locked_by": lock_by,
                        "lock_expires": lock_until.isoformat()
                    }
                )
                return True
            else:
                logger.debug(
                    f"Could not acquire lock on notification {notification_id} - already locked or not found",
                    extra={"notification_id": notification_id, "attempted_by": lock_by}
                )
                return False
                
        except PyMongoError as e:
            logger.error(
                f"Database error acquiring lock on notification {notification_id}: {e}",
                extra={"notification_id": notification_id, "error_type": type(e).__name__}
            )
            return False
        except Exception as e:
            logger.error(
                f"Unexpected error acquiring lock on notification {notification_id}: {e}",
                extra={"notification_id": notification_id, "error_type": type(e).__name__}
            )
            return False
    
    def release_lock(self, notification_id: str, lock_by: Optional[str] = None) -> bool:
        """
        Release lock on notification.
        
        Optionally verifies the lock is held by the specified locker to prevent
        accidental release of another process's lock.
        
        Args:
            notification_id: The notification to unlock
            lock_by: Optional - only release if held by this locker
            
        Returns:
            True if lock released, False otherwise
        """
        try:
            query = {"notification_id": notification_id}
            
            # If lock_by is specified, only release if we own the lock
            if lock_by:
                query["locked_by"] = lock_by
            
            result = self._outbox.update_one(
                query,
                {
                    "$set": {"locked_until": None, "locked_by": None},
                    "$unset": {"lock_acquired_at": ""}
                }
            )
            
            if result.modified_count > 0:
                logger.debug(
                    f"Lock released on notification {notification_id}",
                    extra={"notification_id": notification_id, "released_by": lock_by}
                )
                return True
            return False
            
        except PyMongoError as e:
            logger.error(
                f"Database error releasing lock on notification {notification_id}: {e}",
                extra={"notification_id": notification_id, "error_type": type(e).__name__}
            )
            return False
        except Exception as e:
            logger.error(
                f"Unexpected error releasing lock on notification {notification_id}: {e}",
                extra={"notification_id": notification_id, "error_type": type(e).__name__}
            )
            return False
    
    def cleanup_stale_locks(self, max_lock_age_minutes: int = 10) -> int:
        """
        Clean up stale locks from crashed processes.
        
        This should be called periodically to recover from scenarios where
        a process crashed while holding a lock.
        
        Args:
            max_lock_age_minutes: Consider locks older than this as stale
            
        Returns:
            Number of stale locks cleaned up
        """
        cutoff = utc_now() - timedelta(minutes=max_lock_age_minutes)
        
        try:
            result = self._outbox.update_many(
                {
                    "locked_until": {"$lte": cutoff},
                    "locked_by": {"$ne": None}
                },
                {
                    "$set": {"locked_until": None, "locked_by": None},
                    "$unset": {"lock_acquired_at": ""}
                }
            )
            
            if result.modified_count > 0:
                logger.warning(
                    f"Cleaned up {result.modified_count} stale notification locks",
                    extra={"stale_count": result.modified_count, "max_age_minutes": max_lock_age_minutes}
                )
            
            return result.modified_count
            
        except PyMongoError as e:
            logger.error(f"Error cleaning up stale locks: {e}")
            return 0
    
    def mark_sent(self, notification_id: str) -> NotificationOutbox:
        """Mark notification as sent"""
        result = self._outbox.find_one_and_update(
            {"notification_id": notification_id},
            {
                "$set": {
                    "status": NotificationStatus.SENT.value,
                    "sent_at": utc_now(),
                    "locked_until": None,
                    "locked_by": None
                }
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Notification {notification_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Notification sent: {notification_id}")
        return NotificationOutbox.model_validate(result)
    
    def mark_failed(
        self,
        notification_id: str,
        error: str,
        retry_at: Optional[datetime] = None
    ) -> NotificationOutbox:
        """Mark notification as failed with retry"""
        from ..config.settings import settings
        
        # Get current notification to check retry count
        notification = self.get_notification(notification_id)
        if not notification:
            raise NotFoundError(f"Notification {notification_id} not found")
        
        new_retry_count = notification.retry_count + 1
        
        # Determine new status
        if new_retry_count >= settings.notification_max_retries:
            new_status = NotificationStatus.FAILED.value
            next_retry = None
        else:
            new_status = NotificationStatus.PENDING.value
            # Exponential backoff: 1, 2, 4, 8, 16 minutes
            if retry_at is None:
                from datetime import timedelta
                backoff_minutes = 2 ** notification.retry_count
                next_retry = utc_now() + timedelta(minutes=backoff_minutes)
            else:
                next_retry = retry_at
        
        result = self._outbox.find_one_and_update(
            {"notification_id": notification_id},
            {
                "$set": {
                    "status": new_status,
                    "retry_count": new_retry_count,
                    "last_error": error,
                    "next_retry_at": next_retry,
                    "locked_until": None,
                    "locked_by": None
                }
            },
            return_document=True
        )
        
        result.pop("_id", None)
        logger.warning(
            f"Notification failed: {notification_id}",
            extra={"error": error, "retry_count": new_retry_count}
        )
        return NotificationOutbox.model_validate(result)
    
    def get_failed_notifications(
        self,
        skip: int = 0,
        limit: int = 50
    ) -> List[NotificationOutbox]:
        """Get failed notifications for admin review"""
        cursor = self._outbox.find({
            "status": NotificationStatus.FAILED.value
        }).sort("created_at", ASCENDING).skip(skip).limit(limit)
        
        notifications = []
        for doc in cursor:
            doc.pop("_id", None)
            notifications.append(NotificationOutbox.model_validate(doc))
        
        return notifications
    
    def get_failed_notifications_for_retry(
        self,
        limit: int = 50
    ) -> List[NotificationOutbox]:
        """Get pending notifications that failed but are ready for retry"""
        now = utc_now()
        
        cursor = self._outbox.find({
            "status": NotificationStatus.PENDING.value,
            "retry_count": {"$gt": 0},  # Has been retried before
            "next_retry_at": {"$lte": now},
            "$or": [
                {"locked_until": {"$lte": now}},
                {"locked_until": None}
            ]
        }).sort("next_retry_at", ASCENDING).limit(limit)
        
        notifications = []
        for doc in cursor:
            doc.pop("_id", None)
            notifications.append(NotificationOutbox.model_validate(doc))
        
        return notifications
    
    def get_notifications_for_ticket(self, ticket_id: str) -> List[NotificationOutbox]:
        """Get all notifications for a ticket"""
        cursor = self._outbox.find({"ticket_id": ticket_id}).sort("created_at", ASCENDING)
        
        notifications = []
        for doc in cursor:
            doc.pop("_id", None)
            notifications.append(NotificationOutbox.model_validate(doc))
        
        return notifications
    
    def retry_notification(self, notification_id: str) -> NotificationOutbox:
        """Reset notification for retry"""
        result = self._outbox.find_one_and_update(
            {"notification_id": notification_id},
            {
                "$set": {
                    "status": NotificationStatus.PENDING.value,
                    "next_retry_at": utc_now(),
                    "locked_until": None,
                    "locked_by": None
                }
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Notification {notification_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Notification queued for retry: {notification_id}")
        return NotificationOutbox.model_validate(result)
    
    def count_by_status(self) -> Dict[str, int]:
        """Count notifications by status"""
        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        
        result = {}
        for doc in self._outbox.aggregate(pipeline):
            result[doc["_id"]] = doc["count"]
        
        return result
    
    # =========================================================================
    # Admin Dashboard Methods - Comprehensive notification tracking
    # =========================================================================
    
    def list_notifications(
        self,
        status: Optional[str] = None,
        ticket_id: Optional[str] = None,
        template_key: Optional[str] = None,
        recipient_email: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[NotificationOutbox], int]:
        """
        List notifications with comprehensive filtering for admin dashboard.
        
        Args:
            status: Filter by status (PENDING, SENT, FAILED)
            ticket_id: Filter by ticket ID
            template_key: Filter by template key
            recipient_email: Filter by recipient email (partial match)
            from_date: Filter notifications created after this date
            to_date: Filter notifications created before this date
            skip: Pagination offset
            limit: Max results to return
            sort_by: Field to sort by
            sort_order: 'asc' or 'desc'
            
        Returns:
            Tuple of (notifications list, total count)
        """
        try:
            query: Dict[str, Any] = {}
            
            if status:
                query["status"] = status
            
            if ticket_id:
                query["ticket_id"] = ticket_id
            
            if template_key:
                query["template_key"] = template_key
            
            if recipient_email:
                # Case-insensitive partial match on recipients array
                query["recipients"] = {"$regex": recipient_email, "$options": "i"}
            
            if from_date:
                query["created_at"] = {"$gte": from_date}
            
            if to_date:
                if "created_at" in query:
                    query["created_at"]["$lte"] = to_date
                else:
                    query["created_at"] = {"$lte": to_date}
            
            # Get total count
            total = self._outbox.count_documents(query)
            
            # Sort direction
            sort_dir = DESCENDING if sort_order.lower() == "desc" else ASCENDING
            
            # Get paginated results
            cursor = self._outbox.find(query).sort(sort_by, sort_dir).skip(skip).limit(limit)
            
            notifications = []
            for doc in cursor:
                doc.pop("_id", None)
                notifications.append(NotificationOutbox.model_validate(doc))
            
            return notifications, total
            
        except PyMongoError as e:
            logger.error(f"Database error listing notifications: {e}")
            return [], 0
        except Exception as e:
            logger.error(f"Error listing notifications: {e}")
            return [], 0
    
    def get_notification_details(self, notification_id: str) -> Optional[Dict[str, Any]]:
        """
        Get full notification details including email content for admin view.
        
        Returns all fields including payload for content reconstruction.
        """
        try:
            doc = self._outbox.find_one({"notification_id": notification_id})
            if not doc:
                return None
            
            doc.pop("_id", None)
            return doc
            
        except PyMongoError as e:
            logger.error(f"Database error getting notification details: {e}")
            return None
    
    def get_comprehensive_stats(
        self,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get comprehensive notification statistics for admin dashboard.
        
        Returns detailed stats including:
        - Counts by status
        - Counts by template
        - Retry distribution
        - Success rate
        - Processing times
        """
        try:
            date_filter = {}
            if from_date:
                date_filter["created_at"] = {"$gte": from_date}
            if to_date:
                if "created_at" in date_filter:
                    date_filter["created_at"]["$lte"] = to_date
                else:
                    date_filter["created_at"] = {"$lte": to_date}
            
            # Status counts
            status_pipeline = [
                {"$match": date_filter} if date_filter else {"$match": {}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}}
            ]
            status_counts = {doc["_id"]: doc["count"] for doc in self._outbox.aggregate(status_pipeline)}
            
            # Template counts
            template_pipeline = [
                {"$match": date_filter} if date_filter else {"$match": {}},
                {"$group": {"_id": "$template_key", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 20}
            ]
            template_counts = {doc["_id"]: doc["count"] for doc in self._outbox.aggregate(template_pipeline)}
            
            # Retry distribution
            retry_pipeline = [
                {"$match": date_filter} if date_filter else {"$match": {}},
                {"$group": {"_id": "$retry_count", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}}
            ]
            retry_distribution = {str(doc["_id"]): doc["count"] for doc in self._outbox.aggregate(retry_pipeline)}
            
            # Failed with errors
            failed_errors_pipeline = [
                {"$match": {"status": NotificationStatus.FAILED.value, **date_filter}},
                {"$group": {"_id": "$last_error", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 10}
            ]
            common_errors = [
                {"error": doc["_id"][:200] if doc["_id"] else "Unknown", "count": doc["count"]}
                for doc in self._outbox.aggregate(failed_errors_pipeline)
            ]
            
            # Currently locked (in processing)
            now = utc_now()
            locked_count = self._outbox.count_documents({
                "locked_until": {"$gt": now},
                "locked_by": {"$ne": None}
            })
            
            # Calculate rates
            total = sum(status_counts.values())
            sent = status_counts.get("SENT", 0)
            failed = status_counts.get("FAILED", 0)
            pending = status_counts.get("PENDING", 0)
            
            success_rate = (sent / total * 100) if total > 0 else 0
            failure_rate = (failed / total * 100) if total > 0 else 0
            
            # Recent activity (last 24 hours)
            yesterday = utc_now() - timedelta(hours=24)
            recent_pipeline = [
                {"$match": {"created_at": {"$gte": yesterday}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}}
            ]
            recent_counts = {doc["_id"]: doc["count"] for doc in self._outbox.aggregate(recent_pipeline)}
            
            return {
                "status_counts": {
                    "pending": pending,
                    "sent": sent,
                    "failed": failed,
                    "total": total
                },
                "template_counts": template_counts,
                "retry_distribution": retry_distribution,
                "common_errors": common_errors,
                "currently_locked": locked_count,
                "success_rate": round(success_rate, 2),
                "failure_rate": round(failure_rate, 2),
                "last_24_hours": {
                    "pending": recent_counts.get("PENDING", 0),
                    "sent": recent_counts.get("SENT", 0),
                    "failed": recent_counts.get("FAILED", 0),
                    "total": sum(recent_counts.values())
                }
            }
            
        except PyMongoError as e:
            logger.error(f"Database error getting comprehensive stats: {e}")
            return {
                "status_counts": {"pending": 0, "sent": 0, "failed": 0, "total": 0},
                "template_counts": {},
                "retry_distribution": {},
                "common_errors": [],
                "currently_locked": 0,
                "success_rate": 0,
                "failure_rate": 0,
                "last_24_hours": {"pending": 0, "sent": 0, "failed": 0, "total": 0}
            }
    
    def get_notifications_by_ticket_detailed(self, ticket_id: str) -> List[Dict[str, Any]]:
        """
        Get all notifications for a ticket with full details.
        Used for ticket-specific notification traceability.
        """
        try:
            cursor = self._outbox.find({"ticket_id": ticket_id}).sort("created_at", ASCENDING)
            
            notifications = []
            for doc in cursor:
                doc.pop("_id", None)
                notifications.append(doc)
            
            return notifications
            
        except PyMongoError as e:
            logger.error(f"Database error getting ticket notifications: {e}")
            return []
    
    def bulk_retry_failed(self, notification_ids: List[str]) -> int:
        """
        Bulk retry multiple failed notifications.
        
        Args:
            notification_ids: List of notification IDs to retry
            
        Returns:
            Number of notifications queued for retry
        """
        try:
            now = utc_now()
            
            result = self._outbox.update_many(
                {
                    "notification_id": {"$in": notification_ids},
                    "status": NotificationStatus.FAILED.value
                },
                {
                    "$set": {
                        "status": NotificationStatus.PENDING.value,
                        "next_retry_at": now,
                        "locked_until": None,
                        "locked_by": None
                    }
                }
            )
            
            if result.modified_count > 0:
                logger.info(
                    f"Bulk retry: {result.modified_count} notifications queued for retry",
                    extra={"count": result.modified_count, "notification_ids": notification_ids[:5]}
                )
            
            return result.modified_count
            
        except PyMongoError as e:
            logger.error(f"Database error in bulk retry: {e}")
            return 0
    
    def cancel_notification(self, notification_id: str) -> bool:
        """
        Cancel a pending notification (won't be sent).
        
        Only works for PENDING notifications that aren't currently locked.
        """
        try:
            now = utc_now()
            
            result = self._outbox.update_one(
                {
                    "notification_id": notification_id,
                    "status": NotificationStatus.PENDING.value,
                    "$or": [
                        {"locked_until": {"$lte": now}},
                        {"locked_until": None}
                    ]
                },
                {
                    "$set": {
                        "status": "CANCELLED",
                        "last_error": "Cancelled by admin",
                        "locked_until": None,
                        "locked_by": None
                    }
                }
            )
            
            if result.modified_count > 0:
                logger.info(f"Notification {notification_id} cancelled")
                return True
            return False
            
        except PyMongoError as e:
            logger.error(f"Database error cancelling notification: {e}")
            return False

