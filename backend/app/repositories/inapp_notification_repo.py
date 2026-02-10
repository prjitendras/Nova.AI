"""In-App Notification Repository - Data access for notification bell"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from pymongo.collection import Collection
from pymongo import DESCENDING

from .mongo_client import get_collection
from ..domain.models import InAppNotification
from ..domain.enums import InAppNotificationCategory
from ..domain.errors import NotFoundError
from ..utils.logger import get_logger
from ..utils.time import utc_now
from ..utils.idgen import generate_notification_id

logger = get_logger(__name__)


class InAppNotificationRepository:
    """Repository for in-app notification operations"""
    
    COLLECTION_NAME = "inapp_notifications"
    
    def __init__(self):
        self._collection: Collection = get_collection(self.COLLECTION_NAME)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Ensure required indexes exist"""
        try:
            # Index for fetching user's notifications
            self._collection.create_index(
                [("recipient_email", 1), ("created_at", -1)],
                name="recipient_notifications"
            )
            # Index for unread count
            self._collection.create_index(
                [("recipient_email", 1), ("is_read", 1)],
                name="unread_notifications"
            )
            # TTL index for auto-cleanup of old notifications (90 days)
            self._collection.create_index(
                "expires_at",
                name="notification_expiry",
                expireAfterSeconds=0
            )
        except Exception as e:
            logger.debug(f"Index creation skipped (may already exist): {e}")
    
    def create_notification(
        self,
        recipient_email: str,
        category: InAppNotificationCategory,
        title: str,
        message: str,
        ticket_id: Optional[str] = None,
        action_url: Optional[str] = None,
        actor_email: Optional[str] = None,
        actor_display_name: Optional[str] = None,
        recipient_aad_id: Optional[str] = None,
        expires_in_days: int = 90
    ) -> InAppNotification:
        """Create a new in-app notification"""
        now = utc_now()
        
        notification = InAppNotification(
            notification_id=generate_notification_id(),
            recipient_email=recipient_email.lower(),
            recipient_aad_id=recipient_aad_id,
            category=category,
            title=title,
            message=message,
            ticket_id=ticket_id,
            action_url=action_url,
            actor_email=actor_email,
            actor_display_name=actor_display_name,
            is_read=False,
            created_at=now,
            expires_at=now + timedelta(days=expires_in_days)
        )
        
        doc = notification.model_dump(mode="json")
        doc["_id"] = notification.notification_id
        
        self._collection.insert_one(doc)
        
        logger.info(
            f"Created in-app notification for {recipient_email}",
            extra={
                "notification_id": notification.notification_id,
                "category": category.value,
                "ticket_id": ticket_id
            }
        )
        
        return notification
    
    def get_notifications_for_user(
        self,
        email: str,
        skip: int = 0,
        limit: int = 50,
        unread_only: bool = False,
        category: Optional[InAppNotificationCategory] = None
    ) -> List[InAppNotification]:
        """Get notifications for a user, newest first"""
        query: Dict[str, Any] = {"recipient_email": email.lower()}
        
        if unread_only:
            query["is_read"] = False
        
        if category:
            query["category"] = category.value
        
        cursor = self._collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        
        notifications = []
        for doc in cursor:
            doc.pop("_id", None)
            notifications.append(InAppNotification.model_validate(doc))
        
        return notifications
    
    def get_unread_count(self, email: str) -> int:
        """Get count of unread notifications for a user"""
        return self._collection.count_documents({
            "recipient_email": email.lower(),
            "is_read": False
        })
    
    def get_notification(self, notification_id: str) -> Optional[InAppNotification]:
        """Get a single notification by ID"""
        doc = self._collection.find_one({"notification_id": notification_id})
        if doc:
            doc.pop("_id", None)
            return InAppNotification.model_validate(doc)
        return None
    
    def mark_as_read(self, notification_id: str, email: str) -> InAppNotification:
        """Mark a notification as read"""
        result = self._collection.find_one_and_update(
            {
                "notification_id": notification_id,
                "recipient_email": email.lower()
            },
            {
                "$set": {
                    "is_read": True,
                    "read_at": utc_now()
                }
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Notification {notification_id} not found")
        
        result.pop("_id", None)
        return InAppNotification.model_validate(result)
    
    def mark_all_as_read(self, email: str) -> int:
        """Mark all notifications as read for a user. Returns count of updated."""
        result = self._collection.update_many(
            {
                "recipient_email": email.lower(),
                "is_read": False
            },
            {
                "$set": {
                    "is_read": True,
                    "read_at": utc_now()
                }
            }
        )
        
        logger.info(f"Marked {result.modified_count} notifications as read for {email}")
        return result.modified_count
    
    def delete_notification(self, notification_id: str, email: str) -> bool:
        """Delete a notification. Returns True if deleted."""
        result = self._collection.delete_one({
            "notification_id": notification_id,
            "recipient_email": email.lower()
        })
        return result.deleted_count > 0
    
    def delete_old_notifications(self, days_old: int = 90) -> int:
        """Delete notifications older than specified days. Returns count deleted."""
        cutoff = utc_now() - timedelta(days=days_old)
        result = self._collection.delete_many({
            "created_at": {"$lt": cutoff}
        })
        
        if result.deleted_count > 0:
            logger.info(f"Cleaned up {result.deleted_count} old notifications")
        
        return result.deleted_count
    
    def get_stats_for_user(self, email: str) -> Dict[str, int]:
        """Get notification stats for a user"""
        pipeline = [
            {"$match": {"recipient_email": email.lower()}},
            {"$facet": {
                "total": [{"$count": "count"}],
                "unread": [
                    {"$match": {"is_read": False}},
                    {"$count": "count"}
                ],
                "by_category": [
                    {"$group": {"_id": "$category", "count": {"$sum": 1}}}
                ]
            }}
        ]
        
        result = list(self._collection.aggregate(pipeline))
        
        if not result:
            return {"total": 0, "unread": 0}
        
        data = result[0]
        stats = {
            "total": data["total"][0]["count"] if data["total"] else 0,
            "unread": data["unread"][0]["count"] if data["unread"] else 0
        }
        
        for cat in data.get("by_category", []):
            stats[f"category_{cat['_id'].lower()}"] = cat["count"]
        
        return stats
