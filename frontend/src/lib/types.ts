/**
 * Type Definitions
 * Shared types matching backend models
 */

// ============================================================================
// Enums
// ============================================================================

export type TicketStatus = 
  | "OPEN" 
  | "IN_PROGRESS" 
  | "WAITING_FOR_REQUESTER" 
  | "WAITING_FOR_AGENT"
  | "WAITING_FOR_CR"
  | "COMPLETED" 
  | "REJECTED" 
  | "SKIPPED"
  | "CANCELLED";

export type StepState = 
  | "NOT_STARTED" 
  | "ACTIVE" 
  | "WAITING_FOR_APPROVAL" 
  | "WAITING_FOR_REQUESTER" 
  | "WAITING_FOR_AGENT"
  | "WAITING_FOR_BRANCHES"
  | "WAITING_FOR_CR"
  | "COMPLETED" 
  | "REJECTED" 
  | "SKIPPED" 
  | "CANCELLED"
  | "ON_HOLD";

export type StepType = 
  | "FORM_STEP" 
  | "APPROVAL_STEP" 
  | "TASK_STEP" 
  | "NOTIFY_STEP"
  | "FORK_STEP"
  | "JOIN_STEP"
  | "SUB_WORKFLOW_STEP";

export type ForkJoinMode = 
  | "ALL" 
  | "ANY" 
  | "MAJORITY";

export type BranchFailurePolicy = 
  | "FAIL_ALL" 
  | "CONTINUE_OTHERS" 
  | "CANCEL_OTHERS";

export type ApprovalDecision = 
  | "PENDING" 
  | "APPROVED" 
  | "REJECTED" 
  | "SKIPPED"
  | "CANCELLED";

export type WorkflowStatus = 
  | "DRAFT" 
  | "PUBLISHED" 
  | "ARCHIVED";

export type FormFieldType = 
  | "TEXT" 
  | "TEXTAREA" 
  | "NUMBER" 
  | "DATE" 
  | "SELECT" 
  | "MULTISELECT" 
  | "CHECKBOX" 
  | "FILE"
  | "USER_SELECT"
  | "LOOKUP_USER_SELECT";  // Select user from a lookup table based on linked dropdown

export type ApproverResolution = 
  | "REQUESTER_MANAGER" 
  | "SPECIFIC_EMAIL" 
  | "SPOC_EMAIL"
  | "CONDITIONAL"
  | "STEP_ASSIGNEE" // Route to the assignee of a specified step (e.g., task step)
  | "FROM_LOOKUP"; // Route to primary user from a workflow lookup table

// ============================================================================
// User & Identity
// ============================================================================

export interface UserSnapshot {
  aad_id?: string;
  email: string;
  display_name: string;
  role_at_time?: string;
  manager_email?: string;
}

export interface CurrentUser {
  aad_id: string;
  email: string;
  display_name: string;
  roles: string[];
}

// ============================================================================
// Workflow Types
// ============================================================================

export interface FormSection {
  section_id: string;
  section_title: string;
  section_description?: string;
  order: number;
  is_repeating?: boolean; // If true, this section can have multiple rows/line items
  min_rows?: number;      // Minimum number of rows required (default: 0, set to 1 for "at least one row")
}

// Date validation options for DATE fields
export interface DateValidation {
  allow_past_dates?: boolean;    // Allow dates before today (default: true)
  allow_today?: boolean;         // Allow today's date (default: true)
  allow_future_dates?: boolean;  // Allow dates after today (default: true)
}

// Single condition for conditional requirements
export interface ConditionalWhenCondition {
  field_key: string;           // The source field (usually a dropdown)
  step_id?: string;            // Optional: for cross-form conditions
  operator: "equals" | "not_equals" | "in" | "not_in" | "is_empty" | "is_not_empty";
  value?: string | string[];   // The value(s) to match
}

// Conditional requirement rule - makes a field required/optional based on another field's value
// For DATE fields, can also include date validation rules
// Supports both single conditions and compound conditions (AND/OR)
export interface ConditionalRequirement {
  rule_id: string;
  when: ConditionalWhenCondition & {
    // For compound conditions (multiple conditions with AND/OR)
    logic?: "AND" | "OR";                    // How to combine conditions (default: single condition)
    conditions?: ConditionalWhenCondition[]; // Additional conditions for compound rules
  };
  then: {
    required: boolean;           // true = make required, false = make optional
    date_validation?: DateValidation;  // Optional: date restrictions for DATE fields
  };
}

