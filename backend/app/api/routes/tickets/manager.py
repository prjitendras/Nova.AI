"""
Manager Routes

Endpoints for manager-specific operations:
- Pending approvals
- Tasks needing assignment
- Pending handovers
- Team dashboard
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ...deps import get_current_user_dep, get_correlation_id_dep
from ....domain.models import ActorContext
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/manager", tags=["Manager"])


@router.get("/approvals")
async def get_pending_approvals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get pending approvals for manager.
    
    Returns approval steps where the current user is the designated approver
    and the decision is still pending.
    """
    try:
        service = TicketService()
        skip = (page - 1) * page_size
        approvals = service.get_pending_approvals(
            approver_email=actor.email,
            approver_aad_id=actor.aad_id,
            skip=skip,
            limit=page_size
        )
        return {"items": approvals, "page": page, "page_size": page_size}
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/assignments")
async def get_unassigned_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get tasks needing assignment.
    
    Returns task steps that are waiting for the manager to assign an agent.
    The manager is identified either by being the designated manager in the
    workflow or by being the most recent approver in a branch.
    """
    try:
        service = TicketService()
        skip = (page - 1) * page_size
        tasks = service.get_unassigned_tasks(
            manager_email=actor.email,
            manager_aad_id=actor.aad_id,
            skip=skip,
            limit=page_size
        )
        return {"items": tasks, "page": page, "page_size": page_size}
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/handovers")
async def get_pending_handovers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get pending handover requests for manager.
    
    Returns handover requests from agents that need manager approval.
    """
    try:
        service = TicketService()
        skip = (page - 1) * page_size
        handovers = service.get_pending_handovers(
            manager_email=actor.email,
            manager_aad_id=actor.aad_id,
            skip=skip,
            limit=page_size
        )
        return {"items": handovers, "page": page, "page_size": page_size}
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/dashboard")
async def get_team_dashboard(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get team dashboard for manager.
    
    Returns aggregated metrics about the manager's team including:
    - Open tickets count
    - Pending approvals count
    - Overdue tasks count
    - Team workload distribution
    """
    try:
        service = TicketService()
        dashboard = service.get_team_dashboard(
            manager_email=actor.email,
            manager_aad_id=actor.aad_id
        )
        return dashboard
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/history")
async def get_manager_history(
    status: Optional[str] = Query(None, description="Filter by ticket status"),
    q: Optional[str] = Query(None, description="Search in ticket ID, title, requester, workflow"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get approval history for manager.
    
    Returns tickets where the manager made approval decisions (approved or rejected),
    sorted by decision time (most recent first).
    """
    try:
        service = TicketService()
        skip = (page - 1) * page_size
        
        items, total = service.get_manager_approval_history(
            manager_email=actor.email,
            manager_aad_id=actor.aad_id,
            status_filter=status,
            search=q,
            skip=skip,
            limit=page_size
        )
        
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size
        }
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

