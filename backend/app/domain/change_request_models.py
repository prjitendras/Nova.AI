"""Change Request Models - Pydantic schemas for change request feature"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from enum import Enum

from .models import UserSnapshot


class ChangeRequestStatus(str, Enum):
    """Status of a change request"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class AttachmentChange(BaseModel):
    """Tracks a single attachment change"""
    model_config = ConfigDict(extra="ignore")
    
    attachment_id: str = Field(..., description="Attachment ID")
    filename: str = Field(..., description="Original filename")
    action: str = Field(..., description="ADDED, REMOVED, or UNCHANGED")


class FieldChange(BaseModel):
    """Tracks a single field change"""
    model_config = ConfigDict(extra="ignore")
    
    form_name: str = Field(..., description="Form/step name for display")
    step_id: str = Field(..., description="Step ID the field belongs to")
    field_key: str = Field(..., description="Field key")
    field_label: str = Field(..., description="Field display label")
    old_value: Any = Field(None, description="Previous value")
    new_value: Any = Field(None, description="New value")


class ChangeRequest(BaseModel):
    """
    Change Request model for tracking form data modification requests.
    
    When a requester wants to modify their submitted form data after
    ticket creation, they create a Change Request. This goes to the
    first approver in the workflow for review.
    """
    model_config = ConfigDict(extra="ignore")
    
    change_request_id: str = Field(..., description="Unique CR ID (CR-xxxxx)")
    ticket_id: str = Field(..., description="Parent ticket ID")
    workflow_id: str = Field(..., description="Workflow ID for reference")
    
    # Status
    status: ChangeRequestStatus = Field(
        default=ChangeRequestStatus.PENDING,
        description="Current status of the CR"
    )
    
    # Version tracking
    from_version: int = Field(default=1, description="Original form version")
    to_version: Optional[int] = Field(None, description="New version (set on approval)")
    
    # Data snapshots
    original_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Snapshot of original form_values and attachment_ids"
    )
    proposed_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Proposed new form_values and attachment_ids"
    )
    
    # Change summary for quick display
    field_changes: List[FieldChange] = Field(
        default_factory=list,
        description="List of field changes"
    )
    attachment_changes: List[AttachmentChange] = Field(
        default_factory=list,
        description="List of attachment changes"
    )
    
    # Requester info
    requested_by: UserSnapshot = Field(..., description="Who requested the change")
    reason: str = Field(..., description="Reason for the change request")
    requested_at: datetime = Field(..., description="When CR was submitted")
    
    # Approver info (first approver from workflow)
    assigned_to: UserSnapshot = Field(..., description="First approver assigned to review")
    
    # Review details
    reviewed_by: Optional[UserSnapshot] = Field(None, description="Who reviewed the CR")
    reviewed_at: Optional[datetime] = Field(None, description="When CR was reviewed")
    review_notes: Optional[str] = Field(None, description="Approver's notes/comments")
    
    # Timestamps
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class FormVersion(BaseModel):
    """
    A snapshot of form data at a point in time.
    Stored in ticket.form_versions array.
    """
    model_config = ConfigDict(extra="ignore")
    
    version: int = Field(..., description="Version number (1, 2, 3...)")
    form_values: Dict[str, Any] = Field(
        default_factory=dict,
        description="Form values at this version"
    )
    attachment_ids: List[str] = Field(
        default_factory=list,
        description="Attachment IDs at this version"
    )
    created_at: datetime = Field(..., description="When this version was created")
    created_by: UserSnapshot = Field(..., description="Who created this version")
    source: str = Field(..., description="ORIGINAL or CHANGE_REQUEST")
    
    # For CR-created versions
    change_request_id: Optional[str] = Field(None, description="CR that created this version")
    approved_by: Optional[UserSnapshot] = Field(None, description="Who approved the CR")
    field_changes: Optional[List[FieldChange]] = Field(None, description="What changed from previous")
    attachment_changes: Optional[List[AttachmentChange]] = Field(None, description="Attachment changes")


# ============================================================================
# API Request/Response Schemas
# ============================================================================

class CreateChangeRequestRequest(BaseModel):
    """Request to create a new change request"""
    model_config = ConfigDict(extra="forbid")
    
    ticket_id: str = Field(..., description="Ticket to create CR for")
    proposed_form_values: Dict[str, Any] = Field(..., description="New form values")
    proposed_attachment_ids: List[str] = Field(
        default_factory=list,
        description="New attachment IDs"
    )
    reason: str = Field(..., min_length=1, max_length=2000, description="Reason for change")


class ReviewChangeRequestRequest(BaseModel):
    """Request to approve or reject a change request"""
    model_config = ConfigDict(extra="forbid")
    
    action: str = Field(..., description="APPROVE or REJECT")
    notes: Optional[str] = Field(None, max_length=2000, description="Optional reviewer notes")


class ChangeRequestListResponse(BaseModel):
    """Response for listing change requests"""
    model_config = ConfigDict(extra="ignore")
    
    items: List[Dict[str, Any]] = Field(default_factory=list)
    total: int = Field(default=0)


class ChangeRequestDetailResponse(BaseModel):
    """Detailed change request response"""
    model_config = ConfigDict(extra="ignore")
    
    change_request: Dict[str, Any]
    ticket_title: str
    ticket_status: str
    workflow_name: str


class CompareVersionsResponse(BaseModel):
    """Response for version comparison"""
    model_config = ConfigDict(extra="ignore")
    
    version_1: Dict[str, Any]
    version_2: Dict[str, Any]
    field_changes: List[FieldChange]
    attachment_changes: List[AttachmentChange]