export interface FormField {
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  required: boolean;
  placeholder?: string;
  default_value?: unknown;
  help_text?: string;
  options?: string[];
  validation?: {
    min_length?: number;
    max_length?: number;
    min_value?: number;
    max_value?: number;
    regex_pattern?: string;
    allowed_values?: string[];
    // Lookup display field configuration
    lookup_step_id?: string;      // Form step containing the source dropdown
    lookup_field_key?: string;    // Field key of the source dropdown
    // Date validation - for DATE fields
    date_validation?: DateValidation;
  };
  order: number;
  section_id?: string; // Optional: field belongs to a section
  conditional_requirements?: ConditionalRequirement[]; // Dynamic required/optional based on other fields
}

export interface SlaConfig {
  due_minutes: number;
  reminders: Array<{
    minutes_before_due: number;
    recipients: string[];
  }>;
  escalations: Array<{
    minutes_after_due: number;
    recipients: string[];
  }>;
}

export type ParallelApprovalRule = "ALL" | "ANY";

export interface StepTemplate {
  step_id: string;
  step_name: string;
  step_type: StepType;
  description?: string;
  sla?: SlaConfig;
  is_start?: boolean;
  is_terminal?: boolean;
  order: number;
  
  // Branch association (for steps inside parallel branches)
  branch_id?: string;
  parent_fork_step_id?: string;
  
  // Form step specific
  fields?: FormField[];
  sections?: FormSection[]; // Sections for organizing form fields
  
  // Approval step specific
  approver_resolution?: ApproverResolution;
  specific_approver_email?: string;
  specific_approver_aad_id?: string;
  specific_approver_display_name?: string;
  spoc_email?: string;
  allow_reassign?: boolean;
  parallel_approval?: ParallelApprovalRule;
  parallel_approvers?: string[];
  parallel_approvers_info?: Array<{ email: string; aad_id?: string; display_name?: string }>;
  // Primary approver for task assignment responsibility in parallel approvals
  primary_approver_email?: string;
  // Conditional approver routing
  conditional_approver_rules?: Array<{
    field_key: string;
    operator: ConditionOperator;
    value: any;
    approver_email: string;
    approver_aad_id?: string;
    approver_display_name?: string;
  }>;
  conditional_fallback_approver?: string;
  // Step assignee approver routing
  step_assignee_step_id?: string; // Step ID to reference for STEP_ASSIGNEE resolution (task step assignee or approval step approver)
  
  // Lookup table approver routing (FROM_LOOKUP resolution)
  lookup_id?: string; // Lookup table ID to use for resolving approver
  lookup_source_step_id?: string; // Form step containing the source field
  lookup_source_field_key?: string; // Field key that provides the lookup key
  
  // Task step specific
  instructions?: string;
  execution_notes_required?: boolean;
  output_fields?: FormField[];
  // Form fields for agent to fill (embedded form in task)
  // Note: fields and sections are already defined above for form steps, but can also be used for task steps
  
  // Linked Repeating Source - Links task's agent form to a repeating section from an earlier form
  // When linked, the agent form fields repeat N times (where N = rows in source section)
  linked_repeating_source?: {
    source_step_id: string;        // The form step that has the repeating section
    source_section_id: string;     // The repeating section ID  
    context_field_keys: string[];  // Field keys from source to show as read-only context
  };
  
  // Notify step specific
  notification_template?: string;
  recipients?: string[];
  
  // Fork step specific
  branches?: BranchDefinition[];
  failure_policy?: BranchFailurePolicy;
  
  // Join step specific
  source_fork_step_id?: string;
  join_mode?: ForkJoinMode;
  timeout_minutes?: number;
  
  // Sub-workflow step specific
  sub_workflow_id?: string;
  sub_workflow_version?: number;
  sub_workflow_name?: string;
  sub_workflow_category?: string;
}

export interface BranchDefinition {
  branch_id: string;
  branch_name: string;
  description?: string;
  assigned_team?: string;
  start_step_id: string;
  color?: string;
}

export type ConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "GREATER_THAN_OR_EQUALS"
  | "LESS_THAN_OR_EQUALS"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "IN"
  | "NOT_IN"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY";

export interface Condition {
  field: string;
  operator: ConditionOperator | string;
  value: unknown;
}

export interface ConditionGroup {
  logic: "AND" | "OR";
  conditions: Condition[];
}

