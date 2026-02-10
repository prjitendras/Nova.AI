"""Change Request API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_current_user_dep
from ...domain.models import ActorContext
from ...domain.change_request_models import (
    CreateChangeRequestRequest,
    ReviewChangeRequestRequest,
)
from ...services.change_request_service import ChangeRequestService
from ...repositories.mongo_client import get_database


router = APIRouter(prefix="/change-requests", tags=["Change Requests"])


def get_cr_service() -> ChangeRequestService:
    """Dependency to get ChangeRequestService"""
    db = get_database()
    return ChangeRequestService(db)


@router.post("")
async def create_change_request(
    request: CreateChangeRequestRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """
    Create a new change request for a ticket.
    
    Only the ticket requester can create a CR.
    Only one pending CR per ticket is allowed.
    Ticket must be IN_PROGRESS.
    """
    try:
        cr = service.create_change_request(request, actor)
        return {"success": True, "change_request": cr}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create change request: {str(e)}")


@router.get("/my-pending")
async def get_my_pending_change_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """
    Get pending change requests assigned to the current user.
    Used by the Change Request Agent tab in Agent Supervisor.
    
    Supports matching by both email (case-insensitive) and aad_id
    to handle users with multiple email aliases (UPN vs primary email).
    """
    try:
        items, total = service.get_pending_for_approver(
            approver_email=actor.email,
            skip=skip,
            limit=limit,
            approver_aad_id=actor.aad_id  # Also match by aad_id for email alias support
        )
        return {
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch change requests: {str(e)}")


@router.get("/count")
async def get_pending_count(
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """Get count of pending CRs for the current user (for badge display).
    
    Supports matching by both email (case-insensitive) and aad_id.
    """
    try:
        from ...repositories.change_request_repo import ChangeRequestRepository
        repo = ChangeRequestRepository(service.db)
        count = repo.count_pending_for_approver(actor.email, actor.aad_id)
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cr_id}")
async def get_change_request(
    cr_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """Get a change request by ID"""
    try:
        detail = service.get_change_request_detail(cr_id)
        if not detail:
            raise HTTPException(status_code=404, detail=f"Change request {cr_id} not found")
        return detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cr_id}/approve")
async def approve_change_request(
    cr_id: str,
    request: ReviewChangeRequestRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """
    Approve a change request.
    
    Only the assigned approver can approve.
    This updates the ticket's form_values with the proposed data
    and creates a new version in the history.
    """
    try:
        if request.action.upper() != "APPROVE":
            raise HTTPException(status_code=400, detail="Invalid action for approve endpoint")
        
        cr = service.approve_change_request(cr_id, actor, request.notes)
        return {"success": True, "change_request": cr}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve change request: {str(e)}")


@router.post("/{cr_id}/reject")
async def reject_change_request(
    cr_id: str,
    request: ReviewChangeRequestRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """
    Reject a change request.
    
    Only the assigned approver can reject.
    """
    try:
        if request.action.upper() != "REJECT":
            raise HTTPException(status_code=400, detail="Invalid action for reject endpoint")
        
        cr = service.reject_change_request(cr_id, actor, request.notes)
        return {"success": True, "change_request": cr}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject change request: {str(e)}")


@router.delete("/{cr_id}")
async def cancel_change_request(
    cr_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """
    Cancel a pending change request.
    
    Only the requester can cancel their own CR.
    """
    try:
        cr = service.cancel_change_request(cr_id, actor)
        return {"success": True, "change_request": cr}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel change request: {str(e)}")


# ============================================================================
# Ticket Version Endpoints
# ============================================================================

@router.get("/tickets/{ticket_id}/versions")
async def get_ticket_versions(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """Get all form data versions for a ticket"""
    try:
        versions = service.get_ticket_versions(ticket_id)
        return {"versions": versions, "total": len(versions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickets/{ticket_id}/compare")
async def compare_ticket_versions(
    ticket_id: str,
    version_1: int = Query(..., ge=1),
    version_2: int = Query(..., ge=1),
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """Compare two versions of a ticket's form data"""
    try:
        comparison = service.compare_versions(ticket_id, version_1, version_2)
        return comparison
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickets/{ticket_id}/history")
async def get_change_request_history(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    service: ChangeRequestService = Depends(get_cr_service)
):
    """Get change request history for a ticket"""
    try:
        history = service.get_cr_history_for_ticket(ticket_id)
        return {"items": history, "total": len(history)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
