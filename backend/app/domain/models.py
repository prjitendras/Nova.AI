"""Domain Models - Pydantic schemas for all entities"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from .enums import (
    TicketStatus, StepState, StepType, ApprovalDecision, ApproverResolution,
    AssignmentStatus, InfoRequestStatus, NotificationStatus, NotificationType,
    NotificationTemplateKey, WorkflowStatus, TransitionEvent, AuditEventType,
    FormFieldType, ParallelApprovalRule, ConditionOperator, HandoverRequestStatus,
    ForkJoinMode, BranchFailurePolicy, AdminRole, AdminAuditAction, InAppNotificationCategory
)


# ============================================================================
# User & Identity Snapshots
# ============================================================================

class UserSnapshot(BaseModel):
    """Snapshot of user identity at a point in time"""
    model_config = ConfigDict(extra="forbid")
    
    aad_id: Optional[str] = Field(None, description="Azure AD object ID (oid)")
    email: EmailStr = Field(..., description="User email/UPN")
    display_name: str = Field(..., description="User display name")
    role_at_time: Optional[str] = Field(None, description="Role when snapshot was taken")
    manager_email: Optional[EmailStr] = Field(None, description="Manager email if known")


class ActorContext(BaseModel):
    """Current actor context from JWT token"""
    model_config = ConfigDict(extra="forbid")
    
    aad_id: str = Field(..., description="Azure AD object ID")
    email: EmailStr = Field(..., description="User email")
    display_name: str = Field(..., description="User display name")
    roles: List[str] = Field(default_factory=list, description="Assigned roles")


# ============================================================================
# Form Field & Validation
# ============================================================================

class DateValidation(BaseModel):
    """Date validation rules for DATE fields"""
    allow_past_dates: Optional[bool] = Field(default=True, description="Allow dates before today")
    allow_today: Optional[bool] = Field(default=True, description="Allow today's date")
    allow_future_dates: Optional[bool] = Field(default=True, description="Allow dates after today")


class FormFieldValidation(BaseModel):
    """Validation rules for form field"""
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    regex_pattern: Optional[str] = None
    allowed_values: Optional[List[str]] = None
    date_validation: Optional[DateValidation] = Field(None, description="Date-specific validation for DATE fields")


class ConditionalWhenCondition(BaseModel):
    """A single condition for conditional rules"""
    field_key: str = Field(..., description="The source field key to check")
    step_id: Optional[str] = Field(None, description="Optional step ID for cross-form conditions")
    operator: str = Field(..., description="Operator: equals, not_equals, in, not_in, is_empty, is_not_empty")
    value: Optional[Any] = Field(None, description="Value(s) to match against")


class ConditionalRequirementWhen(ConditionalWhenCondition):
    """Condition for when a field requirement rule applies - supports compound conditions"""
    # Additional fields for compound conditions (AND/OR)
    logic: Optional[str] = Field(None, description="How to combine conditions: AND or OR")
    conditions: Optional[List[ConditionalWhenCondition]] = Field(None, description="Additional conditions for compound rules")


class ConditionalRequirement(BaseModel):
    """Conditional requirement rule - makes a field required/optional based on another field's value"""
    rule_id: str = Field(..., description="Unique rule identifier")
    when: ConditionalRequirementWhen = Field(..., description="Condition to evaluate (supports compound conditions)")
    then: Dict[str, Any] = Field(..., description="Action to take (e.g., {'required': true, 'date_validation': {...}})")


class FormSection(BaseModel):
    """Form section for organizing fields"""
    model_config = ConfigDict(extra="forbid")
    
    section_id: str = Field(..., description="Unique section ID")
    section_title: str = Field(..., description="Section title")
    section_description: Optional[str] = Field(None, description="Optional section description")
    order: int = Field(default=0, description="Display order")
    is_repeating: bool = Field(default=False, description="If true, section can have multiple rows/line items")
    min_rows: Optional[int] = Field(default=None, description="Minimum number of rows required for repeating sections")


class FormField(BaseModel):
    """Form field definition"""
    model_config = ConfigDict(extra="forbid")
    
    field_key: str = Field(..., description="Unique key for field")
    field_label: str = Field(..., description="Display label")
    field_type: FormFieldType = Field(..., description="Field type")
    required: bool = Field(default=False)
    placeholder: Optional[str] = None
    default_value: Optional[Any] = None
    help_text: Optional[str] = None
    options: Optional[List[str]] = Field(None, description="Options for select/multiselect")
    validation: Optional[FormFieldValidation] = None
    conditional_visibility: Optional[Dict[str, Any]] = Field(None, description="Visibility condition (v2)")
    conditional_requirements: Optional[List[ConditionalRequirement]] = Field(None, description="Conditional required/optional rules")
    order: int = Field(default=0, description="Display order")
    section_id: Optional[str] = Field(None, description="Optional section ID this field belongs to")