export interface TransitionTemplate {
  transition_id: string;
  from_step_id: string;
  to_step_id: string;
  on_event: string;
  condition?: ConditionGroup;
  priority: number;
}

export interface WorkflowDefinition {
  steps: StepTemplate[];
  transitions: TransitionTemplate[];
  start_step_id: string;
}

export interface Workflow {
  workflow_id: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  status: WorkflowStatus;
  definition?: WorkflowDefinition;
  created_by: UserSnapshot;
  created_at: string;
  updated_at: string;
  published_version?: number;
  version: number;
}

export interface WorkflowVersion {
  workflow_version_id: string;
  workflow_id: string;
  version_number: number;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  definition: WorkflowDefinition;
  published_by: UserSnapshot;
  published_at: string;
  change_summary?: string;
}

// ============================================================================
// Ticket Types
// ============================================================================

export interface BranchState {
  branch_id: string;
  branch_name: string;
  state: StepState;
  current_step_id?: string;
  started_at?: string;
  completed_at?: string;
  outcome?: string;
}

export interface TicketNote {
  content: string;
  actor: UserSnapshot;
  created_at: string;
}

export interface Ticket {
  ticket_id: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_version?: number;  // Workflow version number for API calls
  workflow_name: string;
  title: string;
  description?: string;
  status: TicketStatus;
  current_step_id?: string;
  workflow_start_step_id?: string;  // ID of the first step for multi-form support
  requester: UserSnapshot;
  manager_snapshot?: UserSnapshot;
  form_values: Record<string, unknown>;
  attachment_ids: string[];
  requester_notes?: TicketNote[];  // Notes added by requester
  created_at: string;
  updated_at: string;
  completed_at?: string;
  due_at?: string;
  version: number;
  // Parallel branching fields
  active_branches?: BranchState[];
  current_step_ids?: string[];  // All currently active step IDs (for parallel execution)
  // Change Request versioning fields
  form_version?: number;  // Current form data version (default: 1)
  form_versions?: FormDataVersion[];  // Version history of form data
  pending_change_request_id?: string | null;  // ID of pending CR if any
  // CR eligibility (set in list response only)
  first_approval_completed?: boolean;  // True if at least one approval step is completed
}

export interface TicketStep {
  ticket_step_id: string;
  ticket_id: string;
  step_id: string;
  step_name: string;
  step_type: StepType;
  state: StepState;
  assigned_to?: UserSnapshot;
  data: Record<string, unknown>;
  outcome?: string;
  started_at?: string;
  completed_at?: string;
  due_at?: string;
  previous_state?: StepState;
  version: number;
  // Parallel approval fields (for steps with multiple approvers)
  parallel_pending_approvers?: string[];
  parallel_completed_approvers?: string[];
  parallel_approval_rule?: "ALL" | "ANY";
  primary_approver_email?: string;
  // Parallel branching fields
  branch_id?: string;
  branch_name?: string;
  parent_fork_step_id?: string;
  branch_order?: number;
  // Sub-workflow tracking fields
  parent_sub_workflow_step_id?: string;
  from_sub_workflow_id?: string;
  from_sub_workflow_version?: number;
  from_sub_workflow_name?: string;
  sub_workflow_step_order?: number;
}

export interface ApprovalTask {
  approval_task_id: string;
  ticket_id: string;
  ticket_step_id: string;
  approver: UserSnapshot;
  decision: ApprovalDecision;
  comment?: string;
  decided_at?: string;
  created_at: string;
}

export interface InfoRequest {
  info_request_id: string;
  ticket_id: string;
  ticket_step_id: string;
  requested_by: UserSnapshot;
  requested_from?: UserSnapshot; // Who the request is directed to (requester or previous agent)
  question_text: string;
  status: "OPEN" | "RESPONDED" | "CLOSED";
  response_text?: string;
  response_attachment_ids: string[];
  responded_by?: UserSnapshot;
  requested_at: string;
  responded_at?: string;
}

export interface AuditEvent {
  audit_event_id: string;
  ticket_id: string;
  ticket_step_id?: string;
  event_type: string;
  actor: UserSnapshot;
  details: Record<string, unknown>;
  timestamp: string;
  correlation_id?: string;
}

export interface Attachment {
  attachment_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: Array<{
    type: string;
    message: string;
    path?: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    path?: string;
  }>;
}

