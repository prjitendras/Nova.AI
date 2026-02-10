"""
Agent Routes

Endpoints for agent-specific operations:
- Assigned tasks
- Task history
- Agent dashboard
- Agent info requests
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query

from ...deps import get_current_user_dep, get_correlation_id_dep
from ....domain.models import ActorContext
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/agent", tags=["Agent"])


@router.get("/dashboard")
async def get_agent_dashboard(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get agent dashboard data.
    
    Returns comprehensive dashboard data for the agent including:
    - Summary metrics (tasks, info requests, handovers)
    - Overdue tasks
    - Recent completed tasks
    """
    try:
        logger.info(
            f"Agent dashboard request: email={actor.email}, aad_id={actor.aad_id}",
            extra={"correlation_id": correlation_id}
        )
        service = TicketService()
        dashboard = service.get_agent_dashboard(
            agent_email=actor.email,
            agent_aad_id=actor.aad_id
        )
        return dashboard
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/info-requests", response_model=List[Dict[str, Any]])
async def get_agent_info_requests(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get info requests directed to this agent.
    
    Returns open info requests where the user is requested as an agent
    (not as a manager/approver). This filters based on the step type
    where the request was made.
    """
    try:
        logger.info(
            f"Agent info requests: email={actor.email}, aad_id={actor.aad_id}",
            extra={"correlation_id": correlation_id}
        )
        service = TicketService()
        info_requests = service.get_agent_info_requests(
            agent_email=actor.email,
            agent_aad_id=actor.aad_id
        )
        return info_requests
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/pending-handovers")
async def get_agent_pending_handovers(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get handover requests submitted by this agent.
    
    Returns handover requests that the agent has submitted,
    showing their current status (pending, approved, rejected).
    """
    try:
        logger.info(
            f"Agent pending handovers: email={actor.email}, aad_id={actor.aad_id}",
            extra={"correlation_id": correlation_id}
        )
        service = TicketService()
        handovers = service.get_agent_pending_handovers(
            agent_email=actor.email,
            agent_aad_id=actor.aad_id
        )
        return {"items": handovers}
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/tasks")
async def get_assigned_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get tasks assigned to agent.
    
    Returns task steps that are assigned to the current user and
    are in ACTIVE state (ready to be worked on).
    """
    try:
        logger.info(
            f"Agent tasks request: email={actor.email}, aad_id={actor.aad_id}, page={page}",
            extra={"correlation_id": correlation_id}
        )
        service = TicketService()
        skip = (page - 1) * page_size
        
        tasks = service.get_assigned_tasks(
            agent_email=actor.email,
            agent_aad_id=actor.aad_id,
            skip=skip,
            limit=page_size
        )
        logger.info(
            f"Agent tasks response: found {len(tasks)} tasks",
            extra={"correlation_id": correlation_id}
        )
        return {"items": tasks, "page": page, "page_size": page_size}
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/history")
async def get_agent_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    date_filter: Optional[str] = Query(None, description="Date filter (e.g., 'today', 'week', 'month')"),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get completed tasks history for agent.
    
    Returns task steps that were completed by the current user,
    optionally filtered by date range.
    """
    try:
        service = TicketService()
        skip = (page - 1) * page_size
        history = service.get_agent_history(
            agent_email=actor.email,
            agent_aad_id=actor.aad_id,
            date_filter=date_filter,
            skip=skip,
            limit=page_size
        )
        return {"items": history, "page": page, "page_size": page_size}
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

