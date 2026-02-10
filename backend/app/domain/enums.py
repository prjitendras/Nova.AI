"""Domain Enumerations - All status and type definitions"""
from enum import Enum


class TicketStatus(str, Enum):
    """Global ticket status"""
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_REQUESTER = "WAITING_FOR_REQUESTER"
    WAITING_FOR_AGENT = "WAITING_FOR_AGENT"  # Waiting for agent to respond to info request
    WAITING_FOR_CR = "WAITING_FOR_CR"  # Waiting for Change Request to be approved/rejected
    ON_HOLD = "ON_HOLD"  # Ticket is on hold (paused)
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"  # Workflow skipped by approver (similar to rejected but different intent)
    CANCELLED = "CANCELLED"


class StepState(str, Enum):
    """Runtime state per ticket step"""
    NOT_STARTED = "NOT_STARTED"
    ACTIVE = "ACTIVE"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    WAITING_FOR_REQUESTER = "WAITING_FOR_REQUESTER"
    WAITING_FOR_AGENT = "WAITING_FOR_AGENT"  # Waiting for agent to respond to info request
    WAITING_FOR_BRANCHES = "WAITING_FOR_BRANCHES"  # Join step waiting for parallel branches
    WAITING_FOR_CR = "WAITING_FOR_CR"  # Waiting for Change Request approval/rejection
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"
    CANCELLED = "CANCELLED"  # Cancelled due to parallel branch failure
    ON_HOLD = "ON_HOLD"


class StepType(str, Enum):
    """Types of workflow steps"""
    FORM_STEP = "FORM_STEP"
    APPROVAL_STEP = "APPROVAL_STEP"
    TASK_STEP = "TASK_STEP"
    NOTIFY_STEP = "NOTIFY_STEP"
    FORK_STEP = "FORK_STEP"  # Splits workflow into parallel branches
    JOIN_STEP = "JOIN_STEP"  # Waits for all parallel branches to complete
    SUB_WORKFLOW_STEP = "SUB_WORKFLOW_STEP"  # Embeds a published workflow as a reusable component


class ForkJoinMode(str, Enum):
    """How to handle parallel branch completion at join"""
    ALL = "ALL"              # All branches must complete successfully
    ANY = "ANY"              # Any one branch completing is sufficient
    MAJORITY = "MAJORITY"    # Majority of branches must complete
    
    
class BranchFailurePolicy(str, Enum):
    """What happens when a branch fails (rejection)"""
    FAIL_ALL = "FAIL_ALL"              # Entire workflow fails
    CONTINUE_OTHERS = "CONTINUE_OTHERS"  # Other branches continue, join waits for non-failed
    CANCEL_OTHERS = "CANCEL_OTHERS"      # Cancel other branches, workflow fails


