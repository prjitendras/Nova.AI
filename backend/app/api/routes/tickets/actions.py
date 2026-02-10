"""
Ticket Actions Routes

Core action endpoints for ticket steps:
- Submit form
- Approve/Reject
- Complete task
- Add note
"""

from fastapi import APIRouter, Depends, HTTPException

from ...deps import get_current_user_dep, get_correlation_id_dep
from ....domain.models import ActorContext
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....utils.logger import get_logger
from .schemas import (
    SubmitFormRequest, ApprovalRequest, ReassignApprovalRequest, CompleteTaskRequest,
    AddNoteRequest, AddRequesterNoteRequest, SaveDraftRequest, ActionResponse
)

logger = get_logger(__name__)
router = APIRouter()


@router.post("/{ticket_id}/steps/{ticket_step_id}/submit-form", response_model=ActionResponse)
async def submit_form(
    ticket_id: str,
    ticket_step_id: str,
    request: SubmitFormRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Submit form for a form step.
    
    Only requester can submit form for their assigned form steps.
    Form values are validated against the form field definitions.
    """
    try:
        service = TicketService()
        result = service.submit_form(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            form_values=request.form_values,
            attachment_ids=request.attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/approve", response_model=ActionResponse)
async def approve(
    ticket_id: str,
    ticket_step_id: str,
    request: ApprovalRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Approve an approval step.
    
    Only the designated approver can approve.
    Supports both single approver and parallel approval modes.
    """
    try:
        service = TicketService()
        result = service.approve(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            comment=request.comment,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/reject", response_model=ActionResponse)
async def reject(
    ticket_id: str,
    ticket_step_id: str,
    request: ApprovalRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Reject an approval step.
    
    Only the designated approver can reject.
    In branched workflows with CONTINUE_OTHERS policy, only the branch is rejected.
    Otherwise, the entire ticket is rejected.
    """
    try:
        service = TicketService()
        result = service.reject(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            comment=request.comment,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/skip", response_model=ActionResponse)
async def skip(
    ticket_id: str,
    ticket_step_id: str,
    request: ApprovalRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Skip a workflow approval step.
    
    Only the designated approver can skip.
    Skip is similar to reject but with SKIPPED status - useful when the request is not applicable
    rather than denied.
    
    In branched workflows with CONTINUE_OTHERS policy, only the branch is skipped.
    Otherwise, the entire ticket is skipped.
    """
    try:
        service = TicketService()
        result = service.skip(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            comment=request.comment,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/reassign-approval", response_model=ActionResponse)
async def reassign_approval(
    ticket_id: str,
    ticket_step_id: str,
    request: ReassignApprovalRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Reassign an approval to another person.
    
    Only the current approver can reassign.
    The new approver becomes the owner of all future actions (approve, reject, skip, request info, etc.)
    If the new approver is not onboarded, they will be auto-onboarded with Manager persona.
    """
    try:
        service = TicketService()
        result = service.reassign_approval(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            new_approver_email=request.new_approver_email,
            new_approver_aad_id=request.new_approver_aad_id,
            new_approver_display_name=request.new_approver_display_name,
            reason=request.reason,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/complete", response_model=ActionResponse)
async def complete_task(
    ticket_id: str,
    ticket_step_id: str,
    request: CompleteTaskRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Complete a task step.
    
    Only the assigned agent can complete.
    Execution notes may be required based on workflow configuration.
    """
    try:
        service = TicketService()
        result = service.complete_task(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            execution_notes=request.execution_notes,
            output_values=request.output_values,
            attachment_ids=request.attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/add-note", response_model=ActionResponse)
async def add_note(
    ticket_id: str,
    ticket_step_id: str,
    request: AddNoteRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Add a note to a task step.
    
    Agents can add progress notes without completing the task.
    Notes are recorded in the audit trail.
    """
    try:
        service = TicketService()
        result = service.add_note(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            content=request.content,
            attachment_ids=request.attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/save-draft", response_model=ActionResponse)
async def save_draft(
    ticket_id: str,
    ticket_step_id: str,
    request: SaveDraftRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Save draft values for a task step without completing.
    
    Allows agents to save partial progress on a task form.
    Draft values persist across sessions and can be loaded later.
    """
    try:
        service = TicketService()
        result = service.save_draft(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            draft_values=request.draft_values,
            execution_notes=request.execution_notes,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/add-requester-note", response_model=ActionResponse)
async def add_requester_note(
    ticket_id: str,
    request: AddRequesterNoteRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Add a note to the ticket as the requester.
    
    Only the ticket requester can add requester notes.
    These are ticket-level notes (not step-specific) that appear in the Communication Hub.
    Relevant parties (current step assignees) are notified.
    """
    try:
        service = TicketService()
        result = service.add_requester_note(
            ticket_id=ticket_id,
            content=request.content,
            attachment_ids=request.attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