# ============================================================================
# Condition & Transition
# ============================================================================

class Condition(BaseModel):
    """Condition for transitions"""
    model_config = ConfigDict(extra="forbid")
    
    field: str = Field(..., description="Field to evaluate")
    operator: ConditionOperator = Field(..., description="Comparison operator")
    value: Any = Field(..., description="Value to compare against")


class ConditionGroup(BaseModel):
    """Group of conditions with AND/OR logic"""
    model_config = ConfigDict(extra="forbid")
    
    logic: str = Field("AND", description="AND or OR")
    conditions: List[Condition] = Field(default_factory=list)


class TransitionTemplate(BaseModel):
    """Transition definition in workflow"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields for flexibility
    
    transition_id: Optional[str] = Field(default=None, description="Unique transition ID")
    from_step_id: str = Field(..., description="Source step ID")
    to_step_id: str = Field(..., description="Target step ID")
    on_event: Optional[TransitionEvent] = Field(default=None, description="Triggering event")
    trigger_event: Optional[str] = Field(default=None, description="Legacy trigger event field")
    condition: Optional[ConditionGroup] = Field(None, description="Condition to evaluate")
    priority: int = Field(default=0, description="Priority for multiple transitions")
    
    @property
    def event(self) -> str:
        """Get the event (supports both on_event and trigger_event)"""
        if self.on_event:
            return self.on_event.value
        return self.trigger_event or "STEP_COMPLETED"


# ============================================================================
# SLA Configuration
# ============================================================================

class SlaReminder(BaseModel):
    """SLA reminder configuration"""
    minutes_before_due: int = Field(..., description="Minutes before due to send reminder")
    recipients: List[str] = Field(default_factory=list, description="Email recipients")


class SlaEscalation(BaseModel):
    """SLA escalation configuration"""
    minutes_after_due: int = Field(..., description="Minutes after due to escalate")
    recipients: List[str] = Field(default_factory=list, description="Escalation recipients")


class SlaConfig(BaseModel):
    """SLA configuration for a step"""
    model_config = ConfigDict(extra="forbid")
    
    due_minutes: int = Field(..., description="Minutes until step is due")
    reminders: List[SlaReminder] = Field(default_factory=list)
    escalations: List[SlaEscalation] = Field(default_factory=list)


# ============================================================================
# Step Templates (Workflow Definition)
# ============================================================================

class NotificationConfig(BaseModel):
    """Notification configuration for step"""
    template_key: NotificationTemplateKey
    recipients: List[str] = Field(default_factory=list, description="Recipient types: requester, manager, assigned_agent, or emails")


class BaseStepTemplate(BaseModel):
    """Base step template"""
    model_config = ConfigDict(extra="forbid")
    
    step_id: str = Field(..., description="Unique step ID")
    step_name: str = Field(..., description="Display name")
    step_type: StepType = Field(..., description="Step type")
    description: Optional[str] = None
    sla: Optional[SlaConfig] = None
    notifications: List[NotificationConfig] = Field(default_factory=list)
    order: int = Field(default=0, description="Step order")
    is_start: bool = Field(default=False, description="Is this the start step")
    is_terminal: bool = Field(default=False, description="Is this a terminal step")


class FormStepTemplate(BaseStepTemplate):
    """Form step template"""
    step_type: StepType = StepType.FORM_STEP
    fields: List[FormField] = Field(default_factory=list)
    sections: List[FormSection] = Field(default_factory=list, description="Sections for organizing form fields")


class ConditionalApproverRule(BaseModel):
    """Rule for conditional approver assignment"""
    model_config = ConfigDict(extra="forbid")
    
    field_key: str = Field(..., description="Form field key to evaluate")
    operator: ConditionOperator = Field(..., description="Comparison operator")
    value: Any = Field(..., description="Value to compare against")
    approver_email: EmailStr = Field(..., description="Approver email if condition matches")
    approver_aad_id: Optional[str] = Field(None, description="Approver AAD ID")
    approver_display_name: Optional[str] = Field(None, description="Approver display name")


class ApprovalStepTemplate(BaseStepTemplate):
    """Approval step template"""
    step_type: StepType = StepType.APPROVAL_STEP
    approver_resolution: ApproverResolution = Field(default=ApproverResolution.REQUESTER_MANAGER)
    specific_approver_email: Optional[EmailStr] = None
    spoc_email: Optional[EmailStr] = None
    allow_reassign: bool = Field(default=False)
    parallel_approval: Optional[ParallelApprovalRule] = None
    parallel_approvers: Optional[List[EmailStr]] = None
    parallel_approvers_info: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Full info for parallel approvers (email, aad_id, display_name)"
    )
    primary_approver_email: Optional[EmailStr] = Field(
        None,
        description="Primary approver responsible for task assignment in parallel approvals"
    )
    # Conditional approver routing
    conditional_approver_rules: Optional[List[ConditionalApproverRule]] = Field(
        None, 
        description="Rules for conditional approver assignment based on form field values"
    )
    conditional_fallback_approver: Optional[EmailStr] = Field(
        None,
        description="Fallback approver if no conditional rules match (defaults to SPOC or manager)"
    )
    # Step assignee approver routing
    step_assignee_step_id: Optional[str] = Field(
        None,
        description="Step ID to reference for STEP_ASSIGNEE resolution (e.g., task step whose assignee becomes approver)"
    )


class LinkedRepeatingSource(BaseModel):
    """Configuration for linking a task's agent form to a repeating section from an earlier form.
    When linked, the agent form fields repeat N times where N = number of rows in the source section."""
    model_config = ConfigDict(extra="ignore")
    
    source_step_id: str = Field(..., description="The form step ID that has the repeating section")
    source_section_id: str = Field(..., description="The repeating section ID to link to")
    context_field_keys: List[str] = Field(
        default_factory=list, 
        description="Field keys from source section to show as read-only context per row"
    )


class TaskStepTemplate(BaseStepTemplate):
    """Task step template - assigned by manager to agent"""
    step_type: StepType = StepType.TASK_STEP
    instructions: Optional[str] = Field(None, description="Task instructions for agent")
    execution_notes_required: bool = Field(default=True)
    output_fields: List[FormField] = Field(default_factory=list)
    # Form fields for agent to fill (embedded form in task)
    fields: Optional[List[FormField]] = Field(None, description="Form fields for agent to fill as part of task completion")
    sections: Optional[List[FormSection]] = Field(None, description="Sections for organizing form fields in task")
    # Linked Repeating Source - Links task's agent form to a repeating section from an earlier form
    linked_repeating_source: Optional[LinkedRepeatingSource] = Field(
        None, 
        description="When set, agent form fields repeat based on rows in the linked repeating section"
    )


class NotifyStepTemplate(BaseStepTemplate):
    """Notification step - auto-advances"""
    step_type: StepType = StepType.NOTIFY_STEP
    notification_template: NotificationTemplateKey
    recipients: List[str] = Field(default_factory=list)
    auto_advance: bool = Field(default=True)


class BranchDefinition(BaseModel):
    """Definition of a single parallel branch"""
    model_config = ConfigDict(extra="ignore")
    
    branch_id: str = Field(..., description="Unique branch identifier")
    branch_name: str = Field(..., description="Display name for the branch")
    description: Optional[str] = None
    assigned_team: Optional[str] = Field(None, description="Team responsible for this branch")
    start_step_id: str = Field(..., description="First step ID in this branch")
    color: Optional[str] = Field(None, description="UI color for this branch")


class ForkStepTemplate(BaseStepTemplate):
    """Fork step - splits workflow into parallel branches"""
    step_type: StepType = StepType.FORK_STEP
    branches: List[BranchDefinition] = Field(default_factory=list, description="Parallel branches")
    failure_policy: BranchFailurePolicy = Field(
        default=BranchFailurePolicy.FAIL_ALL,
        description="What happens when a branch fails"
    )


class JoinStepTemplate(BaseStepTemplate):
    """Join step - waits for parallel branches to complete"""
    step_type: StepType = StepType.JOIN_STEP
    join_mode: ForkJoinMode = Field(
        default=ForkJoinMode.ALL,
        description="How to determine when join completes"
    )
    source_fork_step_id: Optional[str] = Field(default=None, description="The fork step this joins")
    timeout_minutes: Optional[int] = Field(None, description="Optional timeout for waiting")


class SubWorkflowStepTemplate(BaseStepTemplate):
    """
    Sub-workflow step - embeds a published workflow as a reusable component.
    
    This allows designers to compose complex workflows by reusing previously
    published workflows. The sub-workflow runs as part of the same ticket,
    with all steps executed in sequence within the parent workflow.
    
    Key behaviors:
    - Sub-workflow steps are created as TicketSteps when this step activates
    - Form values are shared between parent and sub-workflow
    - Requester and manager remain the same as parent ticket
    - SLA, notifications, assignments all work normally for sub-workflow steps
    - Sub-workflow completion/rejection affects parent based on position (branch vs main flow)
    """
    step_type: StepType = StepType.SUB_WORKFLOW_STEP
    
    # Reference to the published workflow
    sub_workflow_id: str = Field(..., description="ID of the published workflow to embed")
    sub_workflow_version: int = Field(..., description="Version number of the workflow (locked at design time)")
    sub_workflow_name: str = Field(..., description="Display name of the sub-workflow")
    
    # Optional: Category/tags for display purposes
    sub_workflow_category: Optional[str] = Field(None, description="Category of the sub-workflow")
    
    # Sub-workflow cannot contain other sub-workflows (Level 1 only)
    # This is enforced at validation time, not in the model


# Union type for step templates
StepTemplate = FormStepTemplate | ApprovalStepTemplate | TaskStepTemplate | NotifyStepTemplate | ForkStepTemplate | JoinStepTemplate | SubWorkflowStepTemplate


# ============================================================================
# Workflow Template & Version
# ============================================================================

class WorkflowDefinition(BaseModel):
    """Complete workflow definition"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields for flexibility
    
    steps: List[Dict[str, Any]] = Field(default_factory=list, description="Step templates")
    transitions: List[TransitionTemplate] = Field(default_factory=list)
    start_step_id: Optional[str] = Field(default=None, description="ID of first step")
    
    def get_start_step_id(self) -> Optional[str]:
        """Get start step ID, inferring from first step if not set"""
        if self.start_step_id:
            return self.start_step_id
        if self.steps:
            return self.steps[0].get("step_id")
        return None


