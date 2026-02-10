"""
Information Request Routes

Endpoints for requesting and responding to information requests:
- Request more info
- Respond to info request
- Get previous agents
- Get my pending info requests
"""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException

from ...deps import get_current_user_dep, get_correlation_id_dep
from ....domain.models import ActorContext
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....repositories.ticket_repo import TicketRepository
from ....utils.logger import get_logger
from .schemas import RequestInfoRequest, RespondInfoRequest, ActionResponse

logger = get_logger(__name__)
router = APIRouter()


@router.get("/my-info-requests", response_model=List[Dict[str, Any]])
async def get_my_info_requests(
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get info requests directed to the current user (Manager Dashboard).
    
    Returns list of open info requests where the current user is the requested_from,
    filtered to only show requests made from APPROVAL_STEP (manager context).
    TASK_STEP requests go to the Agent Dashboard instead.
    """
    try:
        ticket_repo = TicketRepository()
        info_requests = ticket_repo.get_info_requests_for_user(actor.email, actor.aad_id)
        
        # Enrich with ticket info and filter by step type
        result = []
        for ir in info_requests:
            ticket = ticket_repo.get_ticket(ir.ticket_id)
            step = ticket_repo.get_step(ir.ticket_step_id)
            
            if not step:
                continue
            
            # Filter: Only show requests where the RECIPIENT was on an APPROVAL_STEP
            # Use the requested_from_step_type field which tracks recipient's context
            recipient_step_type = ir.requested_from_step_type or "REQUESTER"
            if recipient_step_type != "APPROVAL_STEP":
                continue
            
            result.append({
                "info_request_id": ir.info_request_id,
                "ticket_id": ir.ticket_id,
                "ticket_title": ticket.title if ticket else "Unknown",
                "ticket_step_id": ir.ticket_step_id,
                "subject": ir.subject,
                "question_text": ir.question_text,
                "requested_by": ir.requested_by.model_dump() if ir.requested_by else None,
                "requested_from": ir.requested_from.model_dump() if ir.requested_from else None,
                "requested_at": ir.requested_at.isoformat() if ir.requested_at else None,
                "status": ir.status.value if hasattr(ir.status, 'value') else ir.status,
                "request_attachment_ids": ir.request_attachment_ids or [],
            })
        
        return result
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{ticket_id}/previous-agents", response_model=List[Dict[str, Any]])
async def get_previous_agents(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get list of previous agents who worked on this ticket.
    
    Returns list of agents who have completed tasks on this ticket.
    Useful for directing information requests to specific agents.
    """
    try:
        service = TicketService()
        result = service.get_previous_agents(ticket_id=ticket_id, actor=actor)
        return result
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/request-info", response_model=ActionResponse)
async def request_info(
    ticket_id: str,
    ticket_step_id: str,
    request: RequestInfoRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Request more info from requester or previous agent.
    
    Approvers and agents can request more information when they need
    clarification. The step is put on hold until the response is received.
    """
    try:
        service = TicketService()
        result = service.request_info(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            question_text=request.question_text,
            actor=actor,
            correlation_id=correlation_id,
            requested_from_email=request.requested_from_email,
            subject=request.subject,
            attachment_ids=request.attachment_ids
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/respond-info", response_model=ActionResponse)
async def respond_info(
    ticket_id: str,
    ticket_step_id: str,
    request: RespondInfoRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Respond to info request.
    
    The requester (or targeted agent) can respond to info requests.
    The response is recorded and the step is resumed.
    """
    try:
        service = TicketService()
        result = service.respond_info(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            response_text=request.response_text,
            attachment_ids=request.attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

