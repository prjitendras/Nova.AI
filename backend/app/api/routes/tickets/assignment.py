"""
Assignment Routes

Endpoints for task assignment operations:
- Assign agent
- Reassign agent
"""

from fastapi import APIRouter, Depends, HTTPException

from ...deps import get_current_user_dep, get_correlation_id_dep
from ....domain.models import ActorContext
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....utils.logger import get_logger
from .schemas import AssignRequest, ReassignRequest, ActionResponse

logger = get_logger(__name__)
router = APIRouter()


@router.post("/{ticket_id}/steps/{ticket_step_id}/assign", response_model=ActionResponse)
async def assign_agent(
    ticket_id: str,
    ticket_step_id: str,
    request: AssignRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Assign agent to task step.
    
    Only managers can assign agents. The task must be in WAITING_ASSIGNMENT state.
    Once assigned, the task transitions to ACTIVE state and the agent is notified.
    """
    try:
        service = TicketService()
        result = service.assign_agent(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            agent_email=request.agent_email,
            agent_aad_id=request.agent_aad_id,
            agent_display_name=request.agent_display_name,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{ticket_id}/steps/{ticket_step_id}/reassign", response_model=ActionResponse)
async def reassign_agent(
    ticket_id: str,
    ticket_step_id: str,
    request: ReassignRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Reassign agent for task step.
    
    Only managers can reassign agents. The task must be in ACTIVE state.
    The previous agent is notified of the reassignment.
    """
    try:
        service = TicketService()
        result = service.reassign_agent(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            agent_email=request.agent_email,
            agent_aad_id=request.agent_aad_id,
            agent_display_name=request.agent_display_name,
            reason=request.reason,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return ActionResponse(**result)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

