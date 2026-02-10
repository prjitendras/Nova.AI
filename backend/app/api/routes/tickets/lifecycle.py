"""
Ticket Lifecycle Routes

Endpoints for ticket and step lifecycle management:
- Cancel ticket
- Hold/Resume task
- Handover request/decision
- Skip step
- Acknowledge SLA
"""

from fastapi import APIRouter, Depends, HTTPException

from ...deps import get_current_user_dep, get_correlation_id_dep
from ....domain.models import ActorContext
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....utils.logger import get_logger
from .schemas import (
    CancelTicketRequest, HoldTaskRequest, HandoverRequest,
    HandoverDecisionRequest, SkipStepRequest, AcknowledgeSlaRequest,
    ActionResponse
)

logger = get_logger(__name__)
router = APIRouter()


# =============================================================================
# Cancel
# =============================================================================

@router.post("/{ticket_id}/cancel", response_model=ActionResponse)
async def cancel_ticket(
    ticket_id: str,
    request: CancelTicketRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Cancel ticket.
    
    Only requester can cancel their tickets.
    All active steps are cancelled and the ticket is marked as CANCELLED.
    """
    try:
        service = TicketService()
        result = service.cancel_ticket(
            ticket_id=ticket_id,
            reason=request.reason,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# =============================================================================
# Hold/Resume
# =============================================================================

@router.post("/{ticket_id}/steps/{ticket_step_id}/hold", response_model=ActionResponse)
async def hold_task(
    ticket_id: str,
    ticket_step_id: str,
    request: HoldTaskRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Put a task on hold.
    
    Only assigned agent can put step on hold.
    SLA timer is paused while the task is on hold.
    """
    try:
        service = TicketService()
        result = service.hold_task(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            reason=request.reason,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/resume", response_model=ActionResponse)
async def resume_task(
    ticket_id: str,
    ticket_step_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Resume a task from hold.
    
    Agent or manager can resume. SLA timer resumes.
    """
    try:
        service = TicketService()
        result = service.resume_task(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# =============================================================================
# Handover
# =============================================================================

@router.post("/{ticket_id}/steps/{ticket_step_id}/request-handover", response_model=ActionResponse)
async def request_handover(
    ticket_id: str,
    ticket_step_id: str,
    request: HandoverRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Request handover of a task.
    
    Only assigned agent can request handover.
    Creates a pending handover request for manager approval.
    """
    try:
        service = TicketService()
        result = service.request_handover(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            reason=request.reason,
            suggested_agent_email=request.suggested_agent_email,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/decide-handover", response_model=ActionResponse)
async def decide_handover(
    ticket_id: str,
    ticket_step_id: str,
    request: HandoverDecisionRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Decide on a handover request.
    
    Only manager can decide on handover requests.
    If approved, task is reassigned to the new agent.
    """
    try:
        service = TicketService()
        result = service.decide_handover(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            handover_request_id=request.handover_request_id,
            approved=request.approved,
            new_agent_email=request.new_agent_email,
            new_agent_aad_id=request.new_agent_aad_id,
            new_agent_display_name=request.new_agent_display_name,
            comment=request.comment,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/cancel-handover/{handover_request_id}", response_model=ActionResponse)
async def cancel_handover(
    ticket_id: str,
    ticket_step_id: str,
    handover_request_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Cancel a pending handover request.
    
    Only the agent who requested the handover can cancel it.
    """
    try:
        service = TicketService()
        result = service.cancel_handover(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            handover_request_id=handover_request_id,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# =============================================================================
# Skip & SLA
# =============================================================================

@router.post("/{ticket_id}/steps/{ticket_step_id}/skip", response_model=ActionResponse)
async def skip_step(
    ticket_id: str,
    ticket_step_id: str,
    request: SkipStepRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Skip a step.
    
    Only manager or admin can skip steps.
    The step is marked as skipped and workflow proceeds to next step.
    """
    try:
        service = TicketService()
        result = service.skip_step(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            reason=request.reason,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/acknowledge-sla", response_model=ActionResponse)
async def acknowledge_sla(
    ticket_id: str,
    ticket_step_id: str,
    request: AcknowledgeSlaRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Acknowledge SLA breach.
    
    Only assigned agent can acknowledge.
    Records the acknowledgment in audit trail.
    """
    try:
        service = TicketService()
        result = service.acknowledge_sla(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            notes=request.notes,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