class WorkflowTemplate(BaseModel):
    """Workflow template (draft + metadata)"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields for flexibility
    
    workflow_id: str = Field(..., description="Unique workflow ID")
    name: str = Field(..., description="Workflow name")
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    status: WorkflowStatus = Field(default=WorkflowStatus.DRAFT)
    definition: Optional[WorkflowDefinition] = None
    created_by: UserSnapshot
    created_at: datetime
    updated_at: datetime
    published_version: Optional[int] = None
    current_version: Optional[int] = Field(default=None, description="Current published version number")
    version: int = Field(default=1, description="Optimistic concurrency version")


class WorkflowVersion(BaseModel):
    """Published workflow version (immutable)"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields for flexibility
    
    workflow_version_id: Optional[str] = Field(default=None, description="Unique version ID")
    version_id: Optional[str] = Field(default=None, description="Alias for workflow_version_id")
    workflow_id: str = Field(..., description="Parent workflow ID")
    version_number: int = Field(..., description="Version number")
    name: Optional[str] = Field(default=None)
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    definition: Optional[WorkflowDefinition] = None
    published_by: Optional[UserSnapshot] = None
    published_at: Optional[datetime] = None
    created_by: Optional[UserSnapshot] = None
    created_at: Optional[datetime] = None
    change_summary: Optional[str] = None
    change_notes: Optional[str] = None
    status: Optional[str] = None


