"""User Notifications API - In-app notification bell endpoints"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from ..deps import get_current_user_dep
from ...domain.models import ActorContext, InAppNotification
from ...domain.enums import InAppNotificationCategory
from ...repositories.inapp_notification_repo import InAppNotificationRepository
from ...utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


# =============================================================================
# Response Models
# =============================================================================

class NotificationResponse(BaseModel):
    """Single notification response"""
    notification_id: str
    category: str
    title: str
    message: str
    ticket_id: Optional[str] = None
    action_url: Optional[str] = None
    actor_email: Optional[str] = None
    actor_display_name: Optional[str] = None
    is_read: bool
    created_at: str
    

class NotificationListResponse(BaseModel):
    """List of notifications with metadata"""
    items: List[NotificationResponse]
    unread_count: int
    total: int


class UnreadCountResponse(BaseModel):
    """Just the unread count"""
    unread_count: int


class MarkReadResponse(BaseModel):
    """Response after marking notifications read"""
    success: bool
    marked_count: int


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    category: Optional[InAppNotificationCategory] = Query(None),
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get notifications for the current user.
    
    - Sorted by newest first
    - Supports filtering by unread only
    - Supports filtering by category
    """
    repo = InAppNotificationRepository()
    
    notifications = repo.get_notifications_for_user(
        email=actor.email,
        skip=skip,
        limit=limit,
        unread_only=unread_only,
        category=category
    )
    
    unread_count = repo.get_unread_count(actor.email)
    
    # Get total count (without pagination)
    all_notifications = repo.get_notifications_for_user(
        email=actor.email,
        skip=0,
        limit=1000,  # Cap at reasonable number
        unread_only=unread_only,
        category=category
    )
    
    return NotificationListResponse(
        items=[
            NotificationResponse(
                notification_id=n.notification_id,
                category=n.category.value,
                title=n.title,
                message=n.message,
                ticket_id=n.ticket_id,
                action_url=n.action_url,
                actor_email=n.actor_email,
                actor_display_name=n.actor_display_name,
                is_read=n.is_read,
                created_at=n.created_at.isoformat()
            )
            for n in notifications
        ],
        unread_count=unread_count,
        total=len(all_notifications)
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get just the unread notification count.
    
    This is a lightweight endpoint for polling the notification badge.
    """
    repo = InAppNotificationRepository()
    count = repo.get_unread_count(actor.email)
    
    return UnreadCountResponse(unread_count=count)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Mark a single notification as read.
    """
    repo = InAppNotificationRepository()
    
    try:
        notification = repo.mark_as_read(notification_id, actor.email)
        
        return NotificationResponse(
            notification_id=notification.notification_id,
            category=notification.category.value,
            title=notification.title,
            message=notification.message,
            ticket_id=notification.ticket_id,
            action_url=notification.action_url,
            actor_email=notification.actor_email,
            actor_display_name=notification.actor_display_name,
            is_read=notification.is_read,
            created_at=notification.created_at.isoformat()
        )
    except Exception as e:
        logger.warning(f"Failed to mark notification as read: {e}")
        raise HTTPException(status_code=404, detail="Notification not found")


@router.post("/read-all", response_model=MarkReadResponse)
async def mark_all_read(
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Mark all notifications as read for the current user.
    """
    repo = InAppNotificationRepository()
    count = repo.mark_all_as_read(actor.email)
    
    return MarkReadResponse(success=True, marked_count=count)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Delete a single notification.
    """
    repo = InAppNotificationRepository()
    deleted = repo.delete_notification(notification_id, actor.email)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"success": True, "deleted": notification_id}