export interface ActionResponse {
  ticket: Ticket;
  current_step?: TicketStep;
  actionable_tasks: Array<{
    ticket_step_id: string;
    step_id: string;
    step_name: string;
    step_type: StepType;
    state: StepState;
    available_actions: string[];
    branch_id?: string;
    branch_name?: string;
    // Sub-workflow tracking
    parent_sub_workflow_step_id?: string;
    from_sub_workflow_name?: string;
  }>;
  newest_audit_events: AuditEvent[];
}

export interface TicketDetail {
  ticket: Ticket;
  current_step?: TicketStep;
  steps: TicketStep[];
  info_requests: InfoRequest[];
  audit_events: AuditEvent[];
  actionable_tasks: Array<{
    ticket_step_id: string;
    step_id: string;  // Step template ID for multi-form workflow support
    step_name: string;
    step_type: StepType;
    state: StepState;
    available_actions: string[];
    branch_id?: string;
    branch_name?: string;
    // Sub-workflow tracking
    parent_sub_workflow_step_id?: string;
    from_sub_workflow_name?: string;
  }>;
}

// ============================================================================
// UI Types
// ============================================================================

export type UserRole = "requester" | "designer" | "manager" | "agent" | "admin";

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles?: UserRole[];
  badge?: string | number;
}

// ============================================================================
// In-App Notifications
// ============================================================================

export type InAppNotificationCategory = 
  | "APPROVAL" 
  | "TASK" 
  | "INFO_REQUEST" 
  | "TICKET" 
  | "SYSTEM";

export interface InAppNotification {
  notification_id: string;
  category: InAppNotificationCategory;
  title: string;
  message: string;
  ticket_id?: string;
  action_url?: string;
  actor_email?: string;
  actor_display_name?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: InAppNotification[];
  unread_count: number;
  total: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

// ============================================================================
// Workflow Lookup Tables (Dynamic User Assignments)
// ============================================================================

export interface LookupUser {
  aad_id?: string;
  email: string;
  display_name: string;
  is_primary: boolean;
  order: number;
}

export interface LookupEntry {
  entry_id: string;
  key: string;
  display_label?: string;
  users: LookupUser[];
  is_active: boolean;
}

export interface WorkflowLookup {
  lookup_id: string;
  workflow_id: string;
  name: string;
  description?: string;
  source_step_id?: string;
  source_field_key?: string;
  entries: LookupEntry[];
  created_by: UserSnapshot;
  created_at: string;
  updated_by?: UserSnapshot;
  updated_at?: string;
  is_active: boolean;
  version: number;
}

export interface LookupListResponse {
  items: WorkflowLookup[];
}

// ============================================================================
// Change Request Types
// ============================================================================

export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface FieldChange {
  form_name: string;
  step_id: string;
  step_name?: string;
  field_key: string;
  field_label: string;
  old_value: unknown;
  new_value: unknown;
}

export interface AttachmentChange {
  attachment_id: string;
  filename: string;
  action: "ADDED" | "REMOVED" | "UNCHANGED";
}

export interface ChangeRequest {
  change_request_id: string;
  ticket_id: string;
  workflow_id: string;
  status: ChangeRequestStatus;
  from_version: number;
  to_version?: number;
  original_data: {
    form_values: Record<string, unknown>;
    attachment_ids: string[];
  };
  proposed_data: {
    form_values: Record<string, unknown>;
    attachment_ids: string[];
  };
  field_changes: FieldChange[];
  attachment_changes: AttachmentChange[];
  requested_by: UserSnapshot;
  reason: string;
  requested_at: string;
  assigned_to: UserSnapshot;
  reviewed_by?: UserSnapshot;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
  // Enriched fields from API
  ticket_title?: string;
  ticket_status?: string;
  workflow_name?: string;
}

export interface FormDataVersion {
  version: number;
  form_values: Record<string, unknown>;
  attachment_ids: string[];
  created_at: string;
  created_by: UserSnapshot;
  source: "ORIGINAL" | "CHANGE_REQUEST";
  change_request_id?: string;
  approved_by?: UserSnapshot;
  field_changes?: FieldChange[];
  attachment_changes?: AttachmentChange[];
}

export interface ChangeRequestListResponse {
  items: ChangeRequest[];
  total: number;
  skip: number;
  limit: number;
}

export interface ChangeRequestDetailResponse {
  change_request: ChangeRequest;
  ticket_title: string;
  ticket_status: string;
  workflow_name: string;
}

export interface VersionComparisonResponse {
  version_1: FormDataVersion;
  version_2: FormDataVersion;
  field_changes: FieldChange[];
  attachment_changes: AttachmentChange[];
}