# ============================================================================
# Ticket Runtime Models
# ============================================================================

class BranchState(BaseModel):
    """Runtime state for a parallel branch"""
    model_config = ConfigDict(extra="ignore")
    
    branch_id: str
    branch_name: str
    parent_fork_step_id: Optional[str] = Field(None, description="Fork step that created this branch")
    state: StepState = Field(default=StepState.NOT_STARTED)
    current_step_id: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    outcome: Optional[str] = None  # "COMPLETED", "REJECTED", "CANCELLED"


class RequesterNote(BaseModel):
    """Note added by the requester at ticket level"""
    model_config = ConfigDict(extra="forbid")
    
    note_id: str = Field(..., description="Unique note ID")
    content: str = Field(..., description="Note content")
    actor: UserSnapshot = Field(..., description="Who added the note")
    created_at: str = Field(..., description="ISO timestamp when note was created")
    attachment_ids: List[str] = Field(default_factory=list, description="Attachment IDs for this note")


class Ticket(BaseModel):
    """Ticket instance (runtime)"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields for flexibility
    
    ticket_id: str = Field(..., description="Unique ticket ID")
    workflow_id: str
    workflow_version_id: str
    workflow_version: Optional[int] = Field(default=None, description="Workflow version number for API calls")
    workflow_name: str
    title: str
    description: Optional[str] = None
    status: TicketStatus = Field(default=TicketStatus.OPEN)
    current_step_id: Optional[str] = None
    workflow_start_step_id: Optional[str] = Field(default=None, description="ID of the first step in workflow")
    requester: UserSnapshot
    manager_snapshot: Optional[UserSnapshot] = None
    form_values: Dict[str, Any] = Field(default_factory=dict)
    attachment_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    version: int = Field(default=1, description="Optimistic concurrency version")
    # Parallel branching fields
    active_branches: List[BranchState] = Field(default_factory=list, description="Currently active parallel branches")
    current_step_ids: List[str] = Field(default_factory=list, description="All currently active step IDs (for parallel execution)")
    # ANY/MAJORITY join tracking - for deferred NOTIFY execution
    join_proceeded: bool = Field(default=False, description="True when ANY/MAJORITY join has proceeded (branches may still be active)")
    pending_end_step_id: Optional[str] = Field(default=None, description="ticket_step_id of NOTIFY step waiting for all branches to complete")
    # Requester notes - ticket-level notes from the requester
    requester_notes: List[RequesterNote] = Field(default_factory=list, description="Notes added by the requester")
    # Change Request versioning fields (optional - backward compatible)
    form_version: int = Field(default=1, description="Current form data version number")
    form_versions: Optional[List[Dict[str, Any]]] = Field(default=None, description="Version history of form data")
    pending_change_request_id: Optional[str] = Field(default=None, description="ID of pending CR if any")


class TicketStep(BaseModel):
    """Runtime state for a ticket step"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields for flexibility
    
    ticket_step_id: str = Field(..., description="Unique ticket step ID")
    ticket_id: str
    step_id: str = Field(..., description="Reference to step template")
    step_name: str
    step_type: StepType
    state: StepState = Field(default=StepState.NOT_STARTED)
    assigned_to: Optional[UserSnapshot] = None
    data: Dict[str, Any] = Field(default_factory=dict, description="Step-specific data (form_values, execution_notes)")
    outcome: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    previous_state: Optional[StepState] = None
    version: int = Field(default=1)
    # Parallel approval fields (for approval steps with multiple approvers)
    parallel_pending_approvers: Optional[List[str]] = Field(None, description="List of emails of approvers who haven't decided yet")
    parallel_completed_approvers: Optional[List[str]] = Field(None, description="List of emails of approvers who have approved")
    parallel_approval_rule: Optional[str] = Field(None, description="ALL or ANY")
    primary_approver_email: Optional[str] = Field(None, description="Primary approver responsible for task assignment")
    # Parallel branching fields
    branch_id: Optional[str] = Field(None, description="Branch this step belongs to (null for main flow)")
    branch_name: Optional[str] = Field(None, description="Display name of the branch")
    parent_fork_step_id: Optional[str] = Field(None, description="Fork step that created this branch")
    branch_order: Optional[int] = Field(None, description="Order within the branch for UI display")
    # Sub-workflow tracking fields
    parent_sub_workflow_step_id: Optional[str] = Field(
        None, 
        description="If this step is part of a sub-workflow, the ticket_step_id of the parent SUB_WORKFLOW_STEP"
    )
    from_sub_workflow_id: Optional[str] = Field(
        None, 
        description="The workflow_id this step originated from (if part of a sub-workflow)"
    )
    from_sub_workflow_version: Optional[int] = Field(
        None,
        description="The version number of the sub-workflow this step originated from"
    )
    from_sub_workflow_name: Optional[str] = Field(
        None,
        description="Display name of the sub-workflow this step belongs to"
    )
    sub_workflow_step_order: Optional[int] = Field(
        None,
        description="Order within the sub-workflow for progress display"
    )