class ApprovalDecision(str, Enum):
    """Approval task outcomes"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"  # Approver chose to skip the entire workflow
    CANCELLED = "CANCELLED"


class ApproverResolution(str, Enum):
    """How to resolve the approver for an approval step"""
    REQUESTER_MANAGER = "REQUESTER_MANAGER"
    SPECIFIC_EMAIL = "SPECIFIC_EMAIL"
    SPOC_EMAIL = "SPOC_EMAIL"
    CONDITIONAL = "CONDITIONAL"  # Route to approver based on form field values
    STEP_ASSIGNEE = "STEP_ASSIGNEE"  # Route to the assignee of a specified step (e.g., task step)
    FROM_LOOKUP = "FROM_LOOKUP"  # Route to primary user from a workflow lookup table based on form field


class AssignmentStatus(str, Enum):
    """Assignment history status"""
    ACTIVE = "ACTIVE"
    REASSIGNED = "REASSIGNED"
    COMPLETED = "COMPLETED"


class InfoRequestStatus(str, Enum):
    """Info request bidirectional thread status"""
    OPEN = "OPEN"
    RESPONDED = "RESPONDED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"  # When approval/rejection happens while info request is pending


class NotificationStatus(str, Enum):
    """Notification outbox status"""
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class NotificationType(str, Enum):
    """Types of notifications"""
    EMAIL = "EMAIL"
    IN_APP = "IN_APP"


class NotificationTemplateKey(str, Enum):
    """Notification template identifiers"""
    TICKET_CREATED = "TICKET_CREATED"
    APPROVAL_PENDING = "APPROVAL_PENDING"
    APPROVAL_REASSIGNED = "APPROVAL_REASSIGNED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"  # Workflow skipped by approver
    INFO_REQUESTED = "INFO_REQUESTED"
    INFO_RESPONDED = "INFO_RESPONDED"
    FORM_PENDING = "FORM_PENDING"  # For mid-workflow forms
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_REASSIGNED = "TASK_REASSIGNED"
    TASK_COMPLETED = "TASK_COMPLETED"
    NOTE_ADDED = "NOTE_ADDED"  # For activity log notes
    REQUESTER_NOTE_ADDED = "REQUESTER_NOTE_ADDED"  # For requester notes at ticket level
    SLA_REMINDER = "SLA_REMINDER"
    SLA_ESCALATION = "SLA_ESCALATION"
    TICKET_CANCELLED = "TICKET_CANCELLED"
    TICKET_COMPLETED = "TICKET_COMPLETED"
    LOOKUP_USER_ASSIGNED = "LOOKUP_USER_ASSIGNED"  # For lookup user notifications on ticket creation
    # Change Request templates
    CHANGE_REQUEST_PENDING = "CHANGE_REQUEST_PENDING"  # For approver when CR is created
    CHANGE_REQUEST_SUBMITTED = "CHANGE_REQUEST_SUBMITTED"  # Confirmation to requester
    CHANGE_REQUEST_APPROVED = "CHANGE_REQUEST_APPROVED"  # For requester when CR is approved
    CHANGE_REQUEST_REJECTED = "CHANGE_REQUEST_REJECTED"  # For requester when CR is rejected
    CHANGE_REQUEST_CANCELLED = "CHANGE_REQUEST_CANCELLED"  # For approver when CR is cancelled
    CHANGE_REQUEST_WORKFLOW_PAUSED = "CHANGE_REQUEST_WORKFLOW_PAUSED"  # Notify all parties that workflow is paused for CR
    CHANGE_REQUEST_WORKFLOW_RESUMED = "CHANGE_REQUEST_WORKFLOW_RESUMED"  # Notify all parties that workflow has resumed


class WorkflowStatus(str, Enum):
    """Workflow template status"""
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class TransitionEvent(str, Enum):
    """Events that trigger transitions"""
    SUBMIT_FORM = "SUBMIT_FORM"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    SKIP = "SKIP"  # Skip the workflow (like reject but different status)
    COMPLETE_TASK = "COMPLETE_TASK"
    REQUEST_INFO = "REQUEST_INFO"
    RESPOND_INFO = "RESPOND_INFO"
    ASSIGN_AGENT = "ASSIGN_AGENT"
    REASSIGN_AGENT = "REASSIGN_AGENT"
    CANCEL = "CANCEL"
    ON_HOLD = "ON_HOLD"
    RESUME = "RESUME"
    SKIP_STEP = "SKIP_STEP"
    HANDOVER_REQUEST = "HANDOVER_REQUEST"
    ACKNOWLEDGE_SLA = "ACKNOWLEDGE_SLA"
    # Parallel workflow events
    FORK_ACTIVATED = "FORK_ACTIVATED"
    BRANCH_COMPLETED = "BRANCH_COMPLETED"
    JOIN_COMPLETE = "JOIN_COMPLETE"
    # Sub-workflow events
    SUB_WORKFLOW_START = "SUB_WORKFLOW_START"
    SUB_WORKFLOW_COMPLETED = "SUB_WORKFLOW_COMPLETED"
    SUB_WORKFLOW_FAILED = "SUB_WORKFLOW_FAILED"


class HandoverRequestStatus(str, Enum):
    """Status of handover request"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class AuditEventType(str, Enum):
    """Types of audit events"""
    CREATE_TICKET = "CREATE_TICKET"
    SUBMIT_FORM = "SUBMIT_FORM"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    SKIP = "SKIP"  # Workflow skipped by approver
    REQUEST_INFO = "REQUEST_INFO"
    RESPOND_INFO = "RESPOND_INFO"
    ASSIGN_AGENT = "ASSIGN_AGENT"
    REASSIGN_AGENT = "REASSIGN_AGENT"
    REASSIGN_APPROVAL = "REASSIGN_APPROVAL"
    COMPLETE_TASK = "COMPLETE_TASK"
    NOTE_ADDED = "NOTE_ADDED"
    REQUESTER_NOTE_ADDED = "REQUESTER_NOTE_ADDED"  # Ticket-level note from requester
    CANCEL_TICKET = "CANCEL_TICKET"
    TICKET_COMPLETED = "TICKET_COMPLETED"
    SLA_REMINDER = "SLA_REMINDER"
    SLA_ESCALATION = "SLA_ESCALATION"
    SLA_ACKNOWLEDGED = "SLA_ACKNOWLEDGED"
    ENGINE_ERROR = "ENGINE_ERROR"
    STEP_ACTIVATED = "STEP_ACTIVATED"
    STEP_COMPLETED = "STEP_COMPLETED"
    STEP_SKIPPED = "STEP_SKIPPED"
    STEP_CANCELLED = "STEP_CANCELLED"
    PUT_ON_HOLD = "PUT_ON_HOLD"
    RESUMED = "RESUMED"
    HANDOVER_REQUESTED = "HANDOVER_REQUESTED"
    HANDOVER_APPROVED = "HANDOVER_APPROVED"
    HANDOVER_REJECTED = "HANDOVER_REJECTED"
    HANDOVER_CANCELLED = "HANDOVER_CANCELLED"
    # Parallel workflow events
    FORK_ACTIVATED = "FORK_ACTIVATED"
    BRANCH_STARTED = "BRANCH_STARTED"
    BRANCH_COMPLETED = "BRANCH_COMPLETED"
    BRANCH_FAILED = "BRANCH_FAILED"
    JOIN_WAITING = "JOIN_WAITING"
    JOIN_COMPLETED = "JOIN_COMPLETED"
    # Sub-workflow events
    SUB_WORKFLOW_STARTED = "SUB_WORKFLOW_STARTED"
    SUB_WORKFLOW_COMPLETED = "SUB_WORKFLOW_COMPLETED"
    # Notification events
    NOTIFY_SENT = "NOTIFY_SENT"
    SUB_WORKFLOW_FAILED = "SUB_WORKFLOW_FAILED"
    # Change request events
    CHANGE_REQUEST_CREATED = "CHANGE_REQUEST_CREATED"
    CHANGE_REQUEST_APPROVED = "CHANGE_REQUEST_APPROVED"
    CHANGE_REQUEST_REJECTED = "CHANGE_REQUEST_REJECTED"
    CHANGE_REQUEST_CANCELLED = "CHANGE_REQUEST_CANCELLED"
    CHANGE_REQUEST_WORKFLOW_PAUSED = "CHANGE_REQUEST_WORKFLOW_PAUSED"
    CHANGE_REQUEST_WORKFLOW_RESUMED = "CHANGE_REQUEST_WORKFLOW_RESUMED"


