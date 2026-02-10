"""Notification Service - Email sending via Graph API

Uses beautiful, professional HTML email templates for all notifications.
"""
from typing import Any, Dict, List, Optional
import httpx
from datetime import datetime

from ..domain.models import NotificationOutbox, UserSnapshot
from ..domain.enums import NotificationStatus, NotificationType, NotificationTemplateKey, InAppNotificationCategory
from ..domain.errors import EmailSendError
from ..repositories.notification_repo import NotificationRepository
from ..repositories.admin_repo import AdminRepository
from ..repositories.inapp_notification_repo import InAppNotificationRepository
from ..templates import get_email_template
from ..config.settings import settings
from ..utils.idgen import generate_notification_id
from ..utils.time import utc_now
from ..utils.logger import get_logger

logger = get_logger(__name__)


class NotificationService:
    """Service for sending notifications"""
    
    GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
    
    # Mapping from template key to in-app notification category
    TEMPLATE_TO_CATEGORY = {
        NotificationTemplateKey.TICKET_CREATED: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.APPROVAL_PENDING: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.APPROVAL_REASSIGNED: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.APPROVED: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.REJECTED: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.SKIPPED: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.INFO_REQUESTED: InAppNotificationCategory.INFO_REQUEST,
        NotificationTemplateKey.INFO_RESPONDED: InAppNotificationCategory.INFO_REQUEST,
        NotificationTemplateKey.FORM_PENDING: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.TASK_ASSIGNED: InAppNotificationCategory.TASK,
        NotificationTemplateKey.TASK_REASSIGNED: InAppNotificationCategory.TASK,
        NotificationTemplateKey.TASK_COMPLETED: InAppNotificationCategory.TASK,
        NotificationTemplateKey.NOTE_ADDED: InAppNotificationCategory.TASK,
        NotificationTemplateKey.REQUESTER_NOTE_ADDED: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.SLA_REMINDER: InAppNotificationCategory.SYSTEM,
        NotificationTemplateKey.SLA_ESCALATION: InAppNotificationCategory.SYSTEM,
        NotificationTemplateKey.TICKET_CANCELLED: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.TICKET_COMPLETED: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.LOOKUP_USER_ASSIGNED: InAppNotificationCategory.TICKET,
        # Change Request notifications
        NotificationTemplateKey.CHANGE_REQUEST_PENDING: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.CHANGE_REQUEST_SUBMITTED: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.CHANGE_REQUEST_APPROVED: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.CHANGE_REQUEST_REJECTED: InAppNotificationCategory.APPROVAL,
        NotificationTemplateKey.CHANGE_REQUEST_CANCELLED: InAppNotificationCategory.TICKET,
        NotificationTemplateKey.CHANGE_REQUEST_WORKFLOW_PAUSED: InAppNotificationCategory.SYSTEM,
        NotificationTemplateKey.CHANGE_REQUEST_WORKFLOW_RESUMED: InAppNotificationCategory.SYSTEM,
    }
    
    def __init__(self):
        self.repo = NotificationRepository()
        self.inapp_repo = InAppNotificationRepository()
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
    
    # =========================================================================
    # In-App Notification Helper
    # =========================================================================
    
    def _create_inapp_notification(
        self,
        template_key: NotificationTemplateKey,
        recipient_email: str,
        title: str,
        message: str,
        ticket_id: Optional[str] = None,
        action_url: Optional[str] = None,
        actor_email: Optional[str] = None,
        actor_display_name: Optional[str] = None
    ) -> None:
        """
        Create an in-app notification for the notification bell.
        
        This is called alongside email notifications.
        """
        try:
            category = self.TEMPLATE_TO_CATEGORY.get(
                template_key, 
                InAppNotificationCategory.SYSTEM
            )
            
            self.inapp_repo.create_notification(
                recipient_email=recipient_email,
                category=category,
                title=title,
                message=message,
                ticket_id=ticket_id,
                action_url=action_url,
                actor_email=actor_email,
                actor_display_name=actor_display_name
            )
        except Exception as e:
            # Don't fail the main notification if in-app fails
            logger.warning(f"Failed to create in-app notification: {e}")
    
    # =========================================================================
    # Outbox Creation
    # =========================================================================
    
    def enqueue_notification(
        self,
        template_key: NotificationTemplateKey,
        recipients: List[str],
        payload: Dict[str, Any],
        ticket_id: Optional[str] = None
    ) -> NotificationOutbox:
        """
        Enqueue a notification for sending
        
        Notifications are stored in outbox and sent asynchronously.
        """
        notification = NotificationOutbox(
            notification_id=generate_notification_id(),
            ticket_id=ticket_id,
            notification_type=NotificationType.EMAIL,
            template_key=template_key,
            recipients=recipients,
            payload=payload,
            status=NotificationStatus.PENDING,
            created_at=utc_now()
        )
        
        return self.repo.create_notification(notification)
    
    def enqueue_ticket_created(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        workflow_name: str,
        workflow_id: str = None
    ) -> NotificationOutbox:
        """Enqueue ticket created notification"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.TICKET_CREATED,
            recipient_email=requester_email,
            title="Ticket Created",
            message=f"Your request '{ticket_title}' has been submitted successfully.",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}"
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.TICKET_CREATED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id
            },
            ticket_id=ticket_id
        )
    
    def enqueue_approval_pending(
        self,
        ticket_id: str,
        approver_email: str,
        ticket_title: str,
        requester_name: str,
        branch_name: Optional[str] = None,
        step_name: Optional[str] = None,
        workflow_name: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> NotificationOutbox:
        """Enqueue approval pending notification"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.APPROVAL_PENDING,
            recipient_email=approver_email,
            title="Approval Required",
            message=f"{requester_name} needs your approval for '{ticket_title}'.",
            ticket_id=ticket_id,
            action_url=f"/manager/approvals",
            actor_display_name=requester_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.APPROVAL_PENDING,
            recipients=[approver_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "requester_name": requester_name,
                "branch_name": branch_name,
                "step_name": step_name,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id
            },
            ticket_id=ticket_id
        )
    
    def enqueue_approval_reassigned(
        self,
        ticket_id: str,
        new_approver_email: str,
        ticket_title: str,
        reassigned_by_name: str,
        reason: Optional[str] = None
    ) -> NotificationOutbox:
        """Enqueue approval reassigned notification to the new approver"""
        # Create in-app notification
        reason_text = f" Reason: {reason}" if reason else ""
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.APPROVAL_REASSIGNED,
            recipient_email=new_approver_email,
            title="Approval Reassigned to You",
            message=f"{reassigned_by_name} has reassigned '{ticket_title}' for your approval.{reason_text}",
            ticket_id=ticket_id,
            action_url=f"/manager/approvals",
            actor_display_name=reassigned_by_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.APPROVAL_REASSIGNED,
            recipients=[new_approver_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "reassigned_by_name": reassigned_by_name,
                "reason": reason
            },
            ticket_id=ticket_id
        )
    
    def enqueue_approved(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        approver_name: str,
        workflow_name: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> NotificationOutbox:
        """Enqueue approved notification"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.APPROVED,
            recipient_email=requester_email,
            title="Request Approved",
            message=f"Your request '{ticket_title}' has been approved by {approver_name}.",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}",
            actor_display_name=approver_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.APPROVED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "approver_name": approver_name,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id
            },
            ticket_id=ticket_id
        )
    
    def enqueue_rejected(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        approver_name: str,
        reason: Optional[str] = None,
        workflow_name: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> NotificationOutbox:
        """Enqueue rejected notification"""
        # Create in-app notification
        reason_text = f" Reason: {reason}" if reason else ""
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.REJECTED,
            recipient_email=requester_email,
            title="Request Rejected",
            message=f"Your request '{ticket_title}' has been rejected by {approver_name}.{reason_text}",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}",
            actor_display_name=approver_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.REJECTED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "approver_name": approver_name,
                "reason": reason,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id
            },
            ticket_id=ticket_id
        )
    
    def enqueue_skipped(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        approver_name: str,
        reason: Optional[str] = None,
        workflow_name: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> NotificationOutbox:
        """Enqueue skipped notification (workflow was skipped by approver)"""
        # Create in-app notification
        reason_text = f" Reason: {reason}" if reason else ""
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.SKIPPED,
            recipient_email=requester_email,
            title="Request Skipped",
            message=f"Your request '{ticket_title}' has been skipped by {approver_name}.{reason_text}",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}",
            actor_display_name=approver_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.SKIPPED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "approver_name": approver_name,
                "reason": reason,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id
            },
            ticket_id=ticket_id
        )
    
    def enqueue_info_requested(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        requestor_name: str,
        question: str,
        subject: str = None,
        attachment_count: int = 0
    ) -> NotificationOutbox:
        """Enqueue info requested notification"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.INFO_REQUESTED,
            recipient_email=requester_email,
            title="Information Requested",
            message=f"{requestor_name} has requested information on '{ticket_title}': {question[:100]}...",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}",
            actor_display_name=requestor_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.INFO_REQUESTED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "requestor_name": requestor_name,
                "question": question,
                "subject": subject,
                "attachment_count": attachment_count
            },
            ticket_id=ticket_id
        )
    
    def enqueue_info_responded(
        self,
        ticket_id: str,
        recipient_email: str,
        ticket_title: str,
        responder_name: str,
        response_summary: str
    ) -> NotificationOutbox:
        """Enqueue info responded notification - notifies the person who asked"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.INFO_RESPONDED,
            recipient_email=recipient_email,
            title="Information Provided",
            message=f"{responder_name} has responded to your query on '{ticket_title}'.",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}",
            actor_display_name=responder_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.INFO_RESPONDED,
            recipients=[recipient_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "responder_name": responder_name,
                "response_summary": response_summary
            },
            ticket_id=ticket_id
        )
    
    def enqueue_task_assigned(
        self,
        ticket_id: str,
        agent_email: str,
        ticket_title: str,
        assigned_by_name: str
    ) -> NotificationOutbox:
        """Enqueue task assigned notification"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.TASK_ASSIGNED,
            recipient_email=agent_email,
            title="New Task Assigned",
            message=f"{assigned_by_name} has assigned you a task: '{ticket_title}'.",
            ticket_id=ticket_id,
            action_url=f"/agent/tasks",
            actor_display_name=assigned_by_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.TASK_ASSIGNED,
            recipients=[agent_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "assigned_by_name": assigned_by_name
            },
            ticket_id=ticket_id
        )
    
    def enqueue_task_reassigned(
        self,
        ticket_id: str,
        new_agent_email: str,
        ticket_title: str,
        reassigned_by_name: str,
        previous_agent_email: Optional[str] = None,
        reason: Optional[str] = None
    ) -> NotificationOutbox:
        """Enqueue task reassigned notification to new agent"""
        # Create in-app notification
        message = f"{reassigned_by_name} has reassigned a task to you: '{ticket_title}'."
        if reason:
            message += f" Reason: {reason}"
        
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.TASK_REASSIGNED,
            recipient_email=new_agent_email,
            title="Task Reassigned to You",
            message=message,
            ticket_id=ticket_id,
            action_url=f"/agent/tasks",
            actor_display_name=reassigned_by_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.TASK_REASSIGNED,
            recipients=[new_agent_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "previous_agent": previous_agent_email or "",
                "new_agent": new_agent_email,
                "reassigned_by": reassigned_by_name,
                "reason": reason or ""
            },
            ticket_id=ticket_id
        )
    
    def enqueue_lookup_user_assigned(
        self,
        ticket_id: str,
        ticket_title: str,
        user_email: str,
        user_display_name: str,
        is_primary: bool,
        assigned_by_name: str,
        workflow_name: str
    ) -> NotificationOutbox:
        """Enqueue notification to users from LOOKUP_USER_SELECT fields when ticket is created"""
        role_text = "primary contact" if is_primary else "secondary contact"
        
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.LOOKUP_USER_ASSIGNED,
            recipient_email=user_email,
            title="You've been assigned to a ticket",
            message=f"You've been assigned as {role_text} for '{ticket_title}' by {assigned_by_name}.",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}",
            actor_display_name=assigned_by_name
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.LOOKUP_USER_ASSIGNED,
            recipients=[user_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "user_name": user_display_name,
                "is_primary": is_primary,
                "assigned_by": assigned_by_name,
                "workflow_name": workflow_name
            },
            ticket_id=ticket_id
        )
    
    def enqueue_note_added(
        self,
        ticket_id: str,
        ticket_title: str,
        step_name: str,
        step_type: str,
        note_author: str,
        note_preview: str,
        recipient_emails: List[str]
    ) -> Optional[NotificationOutbox]:
        """Enqueue note added notification to relevant parties (assigned agent, manager, etc.)"""
        if not recipient_emails:
            return None
        
        # Create in-app notifications for each recipient
        for recipient_email in recipient_emails:
            self._create_inapp_notification(
                template_key=NotificationTemplateKey.NOTE_ADDED,
                recipient_email=recipient_email,
                title="New Note Added",
                message=f"{note_author} added a note to '{step_name}'.",
                ticket_id=ticket_id,
                action_url=f"/tickets/{ticket_id}?tab=activity",
                actor_display_name=note_author
            )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.NOTE_ADDED,
            recipients=recipient_emails,
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "step_name": step_name,
                "step_type": step_type,
                "note_author": note_author,
                "note_preview": note_preview
            },
            ticket_id=ticket_id
        )
    
    def enqueue_requester_note_added(
        self,
        ticket_id: str,
        ticket_title: str,
        requester_name: str,
        note_preview: str,
        recipient_emails: List[str]
    ) -> Optional[NotificationOutbox]:
        """Enqueue requester note notification to current step assignees"""
        if not recipient_emails:
            return None
        
        # Create in-app notifications for each recipient
        for recipient_email in recipient_emails:
            self._create_inapp_notification(
                template_key=NotificationTemplateKey.REQUESTER_NOTE_ADDED,
                recipient_email=recipient_email,
                title="Requester Added Note",
                message=f"The requester ({requester_name}) added a note to ticket '{ticket_title}'.",
                ticket_id=ticket_id,
                action_url=f"/tickets/{ticket_id}?tab=messages",
                actor_display_name=requester_name
            )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.REQUESTER_NOTE_ADDED,
            recipients=recipient_emails,
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "requester_name": requester_name,
                "note_preview": note_preview
            },
            ticket_id=ticket_id
        )
    
    def enqueue_ticket_completed(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str
    ) -> NotificationOutbox:
        """Enqueue ticket completed notification to requester"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.TICKET_COMPLETED,
            recipient_email=requester_email,
            title="Request Completed",
            message=f"Your request '{ticket_title}' has been completed.",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}"
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.TICKET_COMPLETED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title
            },
            ticket_id=ticket_id
        )
    
    def enqueue_ticket_rejected(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        reason: str
    ) -> NotificationOutbox:
        """Enqueue ticket rejected notification to requester"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.REJECTED,
            recipient_email=requester_email,
            title="Request Rejected",
            message=f"Your request '{ticket_title}' has been rejected. Reason: {reason}",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}"
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.REJECTED,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "reason": reason
            },
            ticket_id=ticket_id
        )
    
    def enqueue_form_pending(
        self,
        ticket_id: str,
        requester_email: str,
        ticket_title: str,
        form_name: str
    ) -> NotificationOutbox:
        """Enqueue form pending notification to requester for mid-workflow forms"""
        # Create in-app notification
        self._create_inapp_notification(
            template_key=NotificationTemplateKey.FORM_PENDING,
            recipient_email=requester_email,
            title="Form Required",
            message=f"Please complete the '{form_name}' form for your request '{ticket_title}'.",
            ticket_id=ticket_id,
            action_url=f"/tickets/{ticket_id}"
        )
        
        return self.enqueue_notification(
            template_key=NotificationTemplateKey.FORM_PENDING,
            recipients=[requester_email],
            payload={
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "form_name": form_name
            },
            ticket_id=ticket_id
        )
    
    # =========================================================================
    # Email Sending
    # =========================================================================
    
    async def send_notification(self, notification: NotificationOutbox) -> bool:
        """
        Send a single notification via email.
        
        NOTE: Locking is now handled by the scheduler before calling this method.
        This allows for cleaner separation of concerns:
        - Scheduler: handles distributed locking across multiple servers
        - NotificationService: handles the actual email sending logic
        
        Returns True if sent successfully, False otherwise.
        """
        start_time = utc_now()
        
        try:
            # Build email content from template
            email_content = self._build_email_content(notification)
            
            # Send via Graph API
            await self._send_email_via_graph(
                recipients=notification.recipients,
                subject=email_content["subject"],
                body=email_content["body"]
            )
            
            # Mark as sent in database
            self.repo.mark_sent(notification.notification_id)
            
            # Calculate processing time
            processing_time_ms = (utc_now() - start_time).total_seconds() * 1000
            
            logger.info(
                f"Sent notification: {notification.notification_id}",
                extra={
                    "notification_id": notification.notification_id,
                    "template": notification.template_key.value,
                    "recipients_count": len(notification.recipients),
                    "processing_time_ms": round(processing_time_ms, 2),
                    "retry_count": notification.retry_count
                }
            )
            
            return True
            
        except Exception as e:
            # Mark as failed with retry (exponential backoff is handled in repo)
            self.repo.mark_failed(notification.notification_id, str(e))
            
            logger.error(
                f"Failed to send notification: {notification.notification_id}",
                extra={
                    "notification_id": notification.notification_id,
                    "template": notification.template_key.value,
                    "error_type": type(e).__name__,
                    "error": str(e),
                    "retry_count": notification.retry_count + 1
                }
            )
            return False
    
    def _build_email_content(self, notification: NotificationOutbox) -> Dict[str, str]:
        """
        Build email subject and body from beautiful HTML template
        
        Checks for admin-customized templates first, then falls back to
        professional default templates. Templates are designed to look 
        great in all email clients with responsive design and branding.
        """
        # Get frontend URL for action buttons
        app_url = settings.frontend_url
        
        # First check for admin customization
        try:
            admin_repo = AdminRepository()
            override = admin_repo.get_email_template_override(
                template_key=notification.template_key.value,
                workflow_id=notification.payload.get("workflow_id")
            )
            
            if override and override.is_active:
                # Use customized template
                default_content = get_email_template(
                    template_key=notification.template_key.value,
                    payload=notification.payload,
                    app_url=app_url
                )
                
                subject = override.custom_subject or default_content["subject"]
                body = override.custom_body or default_content["body"]
                
                # Apply variable substitution to custom templates
                for key, value in notification.payload.items():
                    subject = subject.replace(f"{{{{{key}}}}}", str(value))
                    body = body.replace(f"{{{{{key}}}}}", str(value))
                
                logger.debug(
                    f"Using customized template for {notification.template_key.value}",
                    extra={"override_id": override.template_id}
                )
                
                return {"subject": subject, "body": body}
                
        except Exception as e:
            logger.warning(f"Error checking template override: {e}")
        
        # Fall back to beautiful default templates
        return get_email_template(
            template_key=notification.template_key.value,
            payload=notification.payload,
            app_url=app_url
        )
    
    async def _send_email_via_graph(
        self,
        recipients: List[str],
        subject: str,
        body: str
    ) -> None:
        """Send email using Microsoft Graph API with service mailbox (ROPC)"""
        # Get access token
        access_token = await self._get_access_token()
        
        # Build email message
        message = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": body
                },
                "toRecipients": [
                    {"emailAddress": {"address": email}}
                    for email in recipients
                ]
            },
            "saveToSentItems": False
        }
        
        # Send email
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.GRAPH_BASE_URL}/me/sendMail",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json=message
            )
            
            if response.status_code not in [200, 202]:
                raise EmailSendError(
                    f"Graph API error: {response.status_code}",
                    details={"response": response.text}
                )
    
    async def _get_access_token(self) -> str:
        """
        Get access token for service mailbox using ROPC
        
        Note: ROPC is used for service mailbox with username/password.
        Token is cached until expiry.
        """
        # Check cache
        if self._access_token and self._token_expiry:
            if utc_now() < self._token_expiry:
                return self._access_token
        
        # Request new token using ROPC
        token_url = f"https://login.microsoftonline.com/{settings.aad_tenant_id}/oauth2/v2.0/token"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data={
                    "client_id": settings.aad_client_id,
                    "client_secret": settings.aad_client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                    "username": settings.service_mailbox_email,
                    "password": settings.service_mailbox_password,
                    "grant_type": "password"
                }
            )
            
            if response.status_code != 200:
                raise EmailSendError(
                    f"Failed to get access token: {response.status_code}",
                    details={"response": response.text}
                )
            
            token_data = response.json()
            self._access_token = token_data["access_token"]
            
            # Set expiry (with some buffer)
            from datetime import timedelta
            expires_in = token_data.get("expires_in", 3600)
            self._token_expiry = utc_now() + timedelta(seconds=expires_in - 300)
            
            return self._access_token

