"""Attachment API Routes - File upload and download"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..deps import get_current_user_dep, get_correlation_id_dep
from ...domain.models import ActorContext
from ...domain.errors import DomainError, AttachmentTooLargeError, InvalidMimeTypeError
from ...services.attachment_service import AttachmentService
from ...utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ============================================================================
# Response Models
# ============================================================================

class UploadResponse(BaseModel):
    """Upload response"""
    attachment_id: str
    original_filename: str
    size_bytes: int
    mime_type: str


class AttachmentInfo(BaseModel):
    """Attachment information"""
    attachment_id: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: str


# ============================================================================
# Routes
# ============================================================================

@router.get("/ticket/{ticket_id}")
async def get_attachments_for_ticket(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get all attachments for a ticket
    
    Returns attachments grouped by context (form, form_field, info_request, etc.)
    """
    try:
        service = AttachmentService()
        result = service.get_attachments_for_ticket(
            ticket_id=ticket_id,
            actor=actor
        )
        
        # Helper to safely serialize uploaded_at
        def serialize_uploaded_at(uploaded_at):
            if uploaded_at is None:
                return None
            if isinstance(uploaded_at, str):
                return uploaded_at  # Already serialized
            try:
                return uploaded_at.isoformat()
            except AttributeError:
                return str(uploaded_at) if uploaded_at else None
        
        # Convert attachments to serializable format
        return {
            "ticket_id": result["ticket_id"],
            "total_count": result["total_count"],
            "attachments": [
                {
                    "attachment_id": att.attachment_id,
                    "original_filename": att.original_filename,
                    "mime_type": att.mime_type,
                    "size_bytes": att.size_bytes,
                    "uploaded_at": serialize_uploaded_at(att.uploaded_at),
                    "uploaded_by": {
                        "email": att.uploaded_by.email,
                        "display_name": att.uploaded_by.display_name
                    },
                    "context": att.context,
                    "field_label": att.field_label,
                    "step_id": att.ticket_step_id,
                    "ticket_step_id": att.ticket_step_id,
                    "step_name": att.step_name,
                    "description": att.description
                }
                for att in result["attachments"]
            ],
            "grouped": {
                ctx: [
                    {
                        "attachment_id": att.attachment_id,
                        "original_filename": att.original_filename,
                        "mime_type": att.mime_type,
                        "size_bytes": att.size_bytes,
                        "uploaded_at": serialize_uploaded_at(att.uploaded_at),
                        "uploaded_by": {
                            "email": att.uploaded_by.email,
                            "display_name": att.uploaded_by.display_name
                        },
                        "context": att.context,
                        "field_label": att.field_label,
                        "step_id": att.ticket_step_id,
                        "ticket_step_id": att.ticket_step_id,
                        "step_name": att.step_name,
                        "description": att.description
                    }
                    for att in atts
                ]
                for ctx, atts in result["grouped"].items()
            }
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/upload", response_model=UploadResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    ticket_id: str = None,
    ticket_step_id: str = None,
    context: str = "ticket",
    field_label: str = None,
    step_name: str = None,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Upload attachment
    
    Upload a file attachment. Can be associated with a ticket or step.
    Max size: 50MB per file.
    
    Context can be: ticket, form, form_field, info_request
    """
    try:
        service = AttachmentService()
        attachment = await service.upload_attachment(
            file=file,
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            context=context,
            field_label=field_label,
            step_name=step_name
        )
        
        logger.info(
            f"Uploaded attachment: {attachment.attachment_id}",
            extra={"attachment_id": attachment.attachment_id, "actor_email": actor.email}
        )
        
        return UploadResponse(
            attachment_id=attachment.attachment_id,
            original_filename=attachment.original_filename,
            size_bytes=attachment.size_bytes,
            mime_type=attachment.mime_type
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/upload-multiple")
async def upload_multiple(
    files: List[UploadFile] = File(...),
    ticket_id: str = None,
    ticket_step_id: str = None,
    context: str = "ticket",
    field_label: str = None,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Upload multiple attachments
    
    Upload multiple files at once.
    """
    try:
        service = AttachmentService()
        attachments = []
        errors = []
        
        for file in files:
            try:
                attachment = await service.upload_attachment(
                    file=file,
                    ticket_id=ticket_id,
                    ticket_step_id=ticket_step_id,
                    actor=actor,
                    context=context,
                    field_label=field_label
                )
                attachments.append({
                    "attachment_id": attachment.attachment_id,
                    "original_filename": attachment.original_filename,
                    "size_bytes": attachment.size_bytes,
                    "mime_type": attachment.mime_type,
                    "success": True
                })
            except DomainError as e:
                errors.append({
                    "filename": file.filename,
                    "error": e.to_dict(),
                    "success": False
                })
        
        return {
            "attachments": attachments,
            "errors": errors,
            "total_uploaded": len(attachments),
            "total_failed": len(errors)
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


class UpdateAttachmentRequest(BaseModel):
    """Request to update attachment metadata"""
    description: str = None
    ticket_step_id: str = None
    context: str = None
    step_name: str = None


@router.patch("/{attachment_id}")
async def update_attachment(
    attachment_id: str,
    request: UpdateAttachmentRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Update attachment metadata
    
    Updates description, step association, and context.
    """
    try:
        service = AttachmentService()
        
        # Build update dict from non-None values
        updates = {}
        if request.description is not None:
            updates["description"] = request.description
        if request.ticket_step_id is not None:
            updates["ticket_step_id"] = request.ticket_step_id
        if request.context is not None:
            updates["context"] = request.context
        if request.step_name is not None:
            updates["step_name"] = request.step_name
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        attachment = service.update_attachment(attachment_id, updates, actor)
        
        logger.info(
            f"Updated attachment: {attachment_id}",
            extra={"attachment_id": attachment_id, "actor_email": actor.email, "updates": list(updates.keys())}
        )
        
        return {
            "attachment_id": attachment.attachment_id,
            "updated": True,
            "fields_updated": list(updates.keys())
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Download attachment
    
    Only ticket participants can download attachments.
    """
    try:
        service = AttachmentService()
        attachment, file_stream = service.get_attachment(
            attachment_id=attachment_id,
            actor=actor
        )
        
        # Encode filename for Content-Disposition header (handle special characters)
        import urllib.parse
        encoded_filename = urllib.parse.quote(attachment.original_filename)
        
        return StreamingResponse(
            file_stream,
            media_type=attachment.mime_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(attachment.size_bytes),
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
                "Cache-Control": "no-cache",
            }
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# Alias for backward compatibility - also serve download at /{attachment_id}
@router.get("/{attachment_id}", include_in_schema=False)
async def download_attachment_legacy(
    attachment_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Legacy download endpoint - redirects to /download"""
    return await download_attachment(attachment_id, actor, correlation_id)


@router.get("/{attachment_id}/info", response_model=AttachmentInfo)
async def get_attachment_info(
    attachment_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get attachment info
    
    Get attachment metadata without downloading.
    """
    try:
        service = AttachmentService()
        attachment = service.get_attachment_info(
            attachment_id=attachment_id,
            actor=actor
        )
        
        return AttachmentInfo(
            attachment_id=attachment.attachment_id,
            original_filename=attachment.original_filename,
            mime_type=attachment.mime_type,
            size_bytes=attachment.size_bytes,
            uploaded_at=attachment.uploaded_at.isoformat()
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Delete attachment
    
    Only the uploader or admin can delete.
    """
    try:
        service = AttachmentService()
        service.delete_attachment(
            attachment_id=attachment_id,
            actor=actor
        )
        
        return {"message": "Attachment deleted"}
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