class FormFieldType(str, Enum):
    """Supported form field types"""
    TEXT = "TEXT"
    TEXTAREA = "TEXTAREA"
    NUMBER = "NUMBER"
    DATE = "DATE"
    SELECT = "SELECT"
    MULTISELECT = "MULTISELECT"
    CHECKBOX = "CHECKBOX"
    FILE = "FILE"  # Indicates attachment requirement
    USER_SELECT = "USER_SELECT"  # Searchable user selector for EXL users
    LOOKUP_USER_SELECT = "LOOKUP_USER_SELECT"  # Select user from a lookup table based on linked dropdown


class ParallelApprovalRule(str, Enum):
    """Rules for parallel approvals"""
    ALL = "ALL"  # All approvers must approve
    ANY = "ANY"  # Any one approver approval is sufficient


class ConditionOperator(str, Enum):
    """Operators for condition evaluation"""
    EQUALS = "EQUALS"
    NOT_EQUALS = "NOT_EQUALS"
    GREATER_THAN = "GREATER_THAN"
    LESS_THAN = "LESS_THAN"
    GREATER_THAN_OR_EQUALS = "GREATER_THAN_OR_EQUALS"
    LESS_THAN_OR_EQUALS = "LESS_THAN_OR_EQUALS"
    CONTAINS = "CONTAINS"
    NOT_CONTAINS = "NOT_CONTAINS"
    IN = "IN"
    NOT_IN = "NOT_IN"
    IS_EMPTY = "IS_EMPTY"
    IS_NOT_EMPTY = "IS_NOT_EMPTY"