class ApprovalTask(BaseModel):
    """Approval task for approval steps"""
    model_config = ConfigDict(extra="ignore")
    
    approval_task_id: str
    ticket_id: str
    ticket_step_id: str
    approver: UserSnapshot
    decision: ApprovalDecision = Field(default=ApprovalDecision.PENDING)
    comment: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    version: int = 1


class Assignment(BaseModel):
    """Assignment history record"""
    model_config = ConfigDict(extra="forbid")
    
    assignment_id: str
    ticket_id: str
    ticket_step_id: str
    assigned_to: UserSnapshot
    assigned_by: UserSnapshot
    status: AssignmentStatus = Field(default=AssignmentStatus.ACTIVE)
    reason: Optional[str] = None
    assigned_at: datetime
    ended_at: Optional[datetime] = None


class InfoRequest(BaseModel):
    """Info request bidirectional thread"""
    model_config = ConfigDict(extra="forbid")
    
    info_request_id: str
    ticket_id: str
    ticket_step_id: str
    requested_by: UserSnapshot
    requested_from: Optional[UserSnapshot] = Field(None, description="Who the request is directed to (requester or previous agent). If None, defaults to requester.")
    requested_from_step_type: Optional[str] = Field(None, description="Step type of the recipient: TASK_STEP, APPROVAL_STEP, or REQUESTER")
    subject: Optional[str] = Field(None, description="Subject line for the info request")
    question_text: str
    request_attachment_ids: List[str] = Field(default_factory=list, description="Attachments sent with the request")
    status: InfoRequestStatus = Field(default=InfoRequestStatus.OPEN)
    response_text: Optional[str] = None
    response_attachment_ids: List[str] = Field(default_factory=list)
    responded_by: Optional[UserSnapshot] = None
    requested_at: datetime
    responded_at: Optional[datetime] = None


