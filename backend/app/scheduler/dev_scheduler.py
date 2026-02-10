"""Dev Scheduler - Production-ready scheduler for notification processing

Supports multi-server deployment with distributed locking via MongoDB.
Handles:
- Notification processing with lock-based concurrency control
- SLA reminders and escalations
- Stale lock cleanup for crash recovery
- Exponential backoff retry for failed notifications
"""
import asyncio
import socket
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from ..config.settings import settings
from ..repositories.notification_repo import NotificationRepository
from ..repositories.ticket_repo import TicketRepository
from ..repositories.workflow_repo import WorkflowRepository
from ..services.notification_service import NotificationService
from ..domain.enums import NotificationTemplateKey, StepState
from ..domain.models import TicketStep, Ticket
from ..utils.logger import get_logger
from ..utils.idgen import generate_correlation_id, generate_id
from ..utils.time import utc_now

logger = get_logger(__name__)


class DevScheduler:
    """
    Production-ready scheduler using APScheduler with MongoDB distributed locking.
    
    Designed for multi-server deployment:
    - Each server runs its own scheduler instance
    - Notifications are locked before processing (only one server processes each)
    - Stale locks are cleaned up automatically (crash recovery)
    
    Responsibilities:
    - Send pending notifications
    - Trigger SLA reminders
    - Handle SLA escalations
    - Retry failed notifications with exponential backoff
    - Clean up stale locks from crashed processes
    """
    
    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.notification_repo = NotificationRepository()
        self.notification_service = NotificationService()
        self.ticket_repo = TicketRepository()
        self.workflow_repo = WorkflowRepository()
        self._is_running = False
        self._last_sla_check: Dict[str, datetime] = {}  # Track last reminder sent per step
        
        # Generate unique server ID for distributed locking
        self._server_id = self._generate_server_id()
        self._process_count = 0  # Track notifications processed
    
    def _generate_server_id(self) -> str:
        """Generate unique server identifier for distributed locking"""
        hostname = socket.gethostname()
        pid = os.getpid()
        unique = generate_id()[:8]
        return f"{hostname}-{pid}-{unique}"
    
    def start(self) -> None:
        """Start the scheduler"""
        if self._is_running:
            logger.warning("Scheduler already running")
            return
        
        self.scheduler = AsyncIOScheduler()
        
        # Process notifications at configured interval (default 10 seconds)
        self.scheduler.add_job(
            self._process_notifications,
            trigger=IntervalTrigger(seconds=settings.scheduler_interval_seconds),
            id="process_notifications",
            name="Process pending notifications",
            replace_existing=True
        )
        
        # Check SLA reminders every 60 seconds
        self.scheduler.add_job(
            self._check_sla_reminders,
            trigger=IntervalTrigger(seconds=60),
            id="check_sla_reminders",
            name="Check SLA reminders",
            replace_existing=True
        )
        
        # Check SLA escalations every 60 seconds
        self.scheduler.add_job(
            self._check_sla_escalations,
            trigger=IntervalTrigger(seconds=60),
            id="check_sla_escalations",
            name="Check SLA escalations",
            replace_existing=True
        )
        
        # Retry failed notifications every 2 minutes
        self.scheduler.add_job(
            self._retry_failed_notifications,
            trigger=IntervalTrigger(minutes=2),
            id="retry_failed_notifications",
            name="Retry failed notifications",
            replace_existing=True
        )
        
        # Clean up stale locks every 5 minutes (crash recovery)
        self.scheduler.add_job(
            self._cleanup_stale_locks,
            trigger=IntervalTrigger(minutes=5),
            id="cleanup_stale_locks",
            name="Cleanup stale notification locks",
            replace_existing=True
        )
        
        self.scheduler.start()
        self._is_running = True
        logger.info(
            f"Scheduler started",
            extra={
                "server_id": self._server_id,
                "notification_interval": settings.scheduler_interval_seconds,
                "lock_duration": settings.notification_lock_duration_seconds
            }
        )
    
    def stop(self) -> None:
        """Stop the scheduler"""
        if self.scheduler:
            self.scheduler.shutdown()
            self._is_running = False
            logger.info("Dev scheduler stopped")
    
    @property
    def is_running(self) -> bool:
        """Check if scheduler is running"""
        return self._is_running
    
    async def _process_notifications(self) -> None:
        """
        Process pending notifications with distributed locking.
        
        Each notification is locked before processing to ensure only one
        server processes it (safe for multi-server deployment).
        """
        correlation_id = generate_correlation_id()
        start_time = utc_now()
        processed = 0
        failed = 0
        skipped = 0
        
        try:
            logger.debug(
                "Starting notification processing cycle",
                extra={"correlation_id": correlation_id, "server_id": self._server_id}
            )
            
            # Get pending notifications (unlocked ones only)
            notifications = self.notification_repo.get_pending_notifications(limit=50)
            
            if not notifications:
                return
            
            logger.info(
                f"Found {len(notifications)} pending notifications to process",
                extra={"count": len(notifications), "server_id": self._server_id}
            )
            
            # Process each notification with locking
            for notification in notifications:
                try:
                    # Generate unique lock ID for this processing attempt
                    lock_id = f"{self._server_id}-{generate_id()[:8]}"
                    
                    # Try to acquire lock (atomic operation)
                    lock_acquired = self.notification_repo.acquire_lock(
                        notification.notification_id,
                        lock_id,
                        lock_duration_seconds=settings.notification_lock_duration_seconds
                    )
                    
                    if not lock_acquired:
                        # Another server is processing this notification
                        skipped += 1
                        logger.debug(
                            f"Notification {notification.notification_id} locked by another process",
                            extra={"notification_id": notification.notification_id}
                        )
                        continue
                    
                    try:
                        # Process the notification
                        success = await self.notification_service.send_notification(notification)
                        
                        if success:
                            processed += 1
                            self._process_count += 1
                            logger.info(
                                f"Sent notification {notification.notification_id}",
                                extra={
                                    "notification_id": notification.notification_id,
                                    "template": notification.template_key.value,
                                    "recipients": notification.recipients,
                                    "server_id": self._server_id
                                }
                            )
                        else:
                            failed += 1
                            
                    finally:
                        # Always release the lock
                        self.notification_repo.release_lock(notification.notification_id, lock_id)
                        
                except Exception as e:
                    failed += 1
                    logger.error(
                        f"Error processing notification {notification.notification_id}: {e}",
                        extra={
                            "notification_id": notification.notification_id,
                            "error_type": type(e).__name__,
                            "error": str(e)
                        }
                    )
            
            # Log summary
            duration_ms = (utc_now() - start_time).total_seconds() * 1000
            if processed > 0 or failed > 0:
                logger.info(
                    f"Notification cycle complete: {processed} sent, {failed} failed, {skipped} skipped",
                    extra={
                        "processed": processed,
                        "failed": failed,
                        "skipped": skipped,
                        "duration_ms": round(duration_ms, 2),
                        "server_id": self._server_id,
                        "total_processed": self._process_count
                    }
                )
        
        except Exception as e:
            logger.error(
                f"Error in notification processing job: {e}",
                extra={"error_type": type(e).__name__, "error": str(e)}
            )
    
    async def _cleanup_stale_locks(self) -> None:
        """
        Clean up stale locks from crashed processes.
        
        This ensures crash recovery - if a server crashes while holding a lock,
        the notification will be picked up by another server after the lock expires.
        """
        try:
            cleaned = self.notification_repo.cleanup_stale_locks(
                max_lock_age_minutes=settings.stale_lock_cleanup_minutes
            )
            
            if cleaned > 0:
                logger.info(
                    f"Cleaned up {cleaned} stale notification locks",
                    extra={"cleaned_count": cleaned, "server_id": self._server_id}
                )
                
        except Exception as e:
            logger.error(f"Error cleaning up stale locks: {e}")
    
    async def _check_sla_reminders(self) -> None:
        """
        Check for SLA reminders
        
        Sends reminder notifications for steps approaching their SLA deadline.
        """
        try:
            correlation_id = generate_correlation_id()
            logger.debug("Checking SLA reminders", extra={"correlation_id": correlation_id})
            
            now = utc_now()
            
            # Get steps that are active and have a due date
            active_states = [StepState.ACTIVE.value, StepState.WAITING_FOR_APPROVAL.value]
            
            # Query steps approaching deadline (within next 60 minutes)
            reminder_window = now + timedelta(minutes=60)
            
            # Get steps with due_at approaching
            from pymongo import ASCENDING
            from ..repositories.mongo_client import get_collection
            
            steps_collection = get_collection("ticket_steps")
            cursor = steps_collection.find({
                "state": {"$in": active_states},
                "due_at": {
                    "$gte": now.isoformat(),
                    "$lte": reminder_window.isoformat()
                }
            }).limit(100)
            
            for doc in cursor:
                doc.pop("_id", None)
                step = TicketStep.model_validate(doc)
                
                # Check if we already sent a reminder recently (within last 30 mins)
                last_reminder = self._last_sla_check.get(step.ticket_step_id)
                if last_reminder and (now - last_reminder).total_seconds() < 1800:
                    continue
                
                # Get ticket for context
                ticket = self.ticket_repo.get_ticket(step.ticket_id)
                if not ticket:
                    continue
                
                # Send reminder notification
                await self._send_sla_reminder(step, ticket)
                self._last_sla_check[step.ticket_step_id] = now
        
        except Exception as e:
            logger.error(f"Error in SLA reminder job: {e}")
    
    async def _check_sla_escalations(self) -> None:
        """
        Check for SLA escalations
        
        Sends escalation notifications for steps that are past due.
        """
        try:
            correlation_id = generate_correlation_id()
            logger.debug("Checking SLA escalations", extra={"correlation_id": correlation_id})
            
            # Get overdue steps
            overdue_steps = self.ticket_repo.get_overdue_steps(skip=0, limit=100)
            
            now = utc_now()
            
            for step in overdue_steps:
                # Check if already acknowledged
                if step.data.get("sla_acknowledged"):
                    continue
                
                # Check if escalation was recently sent (within last 4 hours)
                escalation_key = f"escalation_{step.ticket_step_id}"
                last_escalation = self._last_sla_check.get(escalation_key)
                if last_escalation and (now - last_escalation).total_seconds() < 14400:
                    continue
                
                # Get ticket for context
                ticket = self.ticket_repo.get_ticket(step.ticket_id)
                if not ticket:
                    continue
                
                # Calculate how overdue
                if step.due_at:
                    overdue_minutes = int((now - step.due_at).total_seconds() / 60)
                else:
                    overdue_minutes = 0
                
                # Send escalation notification
                await self._send_sla_escalation(step, ticket, overdue_minutes)
                self._last_sla_check[escalation_key] = now
        
        except Exception as e:
            logger.error(f"Error in SLA escalation job: {e}")
    
    async def _send_sla_reminder(self, step: TicketStep, ticket: Ticket) -> None:
        """Send SLA reminder notification"""
        try:
            # Determine recipients
            recipients = []
            
            # Add assigned user
            if step.assigned_to:
                recipients.append(step.assigned_to.email)
            
            # Add manager
            if ticket.manager_snapshot:
                recipients.append(ticket.manager_snapshot.email)
            
            if not recipients:
                return
            
            # Calculate minutes until due
            minutes_until_due = 0
            if step.due_at:
                minutes_until_due = int((step.due_at - utc_now()).total_seconds() / 60)
            
            # Enqueue notification
            self.notification_service.enqueue_notification(
                template_key=NotificationTemplateKey.SLA_REMINDER,
                recipients=recipients,
                payload={
                    "ticket_id": ticket.ticket_id,
                    "ticket_title": ticket.title,
                    "step_name": step.step_name,
                    "minutes_until_due": minutes_until_due,
                    "assigned_to": step.assigned_to.display_name if step.assigned_to else "Unassigned"
                },
                ticket_id=ticket.ticket_id
            )
            
            logger.info(
                f"Sent SLA reminder for step {step.ticket_step_id}",
                extra={
                    "ticket_id": ticket.ticket_id,
                    "step_id": step.ticket_step_id,
                    "minutes_until_due": minutes_until_due
                }
            )
        
        except Exception as e:
            logger.error(f"Failed to send SLA reminder: {e}")
    
    async def _send_sla_escalation(self, step: TicketStep, ticket: Ticket, overdue_minutes: int) -> None:
        """Send SLA escalation notification"""
        try:
            # Determine recipients - escalate to manager and requester
            recipients = []
            
            # Add manager (primary escalation)
            if ticket.manager_snapshot:
                recipients.append(ticket.manager_snapshot.email)
            
            # Add requester
            recipients.append(ticket.requester.email)
            
            # Add assigned user
            if step.assigned_to:
                recipients.append(step.assigned_to.email)
            
            # Deduplicate
            recipients = list(set(recipients))
            
            if not recipients:
                return
            
            # Enqueue notification
            self.notification_service.enqueue_notification(
                template_key=NotificationTemplateKey.SLA_ESCALATION,
                recipients=recipients,
                payload={
                    "ticket_id": ticket.ticket_id,
                    "ticket_title": ticket.title,
                    "step_name": step.step_name,
                    "overdue_minutes": overdue_minutes,
                    "overdue_hours": round(overdue_minutes / 60, 1),
                    "assigned_to": step.assigned_to.display_name if step.assigned_to else "Unassigned"
                },
                ticket_id=ticket.ticket_id
            )
            
            logger.warning(
                f"Sent SLA escalation for step {step.ticket_step_id}",
                extra={
                    "ticket_id": ticket.ticket_id,
                    "step_id": step.ticket_step_id,
                    "overdue_minutes": overdue_minutes
                }
            )
        
        except Exception as e:
            logger.error(f"Failed to send SLA escalation: {e}")
    
    async def _retry_failed_notifications(self) -> None:
        """Retry failed notifications with exponential backoff"""
        try:
            correlation_id = generate_correlation_id()
            logger.debug("Retrying failed notifications", extra={"correlation_id": correlation_id})
            
            # Get notifications ready for retry
            notifications = self.notification_repo.get_failed_notifications_for_retry(limit=20)
            
            if not notifications:
                return
            
            logger.info(f"Found {len(notifications)} notifications to retry")
            
            for notification in notifications:
                try:
                    success = await self.notification_service.send_notification(notification)
                    if success:
                        logger.info(f"Retry successful for {notification.notification_id}")
                except Exception as e:
                    logger.error(f"Retry failed for {notification.notification_id}: {e}")
        
        except Exception as e:
            logger.error(f"Error in retry failed notifications job: {e}")


# Global scheduler instance
_scheduler: Optional[DevScheduler] = None


def get_scheduler() -> DevScheduler:
    """Get or create scheduler instance"""
    global _scheduler
    if _scheduler is None:
        _scheduler = DevScheduler()
    return _scheduler


def start_scheduler() -> None:
    """Start the global scheduler"""
    scheduler = get_scheduler()
    scheduler.start()


def stop_scheduler() -> None:
    """Stop the global scheduler"""
    global _scheduler
    if _scheduler:
        _scheduler.stop()
        _scheduler = None
