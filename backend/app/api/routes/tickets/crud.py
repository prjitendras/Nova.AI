"""
Ticket CRUD Routes

Create, read, list ticket endpoints.
"""

from typing import Any, Dict, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...deps import get_current_user_dep, get_correlation_id_dep, get_access_token_dep
from ....domain.models import ActorContext
from ....domain.enums import TicketStatus
from ....domain.errors import DomainError
from ....services.ticket_service import TicketService
from ....utils.logger import get_logger
from .schemas import CreateTicketRequest, CreateTicketResponse, TicketListResponse

logger = get_logger(__name__)
router = APIRouter()


@router.post("/", response_model=CreateTicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    request: CreateTicketRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep),
    access_token: str = Depends(get_access_token_dep)
):
    """
    Create a new ticket
    
    Creates a ticket from a published workflow.
    Automatically snapshots requester and manager info.
    
    For multi-form workflows (wizard style):
    - Pass initial_form_step_ids with the step IDs of forms already filled
    - All those form steps will be marked COMPLETED
    - The first non-form step will be activated
    """
    try:
        service = TicketService()
        ticket = service.create_ticket(
            workflow_id=request.workflow_id,
            title=request.title,
            description=request.description,
            initial_form_values=request.initial_form_values,
            attachment_ids=request.attachment_ids,
            actor=actor,
            correlation_id=correlation_id,
            access_token=access_token,
            initial_form_step_ids=request.initial_form_step_ids
        )
        
        logger.info(
            f"Created ticket: {ticket.ticket_id}",
            extra={
                "ticket_id": ticket.ticket_id, 
                "actor_email": actor.email,
                "initial_forms_count": len(request.initial_form_step_ids) if request.initial_form_step_ids else 0
            }
        )
        
        return CreateTicketResponse(ticket_id=ticket.ticket_id)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/", response_model=TicketListResponse)
async def list_tickets(
    mine: bool = Query(True, description="Show only my tickets"),
    status: Optional[TicketStatus] = Query(None, description="Filter by status"),
    statuses: Optional[str] = Query(None, description="Filter by multiple statuses (comma-separated)"),
    workflow_id: Optional[str] = Query(None, description="Filter by workflow"),
    q: Optional[str] = Query(None, description="Search in title, ID, description, workflow name"),
    date_from: Optional[datetime] = Query(None, description="Filter by creation date (from)"),
    date_to: Optional[datetime] = Query(None, description="Filter by creation date (to)"),
    has_pending_cr: Optional[bool] = Query(None, description="Filter by pending change request"),
    sort_by: str = Query("updated_at", description="Sort field: updated_at, created_at, title, status"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    List tickets with advanced search and filtering
    
    By default shows tickets where user is requester.
    Supports:
    - Full-text search across title, ID, description, and workflow name
    - Date range filtering on creation date
    - Status and workflow filtering (single or comma-separated multiple)
    - Configurable sorting
    """
    try:
        service = TicketService()
        skip = (page - 1) * page_size
        
        # Use both email and aad_id for requester matching (handles UPN vs primary email)
        requester_email = actor.email if mine else None
        requester_aad_id = actor.aad_id if mine else None
        
        # Log date filter parameters for debugging
        if date_from or date_to:
            logger.info(f"[Tickets] Date filter: from={date_from}, to={date_to}")
        
        # Handle multiple statuses (comma-separated)
        status_list = None
        if statuses:
            status_list = [TicketStatus(s.strip()) for s in statuses.split(",") if s.strip()]
        elif status:
            status_list = [status]
        
        # Debug logging for ticket query
        logger.info(f"[Tickets] Listing tickets: mine={mine}, aad_id={requester_aad_id}, email={requester_email}, page={page}, status_list={status_list}, has_pending_cr={has_pending_cr}")
        
        tickets, total = service.list_tickets(
            requester_email=requester_email,
            requester_aad_id=requester_aad_id,
            status=status_list[0] if status_list and len(status_list) == 1 else None,
            statuses=status_list if status_list and len(status_list) > 1 else None,
            workflow_id=workflow_id,
            search=q,
            date_from=date_from,
            date_to=date_to,
            sort_by=sort_by,
            sort_order=sort_order,
            skip=skip,
            limit=page_size,
            actor=actor,
            has_pending_cr=has_pending_cr
        )
        
        logger.info(f"[Tickets] Found {len(tickets)} tickets, total={total}")
        
        # Get ticket IDs to check first approval status
        ticket_ids = [t.ticket_id for t in tickets]
        
        # Query for tickets that have at least one COMPLETED approval step
        # This is needed for Change Request eligibility
        from ....repositories.mongo_client import get_database
        db = get_database()
        tickets_with_completed_approval = set()
        
        if ticket_ids:
            # Find all tickets that have at least one completed approval step
            completed_approval_steps = list(db["ticket_steps"].find({
                "ticket_id": {"$in": ticket_ids},
                "step_type": "APPROVAL_STEP",
                "state": "COMPLETED"
            }, {"ticket_id": 1}))
            
            tickets_with_completed_approval = {doc["ticket_id"] for doc in completed_approval_steps}
            
            logger.info(f"[CR Eligibility] Checked {len(ticket_ids)} tickets, found {len(tickets_with_completed_approval)} with completed approval: {tickets_with_completed_approval}")
        
        # Build response items with first_approval_completed flag
        items = []
        for t in tickets:
            item = t.model_dump(mode="json")
            item["first_approval_completed"] = t.ticket_id in tickets_with_completed_approval
            items.append(item)
        
        return TicketListResponse(
            items=items,
            page=page,
            page_size=page_size,
            total=total
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get ticket details
    
    Returns full ticket detail including:
    - Ticket metadata
    - All steps with their state
    - Form values
    - Audit trail
    """
    try:
        service = TicketService()
        ticket_detail = service.get_ticket_detail(ticket_id, actor)
        return ticket_detail
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())