class HandoverRequest(BaseModel):
    """Agent handover request"""
    model_config = ConfigDict(extra="forbid")
    
    handover_request_id: str
    ticket_id: str
    ticket_step_id: str
    requested_by: UserSnapshot = Field(..., description="Agent requesting handover")
    requested_to: Optional[UserSnapshot] = Field(None, description="Suggested agent or manager to decide")
    reason: str = Field(..., description="Reason for handover request")
    status: HandoverRequestStatus = Field(default=HandoverRequestStatus.PENDING)
    decided_by: Optional[UserSnapshot] = None
    decision_comment: Optional[str] = None
    new_assignee: Optional[UserSnapshot] = None
    requested_at: datetime
    decided_at: Optional[datetime] = None


class SlaAcknowledgment(BaseModel):
    """SLA acknowledgment record"""
    model_config = ConfigDict(extra="forbid")
    
    acknowledgment_id: str
    ticket_id: str
    ticket_step_id: str
    acknowledged_by: UserSnapshot
    acknowledged_at: datetime
    notes: Optional[str] = None


# ============================================================================
# Attachment
# ============================================================================

class Attachment(BaseModel):
    """File attachment"""
    model_config = ConfigDict(extra="forbid")
    
    attachment_id: str
    ticket_id: str
    ticket_step_id: Optional[str] = None
    step_name: Optional[str] = Field(None, description="Name of the step this attachment belongs to")
    original_filename: str
    stored_filename: str
    mime_type: str
    size_bytes: int
    uploaded_by: UserSnapshot
    uploaded_at: datetime
    storage_path: str
    context: str = Field("ticket", description="Context: ticket, form, form_field, info_request")
    field_label: Optional[str] = Field(None, description="Form field label if context is form_field")
    description: Optional[str] = Field(None, description="User-provided description for the attachment")


# ============================================================================
# Notification Outbox
# ============================================================================

class NotificationOutbox(BaseModel):
    """Notification in outbox"""
    model_config = ConfigDict(extra="ignore")  # Allow extra fields from DB
    
    notification_id: str
    ticket_id: Optional[str] = None
    notification_type: NotificationType = Field(default=NotificationType.EMAIL)
    template_key: NotificationTemplateKey
    recipients: List[EmailStr]
    payload: Dict[str, Any] = Field(default_factory=dict)
    status: NotificationStatus = Field(default=NotificationStatus.PENDING)
    retry_count: int = Field(default=0)
    last_error: Optional[str] = None
    next_retry_at: Optional[datetime] = None
    locked_until: Optional[datetime] = None
    locked_by: Optional[str] = None
    lock_acquired_at: Optional[datetime] = None  # When the lock was acquired
    created_at: datetime
    sent_at: Optional[datetime] = None


# ============================================================================
# Audit Event
# ============================================================================

class AuditEvent(BaseModel):
    """Audit event (append-only)"""
    model_config = ConfigDict(extra="forbid")
    
    audit_event_id: str
    ticket_id: str
    ticket_step_id: Optional[str] = None
    event_type: AuditEventType
    actor: UserSnapshot
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime
    correlation_id: Optional[str] = None


# ============================================================================
# System Config
# ============================================================================

class SystemConfig(BaseModel):
    """System configuration"""
    model_config = ConfigDict(extra="forbid")
    
    config_id: str = Field(default="system")
    default_sla_minutes: Dict[str, int] = Field(default_factory=lambda: {
        "FORM_STEP": 1440,  # 24 hours
        "APPROVAL_STEP": 2880,  # 48 hours
        "TASK_STEP": 4320,  # 72 hours
    })
    allowed_mime_types: List[str] = Field(default_factory=list)
    max_attachment_size_mb: int = Field(default=50)
    notification_retry_max: int = Field(default=5)
    updated_at: datetime
    updated_by: Optional[UserSnapshot] = None


# ============================================================================
# Admin User & Access Control
# ============================================================================

