"""
Ticket Schemas

Request and response models for ticket API endpoints.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Ticket CRUD Schemas
# =============================================================================

class CreateTicketRequest(BaseModel):
    """Request to create a new ticket"""
    workflow_id: str
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    initial_form_values: Dict[str, Any] = Field(default_factory=dict)
    attachment_ids: List[str] = Field(default_factory=list)
    initial_form_step_ids: Optional[List[str]] = Field(
        default=None, 
        description="List of form step IDs that were pre-filled in wizard (for multi-form workflows)"
    )


class CreateTicketResponse(BaseModel):
    """Response after creating ticket"""
    ticket_id: str


class TicketListResponse(BaseModel):
    """Response for ticket list"""
    items: List[Dict[str, Any]]
    page: int
    page_size: int
    total: int


# =============================================================================
# Action Schemas
# =============================================================================

class SubmitFormRequest(BaseModel):
    """Request to submit form"""
    form_values: Dict[str, Any]
    attachment_ids: List[str] = Field(default_factory=list)


class ApprovalRequest(BaseModel):
    """Request for approve/reject"""
    comment: Optional[str] = Field(None, max_length=2000)


class ReassignApprovalRequest(BaseModel):
    """Request to reassign approval to another person"""
    new_approver_email: str = Field(..., min_length=5, max_length=255, description="Email of the new approver")
    new_approver_aad_id: Optional[str] = Field(None, description="Azure AD ID of new approver")
    new_approver_display_name: Optional[str] = Field(None, max_length=200, description="Display name of new approver")
    reason: Optional[str] = Field(None, max_length=1000, description="Reason for reassignment")
    
    @field_validator("new_approver_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format"""
        import re
        v = v.strip().lower()
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", v):
            raise ValueError("Invalid email format")
        return v


class CompleteTaskRequest(BaseModel):
    """Request to complete task"""
    execution_notes: Optional[str] = Field(None, max_length=5000)
    output_values: Dict[str, Any] = Field(default_factory=dict)
    attachment_ids: List[str] = Field(default_factory=list)


class AddNoteRequest(BaseModel):
    """Request to add a note to a task"""
    content: str = Field(..., min_length=1, max_length=5000)
    attachment_ids: List[str] = Field(default_factory=list, description="Attachment IDs to include with the note")


class AddRequesterNoteRequest(BaseModel):
    """Request to add a requester note to a ticket"""
    content: str = Field(..., min_length=1, max_length=5000, description="Note content")
    attachment_ids: List[str] = Field(default_factory=list, description="Attachment IDs to include with the note")


class SaveDraftRequest(BaseModel):
    """Request to save draft values for a task (partial save without completing)"""
    draft_values: Dict[str, Any] = Field(..., description="Partial form values to save as draft")
    execution_notes: Optional[str] = Field(None, max_length=5000)


# =============================================================================
# Info Request Schemas
# =============================================================================

class RequestInfoRequest(BaseModel):
    """Request to request more info"""
    question_text: str = Field(..., min_length=1, max_length=5000)
    requested_from_email: Optional[str] = Field(
        None, 
        description="Email of person to request info from (requester or previous agent). If None, defaults to requester."
    )
    subject: Optional[str] = Field(None, max_length=200, description="Subject line for the info request")
    attachment_ids: List[str] = Field(default_factory=list, description="Attachment IDs to include with the request")


class RespondInfoRequest(BaseModel):
    """Request to respond to info request"""
    response_text: str = Field(..., min_length=1, max_length=5000)
    attachment_ids: List[str] = Field(default_factory=list)


# =============================================================================
# Assignment Schemas
# =============================================================================

class AssignRequest(BaseModel):
    """Request to assign agent"""
    agent_email: str
    agent_aad_id: Optional[str] = None
    agent_display_name: Optional[str] = None


class ReassignRequest(BaseModel):
    """Request to reassign agent"""
    agent_email: str
    agent_aad_id: Optional[str] = None
    agent_display_name: Optional[str] = None
    reason: Optional[str] = Field(None, max_length=1000)


# =============================================================================
# Lifecycle Schemas
# =============================================================================

class CancelTicketRequest(BaseModel):
    """Request to cancel ticket"""
    reason: Optional[str] = Field(None, max_length=1000)


class HoldTaskRequest(BaseModel):
    """Request to put task on hold"""
    reason: str = Field(..., min_length=1, max_length=1000)


class HandoverRequest(BaseModel):
    """Request for task handover"""
    reason: str = Field(..., min_length=1, max_length=1000)
    suggested_agent_email: Optional[str] = None


class HandoverDecisionRequest(BaseModel):
    """Request to decide on handover"""
    handover_request_id: str
    approved: bool
    new_agent_email: Optional[str] = None
    new_agent_aad_id: Optional[str] = None
    new_agent_display_name: Optional[str] = None
    comment: Optional[str] = Field(None, max_length=1000)


class SkipStepRequest(BaseModel):
    """Request to skip a step"""
    reason: str = Field(..., min_length=1, max_length=1000)


class AcknowledgeSlaRequest(BaseModel):
    """Request to acknowledge SLA breach"""
    notes: Optional[str] = Field(None, max_length=1000)


# =============================================================================
# Response Schemas
# =============================================================================

class ActionResponse(BaseModel):
    """Generic action response"""
    ticket: Dict[str, Any]
    current_step: Optional[Dict[str, Any]]
    actionable_tasks: List[Dict[str, Any]]
    newest_audit_events: List[Dict[str, Any]]

