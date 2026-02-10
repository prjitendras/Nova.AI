"""
Ticket Routes Module

This module contains all ticket-related API endpoints organized by functionality:

- crud.py: Create, list, get tickets
- actions.py: Form submission, approve, reject, complete, notes
- info.py: Information request and response
- assignment.py: Assign and reassign tasks
- lifecycle.py: Cancel, hold, resume, handover, skip, SLA
- manager.py: Manager-specific endpoints (approvals, assignments, dashboard)
- agent.py: Agent-specific endpoints (tasks, history)

All routes are combined into a single router for inclusion in the API.
"""

from fastapi import APIRouter

from .schemas import (
    CreateTicketRequest, CreateTicketResponse, TicketListResponse,
    SubmitFormRequest, ApprovalRequest, RequestInfoRequest,
    RespondInfoRequest, CompleteTaskRequest, AssignRequest,
    ReassignRequest, CancelTicketRequest, HoldTaskRequest,
    HandoverRequest, HandoverDecisionRequest, SkipStepRequest,
    AcknowledgeSlaRequest, AddNoteRequest, AddRequesterNoteRequest, ActionResponse
)
from .crud import router as crud_router
from .actions import router as actions_router
from .info import router as info_router
from .assignment import router as assignment_router
from .lifecycle import router as lifecycle_router
from .manager import router as manager_router
from .agent import router as agent_router

# Create main router and include all sub-routers
router = APIRouter()

# Order matters for route matching!
# Routes with specific paths (like /my-info-requests) must come BEFORE {ticket_id} routes
# Otherwise /my-info-requests would be matched as a ticket_id
router.include_router(manager_router)
router.include_router(agent_router)
router.include_router(info_router)  # Moved BEFORE crud_router - has /my-info-requests
router.include_router(crud_router)
router.include_router(actions_router)
router.include_router(assignment_router)
router.include_router(lifecycle_router)

__all__ = [
    "router",
    # Schemas
    "CreateTicketRequest", "CreateTicketResponse", "TicketListResponse",
    "SubmitFormRequest", "ApprovalRequest", "RequestInfoRequest",
    "RespondInfoRequest", "CompleteTaskRequest", "AssignRequest",
    "ReassignRequest", "CancelTicketRequest", "HoldTaskRequest",
    "HandoverRequest", "HandoverDecisionRequest", "SkipStepRequest",
    "AcknowledgeSlaRequest", "AddNoteRequest", "AddRequesterNoteRequest", "ActionResponse"
]