class AdminUser(BaseModel):
    """Admin user with elevated permissions"""
    model_config = ConfigDict(extra="forbid")
    
    admin_user_id: str = Field(..., description="Unique admin user ID")
    aad_id: Optional[str] = Field(None, description="Azure AD object ID")
    email: EmailStr = Field(..., description="User email")
    display_name: str = Field(..., description="User display name")
    role: AdminRole = Field(..., description="Admin role")
    granted_by: Optional[str] = Field(None, description="Email of who granted access")
    granted_at: datetime = Field(..., description="When access was granted")
    is_active: bool = Field(default=True, description="Whether access is active")
    deactivated_at: Optional[datetime] = Field(None, description="When access was deactivated")
    deactivated_by: Optional[str] = Field(None, description="Email of who deactivated")


class AdminAuditEvent(BaseModel):
    """Admin-level audit event (separate from ticket audit)"""
    model_config = ConfigDict(extra="forbid")
    
    audit_id: str = Field(..., description="Unique audit event ID")
    action: AdminAuditAction = Field(..., description="Type of admin action")
    actor_email: str = Field(..., description="Who performed the action")
    actor_display_name: str = Field(..., description="Display name of actor")
    target_email: Optional[str] = Field(None, description="Target user if applicable")
    target_display_name: Optional[str] = Field(None, description="Target display name")
    details: Dict[str, Any] = Field(default_factory=dict, description="Additional details")
    timestamp: datetime = Field(..., description="When action occurred")
    ip_address: Optional[str] = Field(None, description="IP address if available")


class EmailTemplateOverride(BaseModel):
    """Custom email template override for admin customization"""
    model_config = ConfigDict(extra="forbid")
    
    template_id: str = Field(..., description="Unique template ID")
    template_key: str = Field(..., description="Template key (e.g., TICKET_CREATED)")
    workflow_id: Optional[str] = Field(None, description="If set, applies only to this workflow")
    custom_subject: Optional[str] = Field(None, description="Custom subject template")
    custom_body: Optional[str] = Field(None, description="Custom HTML body template")
    is_active: bool = Field(default=True, description="Whether override is active")
    created_at: datetime = Field(..., description="When created")
    created_by: str = Field(..., description="Email of who created")
    updated_at: Optional[datetime] = Field(None, description="Last update time")
    updated_by: Optional[str] = Field(None, description="Email of who last updated")


class UserAccess(BaseModel):
    """
    User persona access record.
    Controls which personas (Designer, Manager, Agent) a user can access.
    By default, all users have access to Main (Dashboard, Catalog, My Tickets).
    
    Each persona tracks HOW it was granted:
    - MANUAL: Admin manually granted via Access Control
    - TASK_ASSIGNMENT: Auto-onboarded when first assigned a task
    - REASSIGN_AGENT: Auto-onboarded via task reassignment
    - HANDOVER_ASSIGNMENT: Auto-onboarded via handover approval
    - APPROVAL_ASSIGNMENT: Auto-onboarded when first assigned as approver
    - APPROVAL_REASSIGNMENT: Auto-onboarded via approval reassignment
    - LOOKUP_ASSIGNMENT: Auto-onboarded via lookup table assignment
    """
    model_config = ConfigDict(extra="forbid")
    
    user_access_id: str = Field(..., description="Unique access record ID")
    aad_id: Optional[str] = Field(None, description="Azure AD object ID")
    email: EmailStr = Field(..., description="User email")
    display_name: str = Field(..., description="User display name")
    
    # Persona access flags
    has_designer_access: bool = Field(default=False, description="Can access Workflow Studio")
    has_manager_access: bool = Field(default=False, description="Can access Manager Dashboard")
    has_agent_access: bool = Field(default=False, description="Can access Agent Console")
    
    # Per-persona source tracking (how each persona was granted)
    designer_source: Optional[str] = Field(None, description="How designer access was granted")
    designer_granted_by: Optional[str] = Field(None, description="Who granted designer access")
    designer_granted_at: Optional[datetime] = Field(None, description="When designer access was granted")
    
    manager_source: Optional[str] = Field(None, description="How manager access was granted")
    manager_granted_by: Optional[str] = Field(None, description="Who granted manager access")
    manager_granted_at: Optional[datetime] = Field(None, description="When manager access was granted")
    
    agent_source: Optional[str] = Field(None, description="How agent access was granted")
    agent_granted_by: Optional[str] = Field(None, description="Who granted agent access")
    agent_granted_at: Optional[datetime] = Field(None, description="When agent access was granted")
    
    # Legacy: Original onboard source (kept for backward compatibility)
    onboard_source: str = Field(default="MANUAL", description="Original entry source into the system")
    onboarded_by: Optional[str] = Field(None, description="Email of who triggered original auto-onboard")
    onboarded_by_display_name: Optional[str] = Field(None, description="Display name of who triggered original auto-onboard")
    
    # Tracking
    granted_by: str = Field(..., description="Email of who first granted access")
    granted_at: datetime = Field(..., description="When access record was first created")
    updated_at: Optional[datetime] = Field(None, description="Last update time")
    updated_by: Optional[str] = Field(None, description="Who last updated")
    is_active: bool = Field(default=True, description="Whether access record is active")