# ============================================================================
# Admin & Roles
# ============================================================================

class AdminRole(str, Enum):
    """Admin roles in the system"""
    SUPER_ADMIN = "SUPER_ADMIN"  # Full system access, can create other admins
    ADMIN = "ADMIN"              # Can manage designers and view audit logs
    DESIGNER = "DESIGNER"        # Can create/edit workflows


class PersonaType(str, Enum):
    """Persona types that can be granted to users"""
    DESIGNER = "DESIGNER"   # Workflow Studio access
    MANAGER = "MANAGER"     # Manager Dashboard, Approvals, Assignments, Handovers
    AGENT = "AGENT"         # Agent Dashboard, My Tasks, Task History


class OnboardSource(str, Enum):
    """How the user was onboarded to the system"""
    MANUAL = "MANUAL"                      # Admin manually added
    TASK_ASSIGNMENT = "TASK_ASSIGNMENT"    # Auto-onboarded when first assigned a task
    REASSIGN_AGENT = "REASSIGN_AGENT"      # Auto-onboarded via task reassignment
    HANDOVER_ASSIGNMENT = "HANDOVER_ASSIGNMENT"  # Auto-onboarded via handover approval
    APPROVAL_ASSIGNMENT = "APPROVAL_ASSIGNMENT"  # Auto-onboarded when assigned as approver
    APPROVAL_REASSIGNMENT = "APPROVAL_REASSIGNMENT"  # Auto-onboarded when approval reassigned
    LOOKUP_ASSIGNMENT = "LOOKUP_ASSIGNMENT"  # Auto-onboarded via lookup user assignment


class InAppNotificationCategory(str, Enum):
    """Categories for in-app notifications"""
    APPROVAL = "APPROVAL"           # Pending approvals, approval decisions
    TASK = "TASK"                   # Task assignments, completions
    INFO_REQUEST = "INFO_REQUEST"   # Information requests and responses
    TICKET = "TICKET"               # Ticket creation, completion, cancellation
    SYSTEM = "SYSTEM"               # System messages, onboarding


class AdminAuditAction(str, Enum):
    """Types of admin audit actions"""
    GRANT_DESIGNER_ACCESS = "GRANT_DESIGNER_ACCESS"
    REVOKE_DESIGNER_ACCESS = "REVOKE_DESIGNER_ACCESS"
    GRANT_MANAGER_ACCESS = "GRANT_MANAGER_ACCESS"
    REVOKE_MANAGER_ACCESS = "REVOKE_MANAGER_ACCESS"
    GRANT_AGENT_ACCESS = "GRANT_AGENT_ACCESS"
    REVOKE_AGENT_ACCESS = "REVOKE_AGENT_ACCESS"
    UPDATE_USER_ACCESS = "UPDATE_USER_ACCESS"
    GRANT_ADMIN_ACCESS = "GRANT_ADMIN_ACCESS"
    REVOKE_ADMIN_ACCESS = "REVOKE_ADMIN_ACCESS"
    UPDATE_SYSTEM_CONFIG = "UPDATE_SYSTEM_CONFIG"
    UPDATE_EMAIL_TEMPLATE = "UPDATE_EMAIL_TEMPLATE"
    VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG"
    RETRY_NOTIFICATION = "RETRY_NOTIFICATION"
    CANCEL_NOTIFICATION = "CANCEL_NOTIFICATION"
    SUPER_ADMIN_CREATED = "SUPER_ADMIN_CREATED"
    AUTO_ONBOARD_MANAGER = "AUTO_ONBOARD_MANAGER"  # Reassign Agent auto-onboarded manager
    AUTO_ONBOARD_AGENT = "AUTO_ONBOARD_AGENT"      # Reassign Agent auto-onboarded agent
    REASSIGN_APPROVAL = "REASSIGN_APPROVAL"        # Manager reassigned approval to another person

