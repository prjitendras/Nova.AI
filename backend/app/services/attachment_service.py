"""Attachment Service - File upload and download"""
import os
import uuid
from typing import Any, BinaryIO, Dict, Optional, Tuple
from fastapi import UploadFile

from ..domain.models import Attachment, ActorContext, UserSnapshot
from ..domain.errors import (
    AttachmentTooLargeError, InvalidMimeTypeError, AttachmentNotFoundError,
    PermissionDeniedError, NotFoundError
)
from ..repositories.attachment_repo import AttachmentRepository
from ..repositories.ticket_repo import TicketRepository
from ..config.settings import settings
from ..utils.idgen import generate_attachment_id
from ..utils.time import utc_now
from ..utils.logger import get_logger

logger = get_logger(__name__)


class AttachmentService:
    """Service for attachment operations"""
    
    def __init__(self):
        self.attachment_repo = AttachmentRepository()
        self.ticket_repo = TicketRepository()
        self._ensure_storage_dir()
    
    def _ensure_storage_dir(self):
        """Ensure storage directory exists"""
        os.makedirs(settings.attachments_base_path, exist_ok=True)
    
    async def upload_attachment(
        self,
        file: UploadFile,
        ticket_id: Optional[str],
        ticket_step_id: Optional[str],
        actor: ActorContext,
        context: str = "ticket",
        field_label: Optional[str] = None,
        step_name: Optional[str] = None
    ) -> Attachment:
        """
        Upload attachment
        
        Validates size and mime type before saving.
        """
        # Validate mime type
        content_type = file.content_type or "application/octet-stream"
        if content_type not in settings.allowed_mime_types_list:
            raise InvalidMimeTypeError(
                f"File type {content_type} is not allowed",
                details={
                    "mime_type": content_type,
                    "allowed": settings.allowed_mime_types_list
                }
            )
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        # Validate size
        if file_size > settings.attachments_max_bytes:
            raise AttachmentTooLargeError(
                f"File exceeds maximum size of {settings.attachments_max_mb}MB",
                details={
                    "size_bytes": file_size,
                    "max_bytes": settings.attachments_max_bytes
                }
            )
        
        # Generate IDs and paths
        attachment_id = generate_attachment_id()
        original_filename = file.filename or "unnamed"
        
        # Sanitize filename
        safe_filename = self._sanitize_filename(original_filename)
        stored_filename = f"{attachment_id}_{safe_filename}"
        
        # Create directory for ticket if provided
        if ticket_id:
            storage_dir = os.path.join(settings.attachments_base_path, ticket_id)
            os.makedirs(storage_dir, exist_ok=True)
            storage_path = os.path.join(storage_dir, stored_filename)
            relative_path = os.path.join(ticket_id, stored_filename)
        else:
            # Store in temp location if no ticket yet
            storage_dir = os.path.join(settings.attachments_base_path, "temp")
            os.makedirs(storage_dir, exist_ok=True)
            storage_path = os.path.join(storage_dir, stored_filename)
            relative_path = os.path.join("temp", stored_filename)
        
        try:
            # Write file
            with open(storage_path, "wb") as f:
                f.write(content)
            
            # Create attachment record
            attachment = Attachment(
                attachment_id=attachment_id,
                ticket_id=ticket_id or "",
                ticket_step_id=ticket_step_id,
                step_name=step_name,
                original_filename=original_filename,
                stored_filename=stored_filename,
                mime_type=content_type,
                size_bytes=file_size,
                uploaded_by=UserSnapshot(
                    aad_id=actor.aad_id,
                    email=actor.email,
                    display_name=actor.display_name
                ),
                uploaded_at=utc_now(),
                storage_path=relative_path,
                context=context,
                field_label=field_label
            )
            
            self.attachment_repo.create_attachment(attachment)
            
            logger.info(
                f"Uploaded attachment: {attachment_id}",
                extra={
                    "attachment_id": attachment_id,
                    "size_bytes": file_size,
                    "actor_email": actor.email
                }
            )
            
            return attachment
            
        except Exception as e:
            # Cleanup on failure
            if os.path.exists(storage_path):
                os.remove(storage_path)
            logger.error(f"Failed to upload attachment: {e}")
            raise
    
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for storage"""
        # Remove directory separators and dangerous characters
        safe = filename.replace("/", "_").replace("\\", "_").replace("..", "_")
        # Limit length
        if len(safe) > 100:
            name, ext = os.path.splitext(safe)
            safe = name[:96] + ext
        return safe
    
    def _file_iterator(self, file_path: str, chunk_size: int = 1024 * 1024):
        """
        Generator that yields file in chunks for memory-efficient streaming.
        Default chunk size is 1MB.
        """
        with open(file_path, "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk
    
    def get_attachment(
        self,
        attachment_id: str,
        actor: ActorContext
    ) -> Tuple[Attachment, any]:
        """
        Get attachment for download
        
        Returns attachment metadata and file iterator for streaming.
        
        Permission: Anyone who can view the ticket can download its attachments.
        This is aligned with ticket viewing permissions which allow all authenticated
        users to view tickets (for global search functionality).
        """
        attachment = self.attachment_repo.get_attachment_or_raise(attachment_id)
        
        # Verify the ticket exists (but don't restrict download)
        if attachment.ticket_id:
            ticket = self.ticket_repo.get_ticket(attachment.ticket_id)
            if not ticket:
                raise NotFoundError(
                    "Associated ticket not found",
                    details={"attachment_id": attachment_id, "ticket_id": attachment.ticket_id}
                )
        
        # Get file path
        file_path = os.path.join(settings.attachments_base_path, attachment.storage_path)
        
        if not os.path.exists(file_path):
            raise AttachmentNotFoundError(
                f"Attachment file not found",
                details={"attachment_id": attachment_id}
            )
        
        # Return file iterator for memory-efficient streaming
        file_iterator = self._file_iterator(file_path)
        return attachment, file_iterator
    
    def get_attachment_info(
        self,
        attachment_id: str,
        actor: ActorContext
    ) -> Attachment:
        """Get attachment metadata"""
        attachment = self.attachment_repo.get_attachment_or_raise(attachment_id)
        
        # TODO: Add permission check similar to get_attachment
        
        return attachment
    
    def update_attachment(
        self,
        attachment_id: str,
        updates: Dict[str, Any],
        actor: ActorContext
    ) -> Attachment:
        """
        Update attachment metadata
        
        Allowed fields: description, ticket_step_id, context, step_name
        """
        attachment = self.attachment_repo.get_attachment_or_raise(attachment_id)
        
        # Permission check - must be uploader or ticket participant
        can_update = self._is_same_user(actor, attachment.uploaded_by)
        
        if not can_update and attachment.ticket_id:
            ticket = self.ticket_repo.get_ticket(attachment.ticket_id)
            if ticket:
                can_update = (
                    self._is_same_user(actor, ticket.requester) or
                    self._is_same_user(actor, ticket.manager_snapshot)
                )
        
        if not can_update:
            raise PermissionDeniedError(
                "You cannot update this attachment",
                details={"attachment_id": attachment_id}
            )
        
        # Filter to allowed update fields
        allowed_fields = {"description", "ticket_step_id", "context", "step_name"}
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}
        
        if not filtered_updates:
            return attachment
        
        # Update in repository
        updated = self.attachment_repo.update_attachment(attachment_id, filtered_updates)
        
        logger.info(
            f"Updated attachment metadata: {attachment_id}",
            extra={
                "attachment_id": attachment_id,
                "actor_email": actor.email,
                "updates": list(filtered_updates.keys())
            }
        )
        
        return updated
    
    def delete_attachment(
        self,
        attachment_id: str,
        actor: ActorContext
    ) -> None:
        """
        Delete attachment
        
        Only uploader or admin can delete.
        """
        attachment = self.attachment_repo.get_attachment_or_raise(attachment_id)
        
        # Check permission
        if attachment.uploaded_by.email != actor.email:
            # TODO: Also allow admin
            raise PermissionDeniedError(
                "You can only delete attachments you uploaded",
                details={"attachment_id": attachment_id}
            )
        
        # Delete file
        file_path = os.path.join(settings.attachments_base_path, attachment.storage_path)
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # Delete record
        self.attachment_repo.delete_attachment(attachment_id)
        
        logger.info(
            f"Deleted attachment: {attachment_id}",
            extra={"attachment_id": attachment_id, "actor_email": actor.email}
        )
    
    def move_temp_attachment(
        self,
        attachment_id: str,
        ticket_id: str
    ) -> Attachment:
        """
        Move attachment from temp to ticket directory
        
        Called after ticket creation.
        """
        logger.info(f"Attempting to link attachment {attachment_id} to ticket {ticket_id}")
        
        attachment = self.attachment_repo.get_attachment_or_raise(attachment_id)
        
        # Check if already has a non-empty ticket_id
        if attachment.ticket_id and attachment.ticket_id != "":
            logger.info(f"Attachment {attachment_id} already linked to ticket {attachment.ticket_id}")
            return attachment
        
        # Move file
        old_path = os.path.join(settings.attachments_base_path, attachment.storage_path)
        new_dir = os.path.join(settings.attachments_base_path, ticket_id)
        os.makedirs(new_dir, exist_ok=True)
        new_path = os.path.join(new_dir, attachment.stored_filename)
        new_relative_path = os.path.join(ticket_id, attachment.stored_filename)
        
        logger.info(f"Moving attachment file from {old_path} to {new_path}")
        
        if os.path.exists(old_path):
            os.rename(old_path, new_path)
            logger.info(f"File moved successfully")
        else:
            logger.warning(f"Source file not found at {old_path}, skipping move but updating DB")
        
        # Update record
        updated = self.attachment_repo.update_attachment(
            attachment_id,
            {
                "ticket_id": ticket_id,
                "storage_path": new_relative_path
            }
        )
        
        logger.info(f"Attachment {attachment_id} successfully linked to ticket {ticket_id}")
        return updated
    
    def _is_same_user(self, actor: ActorContext, user_snapshot) -> bool:
        """Check if actor matches user snapshot (by aad_id or email)"""
        if not user_snapshot:
            return False
        # Primary: match by aad_id (most reliable)
        if actor.aad_id and hasattr(user_snapshot, 'aad_id') and user_snapshot.aad_id:
            if actor.aad_id == user_snapshot.aad_id:
                return True
        # Fallback: match by email (case-insensitive)
        if hasattr(user_snapshot, 'email') and user_snapshot.email:
            if actor.email.lower() == user_snapshot.email.lower():
                return True
        return False
    
    def get_attachments_for_ticket(
        self,
        ticket_id: str,
        actor: ActorContext
    ) -> dict:
        """
        Get all attachments for a ticket
        
        Returns attachments grouped by context.
        
        Permission: Anyone who can view the ticket can view its attachments.
        This is aligned with ticket viewing permissions which allow all authenticated
        users to view tickets (for global search functionality).
        """
        # Verify ticket exists
        ticket = self.ticket_repo.get_ticket(ticket_id)
        if not ticket:
            raise NotFoundError(
                f"Ticket not found",
                details={"ticket_id": ticket_id}
            )
        
        # Permission: If user can view the ticket, they can view attachments.
        # Currently ticket viewing is open to all authenticated users.
        # No additional permission check needed here.
        
        # Get all attachments for ticket
        attachments = self.attachment_repo.get_attachments_for_ticket(ticket_id)
        
        # Group by step_name + context (so different steps have separate categories)
        # Key format: "step_name::context" or just "context" if no step_name
        grouped = {}
        for att in attachments:
            ctx = att.context or "ticket"
            # For approval_note and task_note, use step_name to create unique categories
            if ctx in ('approval_note', 'task_note') and att.step_name:
                group_key = f"{att.step_name}::{ctx}"
            else:
                group_key = ctx
            
            if group_key not in grouped:
                grouped[group_key] = []
            grouped[group_key].append(att)
        
        return {
            "ticket_id": ticket_id,
            "total_count": len(attachments),
            "attachments": attachments,
            "grouped": grouped
        }