# ============================================================================
# In-App Notifications
# ============================================================================

class InAppNotification(BaseModel):
    """
    In-app notification for the notification bell.
    Each notification targets a specific user and tracks read status.
    """
    model_config = ConfigDict(extra="forbid")
    
    notification_id: str = Field(..., description="Unique notification ID")
    recipient_email: EmailStr = Field(..., description="User who receives the notification")
    recipient_aad_id: Optional[str] = Field(None, description="AAD ID of recipient")
    
    # Notification content
    category: InAppNotificationCategory = Field(..., description="Category for grouping/filtering")
    title: str = Field(..., description="Short notification title")
    message: str = Field(..., description="Notification message body")
    
    # Context for navigation
    ticket_id: Optional[str] = Field(None, description="Related ticket ID for navigation")
    action_url: Optional[str] = Field(None, description="URL path to navigate to on click")
    
    # Actor who triggered this notification
    actor_email: Optional[str] = Field(None, description="Who triggered the notification")
    actor_display_name: Optional[str] = Field(None, description="Display name of actor")
    
    # Status
    is_read: bool = Field(default=False, description="Whether notification has been read")
    read_at: Optional[datetime] = Field(None, description="When notification was read")
    
    # Timestamps
    created_at: datetime = Field(..., description="When notification was created")
    expires_at: Optional[datetime] = Field(None, description="Optional expiry for auto-cleanup")


# ============================================================================
# Workflow Lookup Tables (Dynamic User Assignments)
# ============================================================================

class LookupUser(BaseModel):
    """A user entry within a lookup table"""
    model_config = ConfigDict(extra="forbid")
    
    aad_id: Optional[str] = Field(None, description="Azure AD object ID")
    email: EmailStr = Field(..., description="User email")
    display_name: str = Field(..., description="User display name")
    is_primary: bool = Field(default=False, description="Whether this is the primary user")
    order: int = Field(default=0, description="Display order")


class LookupEntry(BaseModel):
    """
    A single entry in a lookup table.
    Maps a key (e.g., "Insurance", "Healthcare") to a list of users
    with primary/secondary designation.
    """
    model_config = ConfigDict(extra="ignore")  # Ignore legacy 'value' field in old documents
    
    entry_id: str = Field(..., description="Unique entry ID")
    key: str = Field(..., description="Lookup key value (e.g., 'Insurance', 'Healthcare')")
    display_label: Optional[str] = Field(None, description="Optional display label for the key")
    users: List[LookupUser] = Field(default_factory=list, description="Users assigned to this key")
    is_active: bool = Field(default=True, description="Whether this entry is active")


class WorkflowLookup(BaseModel):
    """
    Workflow-specific lookup table for dynamic user assignments.
    
    Use cases:
    - IMU Leads: Map business units to team leads (primary + secondary)
    - Approvers by Region: Map regions to designated approvers
    - SMEs by Category: Map categories to subject matter experts
    
    Features:
    - Each entry maps a key to multiple users with primary/secondary roles
    - Can be linked to form fields (dropdown/select) for automatic population
    - Primary user can be used for approval routing
    - Admin can update without republishing workflow
    """
    model_config = ConfigDict(extra="forbid")
    
    lookup_id: str = Field(..., description="Unique lookup table ID")
    workflow_id: str = Field(..., description="Parent workflow ID")
    
    # Metadata
    name: str = Field(..., min_length=1, max_length=200, description="Lookup table name (e.g., 'IMU Leads')")
    description: Optional[str] = Field(None, max_length=2000, description="Description of the lookup purpose")
    
    # Configuration
    source_field_key: Optional[str] = Field(None, description="Form field key that provides the lookup key (e.g., dropdown)")
    source_step_id: Optional[str] = Field(None, description="Form step containing the source field")
    
    # Entries
    entries: List[LookupEntry] = Field(default_factory=list, description="Lookup entries")
    
    # Audit
    created_by: UserSnapshot = Field(..., description="Who created the lookup")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_by: Optional[UserSnapshot] = Field(None, description="Last updater")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    # Status
    is_active: bool = Field(default=True, description="Whether lookup is active")
    version: int = Field(default=1, description="Version for optimistic concurrency")