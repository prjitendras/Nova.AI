"""
Workflow Engine - The Brain of the System

This module contains the core WorkflowEngine class that orchestrates all ticket
operations and workflow transitions.

=============================================================================
MODULE STRUCTURE
=============================================================================

The WorkflowEngine class is organized into the following sections:

1. INITIALIZATION (lines ~56-65)
   - Constructor with repository and service dependencies

2. TICKET CREATION (lines ~70-400)
   - create_ticket: Main entry point for ticket creation
   - _get_step_after_forms: Find first non-form step
   - _resolve_manager_snapshot: Get requester's manager
   - _create_ticket_steps: Materialize workflow steps

3. STEP HELPERS (lines ~389-650)
   - _find_step_definition: Find step in workflow definition
   - _find_ticket_step: Find ticket step by step_id
   - _activate_step: Activate a step and create related records
   - _resolve_approver: Resolve approver based on resolution type

4. FORK/JOIN/BRANCH LOGIC (lines ~885-1355)
   - _handle_fork_activation: Start parallel branches
   - _check_join_completion: Check if join conditions are met
   - _get_last_step_in_branch: Find terminal step in branch
   - _transition_after_join: Proceed after join completion
   - _handle_branch_step_completion: Handle step completion in branches

5. ACTION HANDLERS (lines ~1357-2650)
   - handle_submit_form: Form submission
   - handle_approve: Approval action
   - handle_reject: Rejection action
   - handle_complete_task: Task completion
   - handle_add_note: Add note to ticket
   - handle_request_info: Request more information
   - handle_respond_info: Respond to info request
   - handle_assign: Assign task to agent
   - handle_reassign: Reassign task
   - handle_cancel: Cancel ticket
   - handle_hold: Put ticket on hold
   - handle_resume: Resume held ticket
   - handle_handover_request: Request handover
   - handle_handover_decision: Approve/reject handover
   - handle_skip_step: Skip a step (admin)
   - handle_acknowledge_sla: Acknowledge SLA breach

6. TRANSITION LOGIC (lines ~2757-3220)
   - _transition_to_next: Core transition orchestration
   - _update_branch_current_step: Track branch progress
   - _mark_branch_failed: Mark branch as failed
   - _are_all_branch_steps_completed: Check branch completion
   - _mark_branch_completed: Mark branch complete
   - _complete_ticket: Complete the ticket

7. RESPONSE BUILDING (lines ~3249-end)
   - _build_action_response: Build standardized response

=============================================================================
DEPENDENCIES
=============================================================================

Repositories:
    - TicketRepository: Ticket and step CRUD
    - WorkflowRepository: Workflow definition access

Services:
    - NotificationService: Email notifications
    - DirectoryService: User/manager lookups

Guards & Resolvers:
    - PermissionGuard: Authorization checks
    - TransitionResolver: Determine next step
    - ConditionEvaluator: Evaluate conditions
    - AuditWriter: Write audit trail

=============================================================================
"""

from typing import Any, Dict, List, Optional
from datetime import datetime

from ..domain.models import (
    Ticket, TicketStep, ApprovalTask, Assignment, InfoRequest,
    UserSnapshot, ActorContext, WorkflowVersion, HandoverRequest, SlaAcknowledgment,
    BranchState
)
from ..domain.enums import (
    TicketStatus, StepState, StepType, ApprovalDecision,
    AssignmentStatus, InfoRequestStatus, TransitionEvent, AuditEventType,
    ApproverResolution, HandoverRequestStatus, ForkJoinMode, BranchFailurePolicy,
    AdminAuditAction
)
from ..domain.errors import (
    TicketNotFoundError, StepNotFoundError, PermissionDeniedError,
    InvalidStateError, InfoRequestOpenError, ConcurrencyError,
    ApproverResolutionError, ManagerNotFoundError, NotFoundError,
    ValidationError
)
from ..repositories.ticket_repo import TicketRepository
from ..repositories.workflow_repo import WorkflowRepository
from ..repositories.audit_repo import AuditRepository
from ..repositories.notification_repo import NotificationRepository
from .permission_guard import PermissionGuard
from .transition_resolver import TransitionResolver
from .audit_writer import AuditWriter
from .condition_evaluator import ConditionEvaluator
from .sub_workflow_handler import SubWorkflowHandler
from ..services.notification_service import NotificationService
from ..services.directory_service import DirectoryService
from ..utils.idgen import (
    generate_ticket_id, generate_ticket_step_id, generate_approval_task_id,
    generate_assignment_id, generate_info_request_id, generate_handover_request_id,
    generate_sla_acknowledgment_id
)
from ..utils.time import utc_now, calculate_due_at, format_iso
from ..utils.logger import get_logger

logger = get_logger(__name__)


class WorkflowEngine:
    """
    The Workflow Engine - Central orchestrator for all ticket operations
    
    Responsibilities:
    - Create ticket instances from published workflow versions
    - Control all transitions based on actions/events
    - Enforce permissions via PermissionGuard
    - Write audit events and notification outbox
    - Handle bidirectional info requests
    - Handle manager-driven assignment
    - Ensure idempotency and concurrency safety
    """
    
    def __init__(self):
        self.ticket_repo = TicketRepository()
        self.workflow_repo = WorkflowRepository()
        self.audit_writer = AuditWriter()
        self.notification_service = NotificationService()
        self.directory_service = DirectoryService()
        self.permission_guard = PermissionGuard(ticket_repo=self.ticket_repo)
        self.transition_resolver = TransitionResolver()
        self.condition_evaluator = ConditionEvaluator()
        self.sub_workflow_handler = SubWorkflowHandler(
            workflow_repo=self.workflow_repo,
            ticket_repo=self.ticket_repo
        )
    
    # =========================================================================
    # Ticket Creation
    # =========================================================================
    
    def create_ticket(
        self,
        workflow_version: WorkflowVersion,
        title: str,
        description: Optional[str],
        initial_form_values: Dict[str, Any],
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str,
        access_token: Optional[str] = None,
        initial_form_step_ids: Optional[List[str]] = None  # IDs of forms already filled in wizard
    ) -> Ticket:
        """
        Create a new ticket instance from workflow version
        
        Algorithm:
        1. Create ticket with requester snapshot
        2. Get manager snapshot (for future approval steps)
        3. Materialize ticket steps from workflow definition
        4. Handle initial form steps (wizard-style):
           - Mark all pre-filled form steps as COMPLETED
           - Activate the first non-form step OR the first unfilled form
        5. Enqueue notifications
        6. Write audit event
        """
        now = utc_now()
        ticket_id = generate_ticket_id()
        
        # 1. Create requester snapshot
        requester_snapshot = UserSnapshot(
            aad_id=actor.aad_id,
            email=actor.email,
            display_name=actor.display_name,
            role_at_time="requester"
        )
        
        # Extract attachment IDs from form values (FILE type fields store them as arrays)
        # Also handles nested structures like repeating sections
        all_attachment_ids = list(attachment_ids) if attachment_ids else []
        logger.info(f"Initial attachment_ids from request: {attachment_ids}")
        
        def extract_attachment_ids(obj: any) -> None:
            """Recursively extract ATT- IDs from nested structures"""
            if isinstance(obj, str):
                if obj.startswith("ATT-") and obj not in all_attachment_ids:
                    all_attachment_ids.append(obj)
            elif isinstance(obj, list):
                for item in obj:
                    extract_attachment_ids(item)
            elif isinstance(obj, dict):
                for value in obj.values():
                    extract_attachment_ids(value)
        
        extract_attachment_ids(initial_form_values)
        logger.info(f"Total attachment IDs extracted: {all_attachment_ids}")
        
        # 2. Get manager snapshot (may be None)
        manager_snapshot = self._resolve_manager_snapshot(actor, access_token)
        
        # 3. Determine first step
        start_step_id = workflow_version.definition.start_step_id
        
        # 4. Create ticket
        ticket = Ticket(
            ticket_id=ticket_id,
            workflow_id=workflow_version.workflow_id,
            workflow_version_id=workflow_version.workflow_version_id,
            workflow_version=workflow_version.version_number,  # Store version number for API calls
            workflow_name=workflow_version.name,
            title=title,
            description=description,
            status=TicketStatus.IN_PROGRESS,
            current_step_id=start_step_id,
            workflow_start_step_id=start_step_id,  # Store for multi-form workflow support
            requester=requester_snapshot,
            manager_snapshot=manager_snapshot,
            form_values=initial_form_values,
            attachment_ids=all_attachment_ids,
            created_at=now,
            updated_at=now,
            version=1
        )
        
        self.ticket_repo.create_ticket(ticket)
        
        # Link attachments to this ticket (move from temp to ticket folder)
        if all_attachment_ids:
            self._link_attachments_to_ticket(ticket_id, all_attachment_ids)
        
        # 5. Materialize ticket steps
        steps = self._create_ticket_steps(ticket, workflow_version, now)
        
        # 6. Handle initial form steps (wizard-style multi-form support)
        if initial_form_step_ids and len(initial_form_step_ids) > 0:
            # Validate form values against field definitions from workflow
            for form_step_id in initial_form_step_ids:
                step_def = next(
                    (s for s in workflow_version.definition.steps if s.get("step_id") == form_step_id),
                    None
                )
                if step_def:
                    field_definitions = step_def.get("fields", [])
                    sections = step_def.get("sections", [])
                    if field_definitions:
                        validation_errors = self._validate_form_values(
                            initial_form_values, field_definitions, sections
                        )
                        if validation_errors:
                            raise ValidationError(
                                message=validation_errors[0],
                                details={"validation_errors": validation_errors, "step_id": form_step_id}
                            )
            
            # Mark all provided initial form steps as COMPLETED
            first_non_form_step_id = None
            
            for form_step_id in initial_form_step_ids:
                form_step = self._find_ticket_step(steps, form_step_id)
                if form_step:
                    # Mark step as completed
                    self.ticket_repo.update_step(
                        form_step.ticket_step_id,
                        {
                            "state": StepState.COMPLETED.value,
                            "assigned_to": requester_snapshot.model_dump(mode="json"),
                            "started_at": now,
                            "completed_at": now
                        },
                        expected_version=form_step.version
                    )
                    
                    # Audit form submission
                    self.audit_writer.write_submit_form(
                        ticket_id=ticket_id,
                        ticket_step_id=form_step.ticket_step_id,
                        actor=actor,
                        form_values=initial_form_values,  # All values combined
                        correlation_id=correlation_id
                    )
            
            # Find the first step AFTER all provided forms and activate it
            # This should be determined by the frontend based on the transition chain
            first_non_form_step_id = self._get_step_after_forms(
                initial_form_step_ids[-1],  # Last form step
                workflow_version
            )
            
            if first_non_form_step_id:
                # Update ticket current step
                self.ticket_repo.update_ticket(
                    ticket_id,
                    {"current_step_id": first_non_form_step_id},
                    expected_version=ticket.version
                )
                ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
                
                # Activate the first non-form step
                next_step = self._find_ticket_step(steps, first_non_form_step_id)
                if next_step:
                    self._activate_step(ticket, next_step, workflow_version, actor, correlation_id)
            
            logger.info(
                f"Created ticket with {len(initial_form_step_ids)} initial forms completed",
                extra={
                    "ticket_id": ticket_id,
                    "initial_forms": initial_form_step_ids,
                    "activated_step": first_non_form_step_id
                }
            )
        else:
            # Legacy behavior: activate first step
            first_step = self._find_ticket_step(steps, start_step_id)
            if first_step:
                self._activate_step(ticket, first_step, workflow_version, actor, correlation_id)
        
        # 7. Write audit
        self.audit_writer.write_create_ticket(
            ticket_id=ticket_id,
            actor=actor,
            workflow_name=workflow_version.name,
            correlation_id=correlation_id
        )
        
        # 8. Enqueue notifications
        self.notification_service.enqueue_ticket_created(
            ticket_id=ticket_id,
            requester_email=actor.email,
            ticket_title=title,
            workflow_name=workflow_version.name,
            workflow_id=workflow_version.workflow_id
        )
        
        # 9. Notify users from LOOKUP_USER_SELECT fields (non-blocking)
        try:
            self._notify_lookup_users_on_ticket_creation(
                ticket_id=ticket_id,
                ticket_title=title,
                workflow_version=workflow_version,
                form_values=initial_form_values,
                actor=actor
            )
        except Exception as e:
            # Log error but don't fail ticket creation
            logger.error(
                f"Failed to notify lookup users for ticket {ticket_id}: {e}",
                extra={"ticket_id": ticket_id, "error": str(e)}
            )
        
        logger.info(
            f"Created ticket {ticket_id}",
            extra={"ticket_id": ticket_id, "workflow_id": workflow_version.workflow_id}
        )
        
        return ticket
    
    def _get_step_after_forms(
        self,
        last_form_step_id: str,
        workflow_version: WorkflowVersion
    ) -> Optional[str]:
        """Get the step ID that should be activated after the last form step"""
        transitions = workflow_version.definition.transitions
        
        for t in transitions:
            from_id = t.from_step_id if hasattr(t, 'from_step_id') else t.get("from_step_id")
            event = t.on_event if hasattr(t, 'on_event') else t.get("on_event")
            to_id = t.to_step_id if hasattr(t, 'to_step_id') else t.get("to_step_id")
            
            if from_id == last_form_step_id and event == "SUBMIT_FORM":
                return to_id
        
        return None
    
    def _notify_all_lookup_users_for_approval(
        self,
        ticket: Ticket,
        step: TicketStep,
        step_def: Dict[str, Any],
        primary_approver_email: str,
        actor: ActorContext
    ) -> None:
        """
        For FROM_LOOKUP approval resolution: Notify ALL users from the lookup (not just primary).
        Primary user is assigned the approval task, but secondary users are notified for awareness.
        """
        lookup_id = step_def.get("lookup_id")
        lookup_source_field_key = step_def.get("lookup_source_field_key")
        lookup_source_step_id = step_def.get("lookup_source_step_id")
        
        if not lookup_id or not lookup_source_field_key:
            return
        
        # Get the form field value from ticket.form_values
        form_values = ticket.form_values or {}
        field_value = form_values.get(lookup_source_field_key)
        
        if not field_value:
            return
        
        # Get ALL users from the lookup (not just primary)
        from app.services.lookup_service import LookupService
        lookup_service = LookupService()
        
        all_users = lookup_service.resolve_users_for_form_value(
            workflow_id=ticket.workflow_id,
            step_id=lookup_source_step_id or step.step_id,
            field_key=lookup_source_field_key,
            field_value=str(field_value)
        )
        
        if not all_users:
            return
        
        # Notify secondary users (primary already notified via standard flow)
        from app.repositories.admin_repo import AdminRepository
        from app.domain.enums import OnboardSource
        admin_repo = AdminRepository()
        
        for user in all_users:
            user_email = user.get("email")
            if not user_email:
                continue
            
            # Skip the primary approver (already notified)
            if user_email.lower() == primary_approver_email.lower():
                continue
            
            # Auto-onboard secondary users
            admin_repo.auto_onboard_user(
                email=user_email,
                display_name=user.get("display_name", user_email),
                triggered_by_email=actor.email,
                triggered_by_display_name=actor.display_name,
                as_manager=True,  # May need to approve in future
                aad_id=user.get("aad_id"),
                onboard_source=OnboardSource.LOOKUP_ASSIGNMENT
            )
            
            # Notify secondary user about the pending approval
            self.notification_service.enqueue_lookup_user_assigned(
                ticket_id=ticket.ticket_id,
                ticket_title=ticket.title,
                user_email=user_email,
                user_display_name=user.get("display_name", user_email),
                is_primary=False,
                assigned_by_name=actor.display_name,
                workflow_name=ticket.workflow_name
            )
        
        logger.info(
            f"Notified {len(all_users) - 1} secondary users for approval step",
            extra={
                "ticket_id": ticket.ticket_id,
                "step_id": step.step_id,
                "lookup_id": lookup_id,
                "primary_approver": primary_approver_email
            }
        )
    
    def _notify_lookup_users_on_ticket_creation(
        self,
        ticket_id: str,
        ticket_title: str,
        workflow_version: WorkflowVersion,
        form_values: Dict[str, Any],
        actor: ActorContext
    ) -> None:
        """
        Notify ALL users from LOOKUP_USER_SELECT fields when ticket is created.
        
        For each LOOKUP_USER_SELECT field:
        1. Find the linked source field (dropdown)
        2. Get the value selected in the dropdown
        3. Resolve ALL users from the lookup table
        4. Send notification to each user
        """
        from app.services.lookup_service import LookupService
        lookup_service = LookupService()
        
        # Get all form steps to find LOOKUP_USER_SELECT fields
        for step_def in workflow_version.definition.steps:
            step_type = step_def.get("step_type") if isinstance(step_def, dict) else getattr(step_def, "step_type", None)
            if step_type != "FORM_STEP":
                continue
            
            fields = step_def.get("fields", []) if isinstance(step_def, dict) else getattr(step_def, "fields", [])
            step_id = step_def.get("step_id") if isinstance(step_def, dict) else getattr(step_def, "step_id", None)
            
            for field in fields:
                field_type = field.get("field_type") if isinstance(field, dict) else getattr(field, "field_type", None)
                if field_type != "LOOKUP_USER_SELECT":
                    continue
                
                # Get lookup source configuration
                validation = field.get("validation", {}) if isinstance(field, dict) else getattr(field, "validation", {}) or {}
                lookup_step_id = validation.get("lookup_step_id")
                lookup_field_key = validation.get("lookup_field_key")
                
                if not lookup_step_id or not lookup_field_key:
                    continue
                
                # Get the value from the linked dropdown field
                source_value = form_values.get(lookup_field_key)
                if not source_value:
                    continue
                
                # Resolve all users from the lookup
                users = lookup_service.resolve_users_for_form_value(
                    workflow_id=workflow_version.workflow_id,
                    step_id=lookup_step_id,
                    field_key=lookup_field_key,
                    field_value=source_value
                )
                
                if not users:
                    continue
                
                # Notify all users
                for user in users:
                    user_email = user.get("email")
                    if user_email and user_email.lower() != actor.email.lower():
                        # Don't notify the requester themselves
                        self.notification_service.enqueue_lookup_user_assigned(
                            ticket_id=ticket_id,
                            ticket_title=ticket_title,
                            user_email=user_email,
                            user_display_name=user.get("display_name", user_email),
                            is_primary=user.get("is_primary", False),
                            assigned_by_name=actor.display_name,
                            workflow_name=workflow_version.name
                        )
                        
                        # Auto-onboard the user
                        from app.repositories.admin_repo import AdminRepository
                        from app.domain.enums import OnboardSource
                        admin_repo = AdminRepository()
                        admin_repo.auto_onboard_user(
                            email=user_email,
                            display_name=user.get("display_name", user_email),
                            triggered_by_email=actor.email,
                            triggered_by_display_name=actor.display_name,
                            as_agent=True,  # Lookup users might need to take action
                            aad_id=user.get("aad_id"),
                            onboard_source=OnboardSource.LOOKUP_ASSIGNMENT
                        )
                
                logger.info(
                    f"Notified {len(users)} lookup users for ticket {ticket_id}",
                    extra={
                        "ticket_id": ticket_id,
                        "field_key": lookup_field_key,
                        "source_value": source_value,
                        "users_notified": [u.get("email") for u in users]
                    }
                )
    
    def _resolve_manager_snapshot(
        self,
        actor: ActorContext,
        access_token: Optional[str] = None
    ) -> Optional[UserSnapshot]:
        """Get manager snapshot for requester using Graph API"""
        try:
            manager_info = self.directory_service.get_user_manager(
                user_email=actor.email,
                actor=actor,
                access_token=access_token
            )
            if manager_info:
                return UserSnapshot(
                    aad_id=manager_info.get("aad_id"),
                    email=manager_info.get("email"),
                    display_name=manager_info.get("display_name", "")
                )
        except Exception as e:
            logger.warning(f"Failed to get manager for {actor.email}: {e}")
        return None
    
    def _create_ticket_steps(
        self,
        ticket: Ticket,
        workflow_version: WorkflowVersion,
        now: datetime
    ) -> List[TicketStep]:
        """Create ticket steps from workflow definition"""
        steps = []
        
        # Pre-process: Build a map of which steps belong to which branches
        # This allows us to assign branch_id when creating steps
        step_to_branch_map = {}  # step_id -> (branch_id, branch_name, parent_fork_step_id)
        
        # Find all fork steps and their branches
        for step_def in workflow_version.definition.steps:
            if step_def.get("step_type") == StepType.FORK_STEP.value:
                fork_step_id = step_def.get("step_id")
                branches = step_def.get("branches", [])
                transitions = workflow_version.definition.transitions
                
                for branch_def in branches:
                    branch_id = branch_def.get("branch_id")
                    branch_name = branch_def.get("branch_name", "")
                    start_step_id = branch_def.get("start_step_id")
                    
                    if not branch_id or not start_step_id:
                        continue
                    
                    # Trace all steps in this branch by following transitions
                    # Start from the branch start step and follow transitions until we hit a JOIN step
                    # Use a queue to handle multiple paths within a branch
                    queue = [start_step_id]
                    visited = set()
                    
                    while queue:
                        current_step_id = queue.pop(0)
                        if current_step_id in visited:
                            continue
                        visited.add(current_step_id)
                        
                        # Mark this step as belonging to this branch
                        step_to_branch_map[current_step_id] = (
                            branch_id,
                            branch_name,
                            fork_step_id
                        )
                        
                        # Find all next steps by following transitions
                        # Follow ALL transitions from this step to find all possible next steps in the branch
                        # Transitions are TransitionTemplate objects
                        for t in transitions:
                            from_id = t.from_step_id if hasattr(t, 'from_step_id') else (t.get("from_step_id") if isinstance(t, dict) else None)
                            if from_id == current_step_id:
                                to_id = t.to_step_id if hasattr(t, 'to_step_id') else (t.get("to_step_id") if isinstance(t, dict) else None)
                                if to_id and to_id not in visited:
                                    # Check if next step is a JOIN step - if so, skip (join is not part of branch)
                                    next_step_def = next((s for s in workflow_version.definition.steps if s.get("step_id") == to_id), None)
                                    if next_step_def and next_step_def.get("step_type") == StepType.JOIN_STEP.value:
                                        continue
                                    
                                    # Add to queue to process
                                    queue.append(to_id)
        
        # Create steps with branch metadata if applicable
        for step_def in workflow_version.definition.steps:
            step_id = step_def.get("step_id")
            step_type = StepType(step_def.get("step_type"))
            
            # Skip fork and join steps - they don't belong to branches
            if step_type in [StepType.FORK_STEP, StepType.JOIN_STEP]:
                branch_id = None
                branch_name = None
                parent_fork_step_id = None
            else:
                # Check if this step belongs to a branch
                branch_info = step_to_branch_map.get(step_id)
                if branch_info:
                    branch_id, branch_name, parent_fork_step_id = branch_info
                else:
                    branch_id = None
                    branch_name = None
                    parent_fork_step_id = None
            
            # Include field definitions in step data for form steps
            step_data = {}
            if step_type == StepType.FORM_STEP:
                step_data["fields"] = step_def.get("fields", [])
                # Include sections for repeating section support
                if step_def.get("sections"):
                    step_data["sections"] = step_def.get("sections", [])
            elif step_type == StepType.TASK_STEP:
                step_data["instructions"] = step_def.get("instructions", "")
                step_data["execution_notes_required"] = step_def.get("execution_notes_required", True)
                # Include form fields for agent to fill (output_fields in template)
                if step_def.get("output_fields"):
                    step_data["output_fields"] = step_def.get("output_fields", [])
                elif step_def.get("fields"):  # Backward compatibility
                    step_data["output_fields"] = step_def.get("fields", [])
                if step_def.get("sections"):
                    step_data["sections"] = step_def.get("sections", [])
            elif step_type == StepType.FORK_STEP:
                step_data["branches"] = step_def.get("branches", [])
                step_data["failure_policy"] = step_def.get("failure_policy", BranchFailurePolicy.FAIL_ALL.value)
            elif step_type == StepType.JOIN_STEP:
                step_data["source_fork_step_id"] = step_def.get("source_fork_step_id")
                step_data["join_mode"] = step_def.get("join_mode", ForkJoinMode.ALL.value)
            
            ticket_step = TicketStep(
                ticket_step_id=generate_ticket_step_id(),
                ticket_id=ticket.ticket_id,
                step_id=step_id,
                step_name=step_def.get("step_name", ""),
                step_type=step_type,
                state=StepState.NOT_STARTED,
                data=step_data,
                version=1,
                branch_id=branch_id,
                branch_name=branch_name,
                parent_fork_step_id=parent_fork_step_id
            )
            
            steps.append(ticket_step)
        
        # Bulk insert
        self.ticket_repo.create_steps_bulk(steps)
        return steps
    
    def _find_step_definition(
        self,
        step_id: str,
        workflow_version: WorkflowVersion
    ) -> Optional[Dict[str, Any]]:
        """Find step definition by ID"""
        for step in workflow_version.definition.steps:
            if step.get("step_id") == step_id:
                return step
        return None
    
    def _find_ticket_step(
        self,
        steps: List[TicketStep],
        step_id: str
    ) -> Optional[TicketStep]:
        """Find ticket step by step_id"""
        for step in steps:
            if step.step_id == step_id:
                return step
        return None
    
    # =========================================================================
    # Step Activation
    # =========================================================================
    
    def _activate_step(
        self,
        ticket: Ticket,
        step: TicketStep,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """Activate a step based on its type"""
        step_def = self._find_step_definition(step.step_id, workflow_version)
        now = utc_now()
        
        updates = {
            "started_at": now,
        }
        
        # Initialize flag for notify step handling
        is_notify_step = False
        
        # Calculate SLA due time if configured
        sla = step_def.get("sla")
        if sla and sla.get("due_minutes"):
            updates["due_at"] = calculate_due_at(now, sla["due_minutes"])
        
        if step.step_type == StepType.FORM_STEP:
            # Assign to requester
            updates["state"] = StepState.ACTIVE.value
            updates["assigned_to"] = ticket.requester.model_dump(mode="json")
            
            # Send notification for mid-workflow forms (not the initial form during creation)
            # Check if this is not the start step (which would be filled during creation)
            is_initial_form = (
                step.step_id == workflow_version.definition.start_step_id
            )
            if not is_initial_form:
                self.notification_service.enqueue_form_pending(
                    ticket_id=ticket.ticket_id,
                    requester_email=ticket.requester.email,
                    ticket_title=ticket.title,
                    form_name=step.step_name
                )
            
        elif step.step_type == StepType.APPROVAL_STEP:
            # Check for parallel approvals
            parallel_rule = step_def.get("parallel_approval")
            parallel_approvers_emails = list(step_def.get("parallel_approvers", []))  # Make a copy
            parallel_approvers_info = list(step_def.get("parallel_approvers_info", []))  # Make a copy
            
            # If parallel approvals enabled AND a specific approver is set, 
            # include the specific approver in the parallel list (if not already there)
            if parallel_rule:
                specific_email = step_def.get("specific_approver_email")
                if specific_email and specific_email.lower() not in [e.lower() for e in parallel_approvers_emails]:
                    # Insert specific approver at the beginning
                    parallel_approvers_emails.insert(0, specific_email)
                    parallel_approvers_info.insert(0, {
                        "email": specific_email,
                        "aad_id": step_def.get("specific_approver_aad_id"),
                        "display_name": step_def.get("specific_approver_display_name") or specific_email.split("@")[0].replace(".", " ").title()
                    })
                    logger.info(
                        f"Added specific approver {specific_email} to parallel approvers list",
                        extra={"step_id": step.step_id, "step_name": step.step_name}
                    )
            
            if parallel_rule and parallel_approvers_emails:
                # Parallel approvals - create tasks for all approvers
                updates["state"] = StepState.WAITING_FOR_APPROVAL.value
                
                # Build approver list with full info if available
                approvers_with_info = []
                for email in parallel_approvers_emails:
                    # Find matching info
                    info = next((a for a in parallel_approvers_info if a.get("email") == email), None)
                    if info:
                        approvers_with_info.append(UserSnapshot(
                            email=email,
                            aad_id=info.get("aad_id"),
                            display_name=info.get("display_name") or email.split("@")[0].replace(".", " ").title()
                        ))
                    else:
                        approvers_with_info.append(UserSnapshot(
                            email=email,
                            display_name=email.split("@")[0].replace(".", " ").title()
                        ))
                
                # Determine primary approver (for task assignment responsibility)
                # Use explicitly set primary, or fallback to first approver
                primary_email = step_def.get("primary_approver_email")
                if primary_email:
                    # Find primary approver in the list
                    primary_approver = next(
                        (a for a in approvers_with_info if a.email.lower() == primary_email.lower()),
                        approvers_with_info[0] if approvers_with_info else None
                    )
                else:
                    # Default to first approver
                    primary_approver = approvers_with_info[0] if approvers_with_info else None
                
                if not primary_approver:
                    primary_approver = UserSnapshot(
                        email=parallel_approvers_emails[0],
                        display_name=parallel_approvers_emails[0].split("@")[0].replace(".", " ").title()
                    )
                
                logger.info(
                    f"Parallel approval: primary approver is {primary_approver.email}",
                    extra={
                        "step_id": step.step_id, 
                        "total_approvers": len(approvers_with_info),
                        "primary_email": primary_approver.email
                    }
                )
                
                updates["assigned_to"] = primary_approver.model_dump(mode="json")
                updates["parallel_approval_rule"] = parallel_rule
                updates["parallel_pending_approvers"] = parallel_approvers_emails
                updates["parallel_completed_approvers"] = []
                updates["primary_approver_email"] = primary_approver.email  # Store for reference
                # Store approvers info with AAD IDs for matching (handles UPN vs mail mismatches)
                updates["parallel_approvers_info"] = [
                    {"email": a.email, "aad_id": a.aad_id, "display_name": a.display_name}
                    for a in approvers_with_info
                ]
                
                # Auto-onboard all parallel approvers if not in system
                from ..repositories.admin_repo import AdminRepository
                admin_repo = AdminRepository()
                
                # Create approval tasks for all approvers
                for approver in approvers_with_info:
                    # Auto-onboard each approver
                    access, was_created, added_manager, added_agent = admin_repo.auto_onboard_user(
                        email=approver.email,
                        display_name=approver.display_name,
                        triggered_by_email=actor.email,
                        triggered_by_display_name=actor.display_name,
                        as_manager=True,  # Approval requires manager persona
                        aad_id=approver.aad_id
                    )
                    
                    # Log audit if user was created OR if manager persona was added to existing user
                    if was_created or added_manager:
                        admin_repo.log_admin_action(
                            action=AdminAuditAction.AUTO_ONBOARD_MANAGER,
                            actor_email=actor.email,
                            actor_display_name=actor.display_name,
                            target_email=approver.email,
                            target_display_name=approver.display_name,
                            details={
                                "trigger": "parallel_approval_step_activation",
                                "ticket_id": ticket.ticket_id,
                                "step_id": step.step_id,
                                "was_new_user": was_created,
                                "added_manager_to_existing": added_manager and not was_created
                            }
                        )
                        logger.info(
                            f"Auto-onboarded parallel approver {approver.email} during step activation",
                            extra={"ticket_id": ticket.ticket_id, "triggered_by": actor.email, "was_new": was_created}
                        )
                    
                    self._create_approval_task(ticket, step, approver)
                    
                    # Notify each approver
                    branch_name = getattr(step, 'branch_name', None) or (step.data.get("branch_name") if step.data else None)
                    self.notification_service.enqueue_approval_pending(
                        ticket_id=ticket.ticket_id,
                        approver_email=approver.email,
                        ticket_title=ticket.title,
                        requester_name=ticket.requester.display_name,
                        branch_name=branch_name,
                        step_name=step.step_name,
                        workflow_name=ticket.workflow_name,
                        workflow_id=ticket.workflow_id
                    )
            else:
                # Single approver flow
                # Get all ticket steps for approver resolution (needed for STEP_ASSIGNEE resolution)
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                approver = self._resolve_approver(ticket, step_def, actor, all_steps)
                updates["state"] = StepState.WAITING_FOR_APPROVAL.value
                updates["assigned_to"] = approver.model_dump(mode="json")
                
                # Auto-onboard approver if not in system
                from ..repositories.admin_repo import AdminRepository
                admin_repo = AdminRepository()
                access, was_created, added_manager, added_agent = admin_repo.auto_onboard_user(
                    email=approver.email,
                    display_name=approver.display_name,
                    triggered_by_email=actor.email,
                    triggered_by_display_name=actor.display_name,
                    as_manager=True,  # Approval requires manager persona
                    aad_id=approver.aad_id
                )
                
                # Log audit if user was created OR if manager persona was added to existing user
                if was_created or added_manager:
                    admin_repo.log_admin_action(
                        action=AdminAuditAction.AUTO_ONBOARD_MANAGER,
                        actor_email=actor.email,
                        actor_display_name=actor.display_name,
                        target_email=approver.email,
                        target_display_name=approver.display_name,
                        details={
                            "trigger": "approval_step_activation",
                            "ticket_id": ticket.ticket_id,
                            "step_id": step.step_id,
                            "resolution": step_def.get("approver_resolution"),
                            "was_new_user": was_created,
                            "added_manager_to_existing": added_manager and not was_created
                        }
                    )
                    logger.info(
                        f"Auto-onboarded approver {approver.email} during step activation",
                        extra={"ticket_id": ticket.ticket_id, "triggered_by": actor.email, "was_new": was_created}
                    )
                
                # Create approval task
                self._create_approval_task(ticket, step, approver)
                
                # Notify approver
                branch_name = getattr(step, 'branch_name', None) or (step.data.get("branch_name") if step.data else None)
                self.notification_service.enqueue_approval_pending(
                    ticket_id=ticket.ticket_id,
                    approver_email=approver.email,
                    ticket_title=ticket.title,
                    requester_name=ticket.requester.display_name,
                    branch_name=branch_name,
                    step_name=step.step_name,
                    workflow_name=ticket.workflow_name,
                    workflow_id=ticket.workflow_id
                )
                
                # For FROM_LOOKUP resolution: notify ALL users (not just primary approver)
                resolution = step_def.get("approver_resolution")
                if resolution == ApproverResolution.FROM_LOOKUP.value:
                    try:
                        self._notify_all_lookup_users_for_approval(
                            ticket=ticket,
                            step=step,
                            step_def=step_def,
                            primary_approver_email=approver.email,
                            actor=actor
                        )
                    except Exception as e:
                        # Don't let notification failures crash ticket creation
                        logger.error(
                            f"Failed to notify lookup users for approval: {e}",
                            extra={"ticket_id": ticket.ticket_id, "step_id": step.step_id}
                        )
            
        elif step.step_type == StepType.TASK_STEP:
            # Wait for manager to assign agent
            updates["state"] = StepState.ACTIVE.value
            # assigned_to will be set when manager assigns
            
            # Handle linked repeating source - pre-populate output_values with source rows
            linked_source = step_def.get("linked_repeating_source")
            logger.info(
                f"Task step activation: step_id={step.step_id}, has_linked_source={linked_source is not None}",
                extra={
                    "ticket_id": ticket.ticket_id,
                    "step_id": step.step_id,
                    "step_name": step.step_name,
                    "linked_source": linked_source,
                    "form_values_keys": list(ticket.form_values.keys()) if ticket.form_values else []
                }
            )
            if linked_source:
                source_step_id = linked_source.get("source_step_id")
                source_section_id = linked_source.get("source_section_id")
                context_field_keys = linked_source.get("context_field_keys", [])
                
                # Get source section data from ticket.form_values
                section_key = f"__section_{source_section_id}"
                source_rows = ticket.form_values.get(section_key, [])
                
                logger.info(
                    f"Linked task: looking for section data, section_key={section_key}, found_rows={len(source_rows) if isinstance(source_rows, list) else 'not_a_list'}",
                    extra={
                        "ticket_id": ticket.ticket_id,
                        "step_id": step.step_id,
                        "section_key": section_key,
                        "source_rows_type": type(source_rows).__name__,
                        "available_keys": list(ticket.form_values.keys()) if ticket.form_values else []
                    }
                )
                
                if source_rows and isinstance(source_rows, list):
                    # Find source step definition to get field labels for context
                    source_step_def = self._find_step_definition(source_step_id, workflow_version)
                    source_fields = source_step_def.get("fields", []) if source_step_def else []
                    
                    # Build field label lookup
                    field_labels = {f.get("field_key"): f.get("field_label") for f in source_fields}
                    
                    # Pre-populate output_values with linked rows structure
                    linked_rows = []
                    for row_index, source_row in enumerate(source_rows):
                        # Build context data for this row
                        context_data = {}
                        for field_key in context_field_keys:
                            if field_key in source_row:
                                context_data[field_key] = {
                                    "value": source_row[field_key],
                                    "label": field_labels.get(field_key, field_key)
                                }
                        
                        linked_rows.append({
                            "__source_row_index": row_index,
                            "__context": context_data,
                            # Agent will fill in the actual fields here
                        })
                    
                    # Store in step data
                    step_data = step.data or {}
                    step_data["linked_rows"] = linked_rows
                    step_data["linked_source_info"] = {
                        "source_step_id": source_step_id,
                        "source_section_id": source_section_id,
                        "total_rows": len(source_rows)
                    }
                    updates["data"] = step_data
                    
                    logger.info(
                        f"Initialized linked task with {len(source_rows)} rows from source section",
                        extra={
                            "ticket_id": ticket.ticket_id,
                            "step_id": step.step_id,
                            "source_section_id": source_section_id,
                            "row_count": len(source_rows)
                        }
                    )
            
        elif step.step_type == StepType.NOTIFY_STEP:
            # Check if NOTIFY should be deferred (ANY/MAJORITY mode with pending branches)
            if self._should_defer_notify(ticket, step, step_def):
                self._defer_notify_step(ticket, step, actor, correlation_id)
                return  # Don't activate yet - wait for all branches
            
            # Auto-advance notification step
            updates["state"] = StepState.COMPLETED.value
            updates["completed_at"] = now
            is_notify_step = True
            
        elif step.step_type == StepType.FORK_STEP:
            # Fork step - activate all parallel branches
            updates["state"] = StepState.COMPLETED.value
            updates["completed_at"] = now
            
            # Handle fork activation after step update
            self._handle_fork_activation(ticket, step, step_def, workflow_version, actor, correlation_id)
            return  # Fork handles its own transitions
            
        elif step.step_type == StepType.JOIN_STEP:
            # Join step - wait for all branches
            updates["state"] = StepState.WAITING_FOR_BRANCHES.value
            
            # Check if all branches already completed (edge case)
            if self._check_join_completion(ticket, step, step_def, workflow_version):
                updates["state"] = StepState.COMPLETED.value
                updates["completed_at"] = now
                # Transition to next after join
                self._transition_after_join(ticket, step, workflow_version, actor, correlation_id)
                return
        
        elif step.step_type == StepType.SUB_WORKFLOW_STEP:
            # Sub-workflow step - expand and activate sub-workflow
            self._handle_sub_workflow_activation(
                ticket, step, step_def, workflow_version, actor, correlation_id, now
            )
            return  # Sub-workflow handles its own transitions
        else:
            is_notify_step = False
        
        # Update step
        self.ticket_repo.update_step(
            step.ticket_step_id,
            updates,
            expected_version=step.version
        )
        
        # Update ticket current step
        self.ticket_repo.update_ticket(
            ticket.ticket_id,
            {"current_step_id": step.step_id},
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_step_activated(
            ticket_id=ticket.ticket_id,
            ticket_step_id=step.ticket_step_id,
            step_name=step.step_name,
            actor=actor,
            correlation_id=correlation_id
        )
        
        # For NOTIFY_STEP, auto-transition to next or complete
        if is_notify_step:
            # Get notification configuration from step definition
            recipients_config = step_def.get("recipients", ["requester"])  # Default to requester only
            notification_template = step_def.get("notification_template", "TICKET_COMPLETED")
            
            # Build list of recipient emails based on configuration
            recipient_emails: List[str] = []
            
            # Get all steps for resolving agent/approvers
            all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
            
            for recipient_type in recipients_config:
                if recipient_type == "requester":
                    recipient_emails.append(ticket.requester.email)
                    
                elif recipient_type == "assigned_agent":
                    # Get all assigned agents from completed task steps
                    for s in all_steps:
                        if s.step_type == StepType.TASK_STEP and s.assigned_to and s.state == StepState.COMPLETED:
                            if s.assigned_to.email and s.assigned_to.email not in recipient_emails:
                                recipient_emails.append(s.assigned_to.email)
                                
                elif recipient_type == "approvers":
                    # Get all approvers from completed approval steps
                    for s in all_steps:
                        if s.step_type == StepType.APPROVAL_STEP and s.assigned_to and s.state == StepState.COMPLETED:
                            if s.assigned_to.email and s.assigned_to.email not in recipient_emails:
                                recipient_emails.append(s.assigned_to.email)
            
            # Fallback to requester if no recipients configured
            if not recipient_emails:
                recipient_emails = [ticket.requester.email]
            
            logger.info(
                f"Sending notification to {len(recipient_emails)} recipients: {recipient_emails}",
                extra={"ticket_id": ticket.ticket_id, "template": notification_template, "correlation_id": correlation_id}
            )
            
            # Send notification to all recipients
            for email in recipient_emails:
                self.notification_service.enqueue_ticket_completed(
                    ticket_id=ticket.ticket_id,
                    requester_email=email,  # Send to each recipient
                    ticket_title=ticket.title
                )
            
            # Refresh ticket and step for version
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            step = self.ticket_repo.get_step_or_raise(step.ticket_step_id)
            
            # Transition to next step or complete
            self._transition_to_next(ticket, step, TransitionEvent.COMPLETE_TASK, workflow_version, actor, correlation_id)
    
    def _complete_notify_step(
        self,
        ticket: Ticket,
        step: TicketStep,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str,
        outcome: str = "COMPLETED"
    ) -> None:
        """
        Complete a NOTIFY step and send appropriate notification based on outcome.
        Used when skip/reject triggers notify instead of cancelling it.
        
        Args:
            outcome: One of "COMPLETED", "REJECTED", "SKIPPED"
        """
        now = utc_now()
        
        # Get step definition for notification config
        step_def = self._find_step_definition(step.step_id, workflow_version)
        if not step_def:
            logger.warning(f"Could not find step definition for notify step {step.step_id}")
            return
        
        # Get notification configuration from step definition
        recipients_config = step_def.get("recipients", ["requester"])
        
        # Build list of recipient emails based on configuration
        recipient_emails: List[str] = []
        
        # Get all steps for resolving agent/approvers
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        
        for recipient_type in recipients_config:
            if recipient_type == "requester":
                recipient_emails.append(ticket.requester.email)
                
            elif recipient_type == "assigned_agent":
                # Get all assigned agents from completed task steps
                for s in all_steps:
                    if s.step_type == StepType.TASK_STEP and s.assigned_to and s.state == StepState.COMPLETED:
                        if s.assigned_to.email and s.assigned_to.email not in recipient_emails:
                            recipient_emails.append(s.assigned_to.email)
                            
            elif recipient_type == "approvers":
                # Get all approvers from completed approval steps
                for s in all_steps:
                    if s.step_type == StepType.APPROVAL_STEP and s.assigned_to and s.state == StepState.COMPLETED:
                        if s.assigned_to.email and s.assigned_to.email not in recipient_emails:
                            recipient_emails.append(s.assigned_to.email)
        
        # Fallback to requester if no recipients configured
        if not recipient_emails:
            recipient_emails = [ticket.requester.email]
        
        logger.info(
            f"Sending {outcome} notification to {len(recipient_emails)} recipients",
            extra={"ticket_id": ticket.ticket_id, "outcome": outcome, "correlation_id": correlation_id}
        )
        
        # Send appropriate notification based on outcome
        for email in recipient_emails:
            if outcome == "REJECTED":
                self.notification_service.enqueue_ticket_rejected(
                    ticket_id=ticket.ticket_id,
                    requester_email=email,
                    ticket_title=ticket.title,
                    reason="Ticket was rejected"
                )
            elif outcome == "SKIPPED":
                self.notification_service.enqueue_skipped(
                    ticket_id=ticket.ticket_id,
                    requester_email=email,
                    ticket_title=ticket.title,
                    approver_name=actor.display_name,
                    reason="Ticket was skipped",
                    workflow_name=ticket.workflow_name,
                    workflow_id=ticket.workflow_id
                )
            else:
                # COMPLETED
                self.notification_service.enqueue_ticket_completed(
                    ticket_id=ticket.ticket_id,
                    requester_email=email,
                    ticket_title=ticket.title
                )
        
        # Mark notify step as completed with outcome
        self.ticket_repo.update_step(
            step.ticket_step_id,
            {
                "state": StepState.COMPLETED.value,
                "outcome": outcome,
                "completed_at": now
            },
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=step.ticket_step_id,
            event_type=AuditEventType.NOTIFY_SENT,
            actor=actor,
            details={"outcome": outcome, "recipients": recipient_emails},
            correlation_id=correlation_id
        )
    
    def _cancel_approval_tasks_for_step(self, ticket_step_id: str) -> int:
        """
        Cancel all pending approval tasks for a given step.
        Returns the number of tasks cancelled.
        """
        now = utc_now()
        approval_tasks = self.ticket_repo.get_approval_tasks_for_step(ticket_step_id)
        cancelled_count = 0
        
        for task in approval_tasks:
            if task.decision == ApprovalDecision.PENDING:
                try:
                    self.ticket_repo.update_approval_task(
                        task.approval_task_id,
                        {
                            "decision": "CANCELLED",
                            "decided_at": now
                        }
                    )
                    cancelled_count += 1
                except Exception as e:
                    logger.warning(f"Could not cancel approval task {task.approval_task_id}: {e}")
        
        return cancelled_count
    
    def _resolve_approver(
        self,
        ticket: Ticket,
        step_def: Dict[str, Any],
        actor: ActorContext,
        all_steps: Optional[List[TicketStep]] = None
    ) -> UserSnapshot:
        """Resolve approver based on step configuration"""
        resolution = step_def.get("approver_resolution", "REQUESTER_MANAGER")
        
        if resolution == ApproverResolution.REQUESTER_MANAGER.value:
            if ticket.manager_snapshot:
                return ticket.manager_snapshot
            # Check for SPOC fallback
            spoc_email = step_def.get("spoc_email")
            if spoc_email:
                return UserSnapshot(
                    email=spoc_email,
                    display_name=spoc_email.split("@")[0]
                )
            raise ManagerNotFoundError(
                "Manager not found. Configure SPOC approver or update AD manager mapping.",
                details={"ticket_id": ticket.ticket_id}
            )
        
        elif resolution == ApproverResolution.SPECIFIC_EMAIL.value:
            email = step_def.get("specific_approver_email")
            if not email:
                raise ApproverResolutionError(
                    "Specific approver email not configured",
                    details={"step_id": step_def.get("step_id")}
                )
            # Also get aad_id and display_name if stored in step definition
            aad_id = step_def.get("specific_approver_aad_id")
            display_name = step_def.get("specific_approver_display_name") or email.split("@")[0]
            return UserSnapshot(
                aad_id=aad_id,
                email=email,
                display_name=display_name
            )
        
        elif resolution == ApproverResolution.SPOC_EMAIL.value:
            email = step_def.get("spoc_email")
            if not email:
                raise ApproverResolutionError(
                    "SPOC email not configured",
                    details={"step_id": step_def.get("step_id")}
                )
            return UserSnapshot(
                email=email,
                display_name=email.split("@")[0]
            )
        
        elif resolution == ApproverResolution.CONDITIONAL.value:
            # Evaluate conditional rules based on form field values
            conditional_rules = step_def.get("conditional_approver_rules", [])
            if not conditional_rules:
                raise ApproverResolutionError(
                    "Conditional approver rules not configured",
                    details={"step_id": step_def.get("step_id")}
                )
            
            # Build context from ticket form values
            context = {"form_values": ticket.form_values}
            
            # Evaluate each rule in order - first match wins
            for rule in conditional_rules:
                try:
                    # Create a Condition object for evaluation
                    from ..domain.models import Condition
                    condition = Condition(
                        field=f"form_values.{rule.get('field_key')}",
                        operator=rule.get("operator"),
                        value=rule.get("value")
                    )
                    
                    # Evaluate condition
                    if self.condition_evaluator._evaluate_single(condition, context):
                        # Condition matched - return this approver
                        email = rule.get("approver_email")
                        aad_id = rule.get("approver_aad_id")
                        display_name = rule.get("approver_display_name") or email.split("@")[0]
                        
                        logger.info(
                            f"Conditional approver rule matched for step {step_def.get('step_id')}",
                            extra={
                                "step_id": step_def.get("step_id"),
                                "field_key": rule.get("field_key"),
                                "operator": rule.get("operator"),
                                "value": rule.get("value"),
                                "approver_email": email
                            }
                        )
                        
                        return UserSnapshot(
                            aad_id=aad_id,
                            email=email,
                            display_name=display_name
                        )
                except Exception as e:
                    logger.warning(f"Error evaluating conditional approver rule: {e}")
                    continue  # Try next rule
            
            # No rules matched - use fallback
            fallback_email = step_def.get("conditional_fallback_approver")
            if fallback_email:
                logger.info(
                    f"Using conditional fallback approver for step {step_def.get('step_id')}",
                    extra={"step_id": step_def.get("step_id"), "fallback_email": fallback_email}
                )
                return UserSnapshot(
                    email=fallback_email,
                    display_name=fallback_email.split("@")[0]
                )
            
            # Try SPOC as final fallback
            spoc_email = step_def.get("spoc_email")
            if spoc_email:
                logger.info(
                    f"Using SPOC as fallback for conditional approver in step {step_def.get('step_id')}",
                    extra={"step_id": step_def.get("step_id")}
                )
                return UserSnapshot(
                    email=spoc_email,
                    display_name=spoc_email.split("@")[0]
                )
            
            # Try manager as last resort
            if ticket.manager_snapshot:
                logger.info(
                    f"Using manager as final fallback for conditional approver in step {step_def.get('step_id')}",
                    extra={"step_id": step_def.get("step_id")}
                )
                return ticket.manager_snapshot
            
            raise ApproverResolutionError(
                "No conditional approver rule matched and no fallback configured",
                details={"step_id": step_def.get("step_id")}
            )
        
        elif resolution == ApproverResolution.STEP_ASSIGNEE.value:
            # Route to the assignee of a specified step (e.g., task step)
            referenced_step_id = step_def.get("step_assignee_step_id")
            if not referenced_step_id:
                raise ApproverResolutionError(
                    "Step assignee step ID not configured",
                    details={"step_id": step_def.get("step_id")}
                )
            
            # Get all steps if not provided
            if all_steps is None:
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
            
            # Find the referenced step by step_id (template step_id, not ticket_step_id)
            referenced_step = None
            for step in all_steps:
                if step.step_id == referenced_step_id:
                    referenced_step = step
                    break
            
            if not referenced_step:
                raise ApproverResolutionError(
                    f"Referenced step '{referenced_step_id}' not found in ticket",
                    details={
                        "step_id": step_def.get("step_id"),
                        "referenced_step_id": referenced_step_id,
                        "ticket_id": ticket.ticket_id
                    }
                )
            
            # Check if the referenced step has an assignee
            if not referenced_step.assigned_to:
                # Fallback to SPOC if available
                spoc_email = step_def.get("spoc_email")
                if spoc_email:
                    logger.info(
                        f"Referenced step '{referenced_step_id}' has no assignee, using SPOC fallback",
                        extra={
                            "step_id": step_def.get("step_id"),
                            "referenced_step_id": referenced_step_id
                        }
                    )
                    return UserSnapshot(
                        email=spoc_email,
                        display_name=spoc_email.split("@")[0]
                    )
                
                # Fallback to manager
                if ticket.manager_snapshot:
                    logger.info(
                        f"Referenced step '{referenced_step_id}' has no assignee, using manager fallback",
                        extra={
                            "step_id": step_def.get("step_id"),
                            "referenced_step_id": referenced_step_id
                        }
                    )
                    return ticket.manager_snapshot
                
                raise ApproverResolutionError(
                    f"Referenced step '{referenced_step_id}' has no assignee and no fallback configured",
                    details={
                        "step_id": step_def.get("step_id"),
                        "referenced_step_id": referenced_step_id,
                        "ticket_id": ticket.ticket_id
                    }
                )
            
            # Return the assignee from the referenced step
            logger.info(
                f"Resolved approver from step assignee '{referenced_step_id}'",
                extra={
                    "step_id": step_def.get("step_id"),
                    "referenced_step_id": referenced_step_id,
                    "assignee_email": referenced_step.assigned_to.email
                }
            )
            return referenced_step.assigned_to
        
        elif resolution == ApproverResolution.FROM_LOOKUP.value:
            # Route to primary user from a workflow lookup table based on form field
            lookup_id = step_def.get("lookup_id")
            lookup_source_field_key = step_def.get("lookup_source_field_key")
            lookup_source_step_id = step_def.get("lookup_source_step_id")
            
            if not lookup_id or not lookup_source_field_key:
                raise ApproverResolutionError(
                    "Lookup approver configuration incomplete",
                    details={
                        "step_id": step_def.get("step_id"),
                        "lookup_id": lookup_id,
                        "lookup_source_field_key": lookup_source_field_key
                    }
                )
            
            # Get the form field value from ticket.form_values
            # All form field values are stored in ticket.form_values
            form_values = ticket.form_values or {}
            field_value = form_values.get(lookup_source_field_key)
            
            # If we have a source step ID and all_steps, also check the step's data
            if not field_value and lookup_source_step_id and all_steps:
                for step in all_steps:
                    if step.step_id == lookup_source_step_id and step.data:
                        field_value = step.data.get(lookup_source_field_key)
                        if field_value:
                            break
            
            if not field_value:
                # Fallback to SPOC
                spoc_email = step_def.get("spoc_email")
                if spoc_email:
                    logger.info(
                        f"Lookup source field has no value, using SPOC fallback",
                        extra={
                            "step_id": step_def.get("step_id"),
                            "lookup_source_field_key": lookup_source_field_key
                        }
                    )
                    return UserSnapshot(
                        email=spoc_email,
                        display_name=spoc_email.split("@")[0]
                    )
                
                raise ApproverResolutionError(
                    f"Lookup source field '{lookup_source_field_key}' has no value",
                    details={"step_id": step_def.get("step_id")}
                )
            
            # Resolve the primary user from the lookup
            from ..services.lookup_service import LookupService
            lookup_service = LookupService()
            
            primary_user = lookup_service.get_primary_approver_from_lookup(
                workflow_id=ticket.workflow_id,
                lookup_id=lookup_id,
                key=str(field_value)
            )
            
            if primary_user:
                logger.info(
                    f"Resolved approver from lookup '{lookup_id}' for key '{field_value}'",
                    extra={
                        "step_id": step_def.get("step_id"),
                        "lookup_id": lookup_id,
                        "field_value": field_value,
                        "approver_email": primary_user["email"]
                    }
                )
                return UserSnapshot(
                    aad_id=primary_user.get("aad_id"),
                    email=primary_user["email"],
                    display_name=primary_user["display_name"]
                )
            
            # No user found in lookup - try fallbacks
            spoc_email = step_def.get("spoc_email")
            if spoc_email:
                logger.info(
                    f"No user found in lookup for key '{field_value}', using SPOC fallback",
                    extra={"step_id": step_def.get("step_id")}
                )
                return UserSnapshot(
                    email=spoc_email,
                    display_name=spoc_email.split("@")[0]
                )
            
            if ticket.manager_snapshot:
                logger.info(
                    f"No user found in lookup for key '{field_value}', using manager fallback",
                    extra={"step_id": step_def.get("step_id")}
                )
                return ticket.manager_snapshot
            
            raise ApproverResolutionError(
                f"No user found in lookup for key '{field_value}' and no fallback configured",
                details={
                    "step_id": step_def.get("step_id"),
                    "lookup_id": lookup_id,
                    "field_value": field_value
                }
            )
        
        raise ApproverResolutionError(
            f"Unknown approver resolution: {resolution}",
            details={"step_id": step_def.get("step_id")}
        )
    
    def _create_approval_task(
        self,
        ticket: Ticket,
        step: TicketStep,
        approver: UserSnapshot
    ) -> ApprovalTask:
        """Create approval task"""
        task = ApprovalTask(
            approval_task_id=generate_approval_task_id(),
            ticket_id=ticket.ticket_id,
            ticket_step_id=step.ticket_step_id,
            approver=approver,
            decision=ApprovalDecision.PENDING,
            created_at=utc_now()
        )
        return self.ticket_repo.create_approval_task(task)
    
    # =========================================================================
    # Parallel Branching (Fork/Join)
    # =========================================================================
    
    def _handle_fork_activation(
        self,
        ticket: Ticket,
        fork_step: TicketStep,
        step_def: Dict[str, Any],
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """
        Handle fork step activation - creates and activates all parallel branches
        
        Algorithm:
        1. Get all branch definitions from fork step
        2. For each branch, find the start step and activate it
        3. Update ticket with active_branches tracking
        4. Audit fork activation
        """
        now = utc_now()
        branches = step_def.get("branches", [])
        
        if not branches:
            logger.warning(f"Fork step {fork_step.step_id} has no branches defined")
            return
        
        # Check if this fork is part of a sub-workflow
        is_sub_workflow_fork = bool(getattr(fork_step, 'from_sub_workflow_id', None))
        sub_workflow_id = getattr(fork_step, 'from_sub_workflow_id', None)
        parent_branch_id = getattr(fork_step, 'branch_id', None)  # Parent workflow's branch context
        
        logger.info(
            f"Activating fork: is_sub_workflow={is_sub_workflow_fork}, sub_wf_id={sub_workflow_id}, parent_branch={parent_branch_id}",
            extra={"ticket_id": ticket.ticket_id, "fork_step_id": fork_step.step_id}
        )
        
        # Update fork step as completed
        self.ticket_repo.update_step(
            fork_step.ticket_step_id,
            {
                "state": StepState.COMPLETED.value,
                "completed_at": now
            },
            expected_version=fork_step.version
        )
        
        # Track active branches
        active_branches = []
        current_step_ids = []
        
        # Get all ticket steps
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        
        for branch_idx, branch_def in enumerate(branches):
            raw_branch_id = branch_def.get("branch_id")
            branch_name = branch_def.get("branch_name", f"Branch {branch_idx + 1}")
            start_step_id = branch_def.get("start_step_id")
            
            if not start_step_id:
                logger.warning(f"Branch {raw_branch_id} has no start_step_id")
                continue
            
            # For sub-workflow forks, use simple branch_id to maintain consistency
            # The sub_workflow_handler already created steps with simple branch_ids
            # We should NOT create composite IDs here - that was the bug
            branch_id = raw_branch_id
            
            # Find the ticket step for this branch start
            branch_start_step = self._find_ticket_step(all_steps, start_step_id)
            
            if not branch_start_step:
                logger.warning(f"Branch start step {start_step_id} not found")
                continue
            
            # Update branch metadata on the step
            self.ticket_repo.update_step(
                branch_start_step.ticket_step_id,
                {
                    "branch_id": branch_id,
                    "branch_name": branch_name,
                    "parent_fork_step_id": fork_step.step_id,
                    "branch_order": branch_idx
                },
                expected_version=branch_start_step.version
            )
            
            # Refresh step after update
            branch_start_step = self.ticket_repo.get_step_or_raise(branch_start_step.ticket_step_id)
            
            # Activate the branch start step
            # Refresh ticket for each branch activation
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            self._activate_step(ticket, branch_start_step, workflow_version, actor, correlation_id)
            
            # Track branch state - include parent_fork_step_id for proper tracking
            active_branches.append(BranchState(
                branch_id=branch_id,
                branch_name=branch_name,
                parent_fork_step_id=fork_step.step_id,
                state=StepState.ACTIVE,
                current_step_id=start_step_id,
                started_at=now
            ))
            current_step_ids.append(start_step_id)
            
            logger.info(
                f"Activated branch '{branch_name}' starting at step {start_step_id}",
                extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id}
            )
        
        # Update ticket with parallel execution state (with retry)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                self.ticket_repo.update_ticket(
                    ticket.ticket_id,
                    {
                        "active_branches": [b.model_dump(mode="json") for b in active_branches],
                        "current_step_ids": current_step_ids
                    },
                    expected_version=ticket.version
                )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to update ticket with branches after {max_retries} attempts")
                    raise
                logger.warning(f"Concurrency conflict on fork state update, retrying (attempt {attempt + 1})")
        
        # Audit fork activation
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=fork_step.ticket_step_id,
            event_type=AuditEventType.FORK_ACTIVATED,
            actor=actor,
            details={
                "fork_step_id": fork_step.step_id,
                "branches_activated": len(active_branches),
                "branch_names": [b.branch_name for b in active_branches]
            },
            correlation_id=correlation_id
        )
    
    def _check_join_completion(
        self,
        ticket: Ticket,
        join_step: TicketStep,
        step_def: Dict[str, Any],
        workflow_version: WorkflowVersion
    ) -> bool:
        """
        Check if all required branches have completed for a join step
        
        Returns True if join can proceed, False if still waiting
        """
        source_fork_step_id = step_def.get("source_fork_step_id")
        join_mode = step_def.get("join_mode", ForkJoinMode.ALL.value)
        
        if not source_fork_step_id:
            logger.warning(f"Join step {join_step.step_id} has no source_fork_step_id")
            return True  # Proceed anyway
        
        # Find the fork step definition to get branch info
        fork_step_def = self._find_step_definition(source_fork_step_id, workflow_version)
        if not fork_step_def:
            logger.warning(f"Source fork step {source_fork_step_id} not found")
            return True
        
        branches = fork_step_def.get("branches", [])
        if not branches:
            return True
        
        # Get all steps for this ticket
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        
        # FIRST: Check active_branches state as primary source of truth
        # This is more reliable than checking individual step states
        active_branches = ticket.active_branches or []
        
        # Get branch states for branches that belong to this fork
        # Now that BranchState has parent_fork_step_id, we can directly match
        fork_branches = [
            b for b in active_branches 
            if b.parent_fork_step_id == source_fork_step_id
        ]
        
        fork_branch_ids = {b.branch_id for b in fork_branches}
        
        completed_branches = 0
        failed_branches = 0
        total_branches = len(branches)
        
        # Count completed/failed branches from active_branches
        for branch_state in fork_branches:
            if branch_state.state == StepState.COMPLETED:
                completed_branches += 1
                logger.debug(f"Branch '{branch_state.branch_name}' completed (from active_branches)")
            elif branch_state.state in [StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                failed_branches += 1
                logger.debug(f"Branch '{branch_state.branch_name}' failed/skipped (from active_branches)")
        
        # FALLBACK: If active_branches doesn't have all branches, check step states
        # This handles cases where branches haven't been marked yet
        if len(fork_branches) < total_branches:
            for branch_def in branches:
                branch_id = branch_def.get("branch_id")
                branch_name = branch_def.get("branch_name", "")
                
                # Skip if we already counted this branch from active_branches
                if branch_id in fork_branch_ids:
                    continue
                
                # Find the last step in this branch that transitions to join
                last_step_id = self._get_last_step_in_branch(branch_def, workflow_version, join_step.step_id)
                
                if last_step_id:
                    last_step = self._find_ticket_step(all_steps, last_step_id)
                    if last_step:
                        if last_step.state == StepState.COMPLETED:
                            completed_branches += 1
                            logger.debug(f"Branch '{branch_name}' completed (step {last_step_id})")
                        elif last_step.state in [StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                            failed_branches += 1
                            logger.debug(f"Branch '{branch_name}' failed/skipped (step {last_step_id})")
                        else:
                            # Check if this is an approval step that was rejected/skipped via approval task
                            if last_step.step_type == StepType.APPROVAL_STEP:
                                approval_tasks = self.ticket_repo.get_approval_tasks_for_step(last_step.ticket_step_id)
                                if approval_tasks and all(task.decision in [ApprovalDecision.REJECTED, ApprovalDecision.SKIPPED] for task in approval_tasks):
                                    failed_branches += 1
                                    logger.debug(f"Branch '{branch_name}' failed/skipped (approval step {last_step_id} has all tasks rejected/skipped)")
                            else:
                                logger.debug(f"Branch '{branch_name}' still active (step {last_step_id} is {last_step.state})")
                else:
                    # Fallback: check steps with branch_id
                    branch_steps = [s for s in all_steps if getattr(s, 'branch_id', None) == branch_id]
                    if branch_steps:
                        # Find the most recently updated step
                        last_branch_step = max(branch_steps, key=lambda s: s.completed_at or s.started_at or datetime.min)
                        if last_branch_step.state == StepState.COMPLETED:
                            completed_branches += 1
                        elif last_branch_step.state in [StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                            failed_branches += 1
        
        # Check fork failure policy - if CONTINUE_OTHERS, only count non-failed branches
        fork_step_def = self._find_step_definition(source_fork_step_id, workflow_version)
        failure_policy = None
        if fork_step_def:
            failure_policy = fork_step_def.get("failure_policy", BranchFailurePolicy.FAIL_ALL.value)
        
        # Calculate non-failed branches (branches that are not rejected/cancelled)
        # Rejected branches should be excluded from the "all branches" validation
        non_failed_branches = total_branches - failed_branches
        
        logger.info(
            f"Join check: {completed_branches}/{total_branches} branches completed, {failed_branches} failed/rejected, "
            f"{non_failed_branches} non-failed, policy={failure_policy}, mode={join_mode}",
            extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id}
        )
        
        # For CONTINUE_OTHERS policy, join can proceed based on join mode
        if failure_policy == BranchFailurePolicy.CONTINUE_OTHERS.value:
            if join_mode == ForkJoinMode.ALL.value:
                return completed_branches == non_failed_branches
            elif join_mode == ForkJoinMode.ANY.value:
                # ANY mode with CONTINUE_OTHERS: proceed when at least one branch reaches terminal state
                # Terminal state = completed OR skipped/rejected (failed_branches)
                # This allows JOIN to proceed when any branch is skipped/rejected too
                terminal_branches = completed_branches + failed_branches
                return terminal_branches >= 1
            elif join_mode == ForkJoinMode.MAJORITY.value:
                # MAJORITY with CONTINUE_OTHERS: count all terminal branches
                terminal_branches = completed_branches + failed_branches
                return terminal_branches > total_branches // 2
        
        # For ANY mode without CONTINUE_OTHERS, proceed when at least one branch COMPLETES
        # (failed branches should not trigger join for FAIL_ALL/CANCEL_OTHERS)
        if join_mode == ForkJoinMode.ANY.value:
            return completed_branches >= 1
        
        # For ALL mode: only count non-rejected branches
        # If a branch is rejected, it should not be considered in the "all branches" validation
        # Only approved/completed branches should be counted
        # This applies regardless of failure policy - rejected branches are always excluded
        if join_mode == ForkJoinMode.ALL.value:
            # Join proceeds when all non-rejected branches are completed
            # Rejected branches are excluded from the count
            logger.info(
                f"ALL mode: {completed_branches}/{non_failed_branches} non-rejected branches completed "
                f"({failed_branches} rejected branches excluded from validation)",
                extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id}
            )
            return completed_branches == non_failed_branches
        
        # For MAJORITY mode, count only non-failed branches
        if join_mode == ForkJoinMode.MAJORITY.value:
            return completed_branches > non_failed_branches // 2
        
        # For FAIL_ALL policy with other modes, check if failures should block join
        # Note: For ALL mode, we already handled it above by excluding rejected branches
        if failed_branches > 0 and failure_policy == BranchFailurePolicy.FAIL_ALL.value:
            # FAIL_ALL policy means any failure blocks the join (except for ALL mode which we handled above)
            if join_mode != ForkJoinMode.ALL.value:
                return False
        
        # Default: all non-failed branches must complete
        return completed_branches == non_failed_branches
    
    def _get_last_step_in_branch(
        self,
        branch_def: Dict[str, Any],
        workflow_version: WorkflowVersion,
        join_step_id: str
    ) -> Optional[str]:
        """Get the last step ID in a branch (the one that transitions to join)"""
        start_step_id = branch_def.get("start_step_id")
        if not start_step_id:
            return None
            
        transitions = workflow_version.definition.transitions
        
        # Build a transition map
        transition_map = {}
        for t in transitions:
            from_id = t.from_step_id if hasattr(t, 'from_step_id') else t.get("from_step_id")
            to_id = t.to_step_id if hasattr(t, 'to_step_id') else t.get("to_step_id")
            if from_id and to_id:
                transition_map[from_id] = to_id
        
        # Trace from start_step_id until we find a step that transitions to join
        current_step = start_step_id
        visited = set()
        
        while current_step and current_step not in visited:
            visited.add(current_step)
            next_step = transition_map.get(current_step)
            
            if next_step == join_step_id:
                # Found the last step in this branch
                return current_step
            
            if not next_step:
                # No more transitions - this is the last step
                return current_step
            
            current_step = next_step
        
        return start_step_id  # Fallback to start step if single-step branch
    
    def _transition_after_join(
        self,
        ticket: Ticket,
        join_step: TicketStep,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """Handle transition after join step completes"""
        # CRITICAL GUARD: Prevent duplicate transitions
        # If join_proceeded is already True, this transition already happened
        # Refresh ticket to get latest state
        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
        if ticket.join_proceeded:
            logger.debug(
                f"Join already proceeded for ticket {ticket.ticket_id}, skipping duplicate transition",
                extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id}
            )
            return
        
        # Also check if join step is already completed
        join_step = self.ticket_repo.get_step_or_raise(join_step.ticket_step_id)
        if join_step.state == StepState.COMPLETED:
            logger.debug(
                f"Join step {join_step.step_id} already completed, skipping duplicate transition",
                extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id}
            )
            return
        
        now = utc_now()
        
        # Get join step definition to find source fork
        join_step_def = self._find_step_definition(join_step.step_id, workflow_version)
        source_fork_step_id = join_step_def.get("source_fork_step_id") if join_step_def else None
        join_mode = join_step_def.get("join_mode", ForkJoinMode.ALL.value) if join_step_def else ForkJoinMode.ALL.value
        
        # For ANY/MAJORITY mode: Let remaining branches continue working
        # The final NOTIFY step will be deferred until all branches complete
        is_any_majority = join_mode in [ForkJoinMode.ANY.value, ForkJoinMode.MAJORITY.value]
        
        if is_any_majority:
            # Mark that join has proceeded (for deferred NOTIFY check)
            # Branches continue working - NOTIFY will wait for all to complete
            logger.info(
                f"Join proceeding with {join_mode} mode - branches will continue, NOTIFY will be deferred",
                extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id}
            )
        # Note: For ALL mode, all branches are already complete when JOIN proceeds
        
        # Mark join step as completed
        self.ticket_repo.update_step(
            join_step.ticket_step_id,
            {
                "state": StepState.COMPLETED.value,
                "completed_at": now
            },
            expected_version=join_step.version
        )
        
        # Update ticket based on join mode
        max_retries = 3
        for attempt in range(max_retries):
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                
                if is_any_majority:
                    # ANY/MAJORITY: Keep active_branches for tracking, set join_proceeded flag
                    self.ticket_repo.update_ticket(
                        ticket.ticket_id,
                        {
                            "join_proceeded": True,
                            "current_step_ids": []  # Clear current step IDs but keep branch tracking
                        },
                        expected_version=ticket.version
                    )
                else:
                    # ALL mode: Clear everything
                    self.ticket_repo.update_ticket(
                        ticket.ticket_id,
                        {
                            "active_branches": [],
                            "current_step_ids": []
                        },
                        expected_version=ticket.version
                    )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to update ticket after join after {max_retries} attempts")
                    raise
                logger.warning(f"Concurrency conflict on join cleanup, retrying (attempt {attempt + 1})")
        
        # Audit join completion
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=join_step.ticket_step_id,
            event_type=AuditEventType.JOIN_COMPLETED,
            actor=actor,
            details={"join_step_id": join_step.step_id, "join_mode": join_mode},
            correlation_id=correlation_id
        )
        
        # Refresh and transition to next step
        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
        join_step = self.ticket_repo.get_step_or_raise(join_step.ticket_step_id)
        self._transition_to_next(ticket, join_step, TransitionEvent.COMPLETE_TASK, workflow_version, actor, correlation_id)
    
    def _has_pending_branches(self, ticket: Ticket) -> bool:
        """
        Check if ticket has pending (non-terminal) branches.
        
        Used for ANY/MAJORITY join mode to determine if NOTIFY should be deferred.
        Returns True if any branch is still active/waiting.
        """
        active_branches = ticket.active_branches or []
        if not active_branches:
            return False
        
        terminal_states = {
            StepState.COMPLETED,
            StepState.REJECTED,
            StepState.CANCELLED,
            StepState.SKIPPED
        }
        
        for branch in active_branches:
            if branch.state not in terminal_states:
                logger.debug(
                    f"Branch {branch.branch_id} ({branch.branch_name}) still pending in state {branch.state}",
                    extra={"ticket_id": ticket.ticket_id}
                )
                return True
        
        return False
    
    def _should_defer_notify(
        self,
        ticket: Ticket,
        step: TicketStep,
        step_def: Dict[str, Any]
    ) -> bool:
        """
        Check if a NOTIFY step should be deferred until all branches complete.
        
        Deferral conditions:
        1. Step is NOTIFY_STEP
        2. Step has is_terminal=True (set as end step in UI)
        3. Join has proceeded with ANY/MAJORITY mode (join_proceeded=True)
        4. There are still pending branches
        """
        # Must be NOTIFY step
        if step.step_type != StepType.NOTIFY_STEP:
            return False
        
        # Must have is_terminal flag set
        if not step_def.get("is_terminal"):
            return False
        
        # Join must have proceeded with ANY/MAJORITY mode
        if not ticket.join_proceeded:
            return False
        
        # Must have pending branches
        if not self._has_pending_branches(ticket):
            return False
        
        logger.info(
            f"NOTIFY step {step.step_id} will be deferred - waiting for all branches to complete",
            extra={"ticket_id": ticket.ticket_id, "step_name": step.step_name}
        )
        return True
    
    def _defer_notify_step(
        self,
        ticket: Ticket,
        step: TicketStep,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """
        Defer a NOTIFY step until all branches complete.
        
        The step stays in NOT_STARTED state and we record its ID in the ticket
        so we can activate it later when all branches are done.
        """
        now = utc_now()
        
        # Keep step in NOT_STARTED state
        self.ticket_repo.update_step(
            step.ticket_step_id,
            {"state": StepState.NOT_STARTED.value},
            expected_version=step.version
        )
        
        # Record pending notify step in ticket
        self.ticket_repo.update_ticket(
            ticket.ticket_id,
            {"pending_end_step_id": step.ticket_step_id},
            expected_version=ticket.version
        )
        
        logger.info(
            f"Deferred NOTIFY step {step.step_id} ({step.step_name}) - waiting for all branches",
            extra={"ticket_id": ticket.ticket_id, "pending_end_step_id": step.ticket_step_id}
        )
        
        # Audit the deferral
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=step.ticket_step_id,
            event_type=AuditEventType.STEP_ACTIVATED,  # Use existing event type
            actor=actor,
            details={
                "action": "deferred",
                "reason": "Waiting for all branches to complete (ANY/MAJORITY mode)",
                "step_name": step.step_name
            },
            correlation_id=correlation_id
        )
    
    def _try_activate_pending_notify(
        self,
        ticket: Ticket,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str
    ) -> bool:
        """
        Try to activate a pending NOTIFY step if all branches are now complete.
        
        Called after each branch completes to check if we can proceed.
        Returns True if NOTIFY was activated.
        """
        # Check if there's a pending notify
        if not ticket.pending_end_step_id:
            return False
        
        # Check if all branches are now complete
        if self._has_pending_branches(ticket):
            logger.debug(
                f"Cannot activate pending NOTIFY yet - branches still pending",
                extra={"ticket_id": ticket.ticket_id}
            )
            return False
        
        # All branches complete - activate the NOTIFY
        logger.info(
            f"All branches complete - activating pending NOTIFY step",
            extra={"ticket_id": ticket.ticket_id, "pending_end_step_id": ticket.pending_end_step_id}
        )
        
        # Get the pending step
        notify_step = self.ticket_repo.get_step_or_raise(ticket.pending_end_step_id)
        notify_step_def = self._find_step_definition(notify_step.step_id, workflow_version)
        
        # Refresh ticket to get latest version
        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
        
        # Clear the pending flag
        self.ticket_repo.update_ticket(
            ticket.ticket_id,
            {
                "pending_end_step_id": None,
                "join_proceeded": False,  # Reset for future forks
                "active_branches": []  # Clear branch tracking
            },
            expected_version=ticket.version
        )
        
        # Activate the NOTIFY step
        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
        self._activate_step(ticket, notify_step, workflow_version, actor, correlation_id)
        
        return True
    
    def _handle_branch_step_completion(
        self,
        ticket: Ticket,
        completed_step: TicketStep,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str,
        event: TransitionEvent = TransitionEvent.COMPLETE_TASK  # Use actual event type
    ) -> bool:
        """
        Handle completion of a step within a parallel branch
        
        Returns True if this completion triggers a join, False otherwise
        
        Args:
            event: The actual transition event (e.g., SUBMIT_FORM for form steps, APPROVE for approvals)
        """
        branch_id = getattr(completed_step, 'branch_id', None)
        logger.info(
            f"_handle_branch_step_completion: step={completed_step.step_id}, branch_id={branch_id}, event={event}",
            extra={"ticket_id": ticket.ticket_id}
        )
        if not branch_id:
            logger.debug(f"_handle_branch_step_completion: no branch_id, returning False")
            return False
        
        # Check if next step is a join - USE THE ACTUAL EVENT, not hardcoded COMPLETE_TASK
        next_step_id = self.transition_resolver.resolve_next_step(
            current_step_id=completed_step.step_id,
            event=event,  # Use the actual event type for correct transition resolution
            ticket_context={
                "ticket": ticket.model_dump(mode="json"),
                "form_values": ticket.form_values,
                "current_step": completed_step.model_dump(mode="json")
            },
            workflow_version=workflow_version
        )
        
        # If no next step, this might be the last step in the branch
        # We should still mark the branch as completed and check for join
        if not next_step_id:
            logger.info(
                f"_handle_branch_step_completion: no next_step_id, calling _mark_branch_completed for branch {branch_id}",
                extra={"ticket_id": ticket.ticket_id, "completed_step": completed_step.step_id}
            )
            # Mark branch as completed
            self._mark_branch_completed(ticket, completed_step, actor, correlation_id, workflow_version)
            
            # Find the join step for this fork
            parent_fork_id = getattr(completed_step, 'parent_fork_step_id', None)
            if parent_fork_id:
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                for step in all_steps:
                    if step.step_type == StepType.JOIN_STEP:
                        join_step_def = self._find_step_definition(step.step_id, workflow_version)
                        if join_step_def and join_step_def.get("source_fork_step_id") == parent_fork_id:
                            # Check if join can proceed
                            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                            if self._check_join_completion(ticket, step, join_step_def, workflow_version):
                                logger.info(
                                    f"Join step {step.step_id} can proceed after branch {branch_id} completion (no next step)",
                                    extra={"ticket_id": ticket.ticket_id, "join_step": step.step_id, "branch_id": branch_id}
                                )
                                self._transition_after_join(ticket, step, workflow_version, actor, correlation_id)
                            break
            return True  # Branch handled, even if no join triggered
        
        # Check if next step is a join step
        next_step_def = self._find_step_definition(next_step_id, workflow_version)
        if not next_step_def or next_step_def.get("step_type") != StepType.JOIN_STEP.value:
            return False
        
        # Mark branch as completed (this updates active_branches and audits)
        self._mark_branch_completed(ticket, completed_step, actor, correlation_id, workflow_version)
        
        # Check if join can proceed (after branch state is updated)
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        join_step = self._find_ticket_step(all_steps, next_step_id)
        
        if join_step:
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            if self._check_join_completion(ticket, join_step, next_step_def, workflow_version):
                logger.info(
                    f"Join step {join_step.step_id} can proceed after branch {branch_id} completion",
                    extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id, "branch_id": branch_id}
                )
                self._transition_after_join(ticket, join_step, workflow_version, actor, correlation_id)
            # If join can't proceed yet, we've already marked branch as completed, so just return
            return True
        
        return False
    
    # =========================================================================
    # Sub-Workflow Handling
    # =========================================================================
    
    def _handle_sub_workflow_activation(
        self,
        ticket: Ticket,
        sub_workflow_step: TicketStep,
        step_def: Dict[str, Any],
        parent_workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str,
        now: datetime
    ) -> None:
        """
        Handle SUB_WORKFLOW_STEP activation - expands and starts the sub-workflow.
        
        This method:
        1. Marks the SUB_WORKFLOW_STEP as ACTIVE
        2. Expands all steps from the sub-workflow into TicketSteps
        3. Activates the first step of the sub-workflow
        4. Sub-workflow steps are tracked via parent_sub_workflow_step_id
        """
        logger.info(
            f"Activating sub-workflow step: {sub_workflow_step.step_id}",
            extra={
                "ticket_id": ticket.ticket_id,
                "step_id": sub_workflow_step.step_id,
                "sub_workflow_id": step_def.get("sub_workflow_id"),
                "correlation_id": correlation_id
            }
        )
        
        # Get branch context if sub-workflow is in a branch
        branch_id = sub_workflow_step.branch_id
        branch_name = sub_workflow_step.branch_name
        parent_fork_step_id = sub_workflow_step.parent_fork_step_id
        
        # Expand sub-workflow into TicketSteps
        sub_steps, sub_workflow_version, start_step_id = self.sub_workflow_handler.expand_sub_workflow(
            ticket=ticket,
            parent_step=sub_workflow_step,
            sub_workflow_step_def=step_def,
            now=now,
            branch_id=branch_id,
            branch_name=branch_name,
            parent_fork_step_id=parent_fork_step_id
        )
        
        # Save all sub-workflow steps
        for sub_step in sub_steps:
            self.ticket_repo.create_step(sub_step)
        
        # Mark the SUB_WORKFLOW_STEP as ACTIVE
        self.ticket_repo.update_step(
            sub_workflow_step.ticket_step_id,
            {
                "state": StepState.ACTIVE.value,
                "started_at": now,
                "data": {
                    **sub_workflow_step.data,
                    "sub_workflow_id": step_def.get("sub_workflow_id"),
                    "sub_workflow_version": step_def.get("sub_workflow_version"),
                    "sub_workflow_name": step_def.get("sub_workflow_name"),
                    "sub_workflow_step_count": len(sub_steps),
                    "sub_workflow_start_step_id": start_step_id
                }
            },
            expected_version=sub_workflow_step.version
        )
        
        # Audit sub-workflow started
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=sub_workflow_step.ticket_step_id,
            event_type=AuditEventType.SUB_WORKFLOW_STARTED,
            actor=actor,
            details={
                "sub_workflow_id": step_def.get("sub_workflow_id"),
                "sub_workflow_name": step_def.get("sub_workflow_name"),
                "sub_workflow_version": step_def.get("sub_workflow_version"),
                "steps_created": len(sub_steps)
            },
            correlation_id=correlation_id
        )
        
        # Find and activate the start step
        start_sub_step = next(
            (s for s in sub_steps if s.step_id == start_step_id),
            None
        )
        
        if start_sub_step:
            # Refresh ticket for version
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            # Activate the first step of sub-workflow
            self._activate_step(
                ticket, 
                start_sub_step, 
                sub_workflow_version, 
                actor, 
                correlation_id
            )
        else:
            logger.error(
                f"Could not find start step {start_step_id} in expanded sub-workflow",
                extra={
                    "ticket_id": ticket.ticket_id,
                    "sub_workflow_step_id": sub_workflow_step.ticket_step_id
                }
            )
    
    def _check_and_complete_sub_workflow(
        self,
        ticket: Ticket,
        completed_step: TicketStep,
        actor: ActorContext,
        correlation_id: str,
        workflow_version: WorkflowVersion
    ) -> bool:
        """
        Check if a step completion marks the end of a sub-workflow.
        
        If the completed step is part of a sub-workflow and the sub-workflow
        is now complete, this method:
        1. Marks the parent SUB_WORKFLOW_STEP as completed
        2. Transitions to the next step after the SUB_WORKFLOW_STEP
        
        Args:
            ticket: Current ticket
            completed_step: The step that just completed
            actor: Current actor
            correlation_id: Correlation ID
            workflow_version: The parent workflow version (not sub-workflow)
            
        Returns:
            True if this was sub-workflow completion and was handled,
            False if not part of a sub-workflow
        """
        if not completed_step.parent_sub_workflow_step_id:
            return False
        
        # Get the parent SUB_WORKFLOW_STEP
        parent_step = self.ticket_repo.get_step(
            completed_step.parent_sub_workflow_step_id
        )
        
        if not parent_step:
            logger.error(
                f"Parent sub-workflow step not found: {completed_step.parent_sub_workflow_step_id}",
                extra={
                    "ticket_id": ticket.ticket_id,
                    "completed_step_id": completed_step.ticket_step_id
                }
            )
            return False
        
        # Idempotency check - if parent step already completed, don't process again
        if parent_step.state in [StepState.COMPLETED, StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
            logger.info(
                f"Parent sub-workflow step already in terminal state: {parent_step.state}",
                extra={"ticket_id": ticket.ticket_id, "parent_step_id": parent_step.ticket_step_id}
            )
            return True
        
        # Check if sub-workflow is complete
        is_complete, outcome = self.sub_workflow_handler.is_sub_workflow_complete(
            ticket.ticket_id,
            completed_step.parent_sub_workflow_step_id
        )
        
        if not is_complete:
            # Sub-workflow still has pending steps
            return True  # Still handled as part of sub-workflow
        
        # Sub-workflow is complete - update parent step
        now = utc_now()
        
        if outcome == "COMPLETED":
            self.ticket_repo.update_step(
                parent_step.ticket_step_id,
                {
                    "state": StepState.COMPLETED.value,
                    "completed_at": now,
                    "outcome": "COMPLETED"
                },
                expected_version=parent_step.version
            )
            
            # Audit completion
            self.audit_writer.write_event(
                ticket_id=ticket.ticket_id,
                ticket_step_id=parent_step.ticket_step_id,
                event_type=AuditEventType.SUB_WORKFLOW_COMPLETED,
                actor=actor,
                details={
                    "sub_workflow_id": completed_step.from_sub_workflow_id,
                    "sub_workflow_name": completed_step.from_sub_workflow_name,
                    "outcome": "COMPLETED"
                },
                correlation_id=correlation_id
            )
            
            # Refresh and transition to next step after SUB_WORKFLOW_STEP
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            parent_step = self.ticket_repo.get_step_or_raise(parent_step.ticket_step_id)
            
            # Find parent step definition in parent workflow
            parent_step_def = self._find_step_definition(parent_step.step_id, workflow_version)
            
            # If parent step is in a branch, check for join
            if parent_step.branch_id:
                handled = self._handle_branch_step_completion(
                    ticket, parent_step, workflow_version, actor, correlation_id
                )
                if handled:
                    return True
            
            # Transition to next step using COMPLETE_TASK event 
            # (sub-workflow acts like a compound task - uses same transition event)
            self._transition_to_next(
                ticket, 
                parent_step, 
                TransitionEvent.COMPLETE_TASK, 
                workflow_version, 
                actor, 
                correlation_id
            )
            
        elif outcome == "REJECTED":
            self.ticket_repo.update_step(
                parent_step.ticket_step_id,
                {
                    "state": StepState.REJECTED.value,
                    "completed_at": now,
                    "outcome": "REJECTED"
                },
                expected_version=parent_step.version
            )
            
            # Audit failure
            self.audit_writer.write_event(
                ticket_id=ticket.ticket_id,
                ticket_step_id=parent_step.ticket_step_id,
                event_type=AuditEventType.SUB_WORKFLOW_FAILED,
                actor=actor,
                details={
                    "sub_workflow_id": completed_step.from_sub_workflow_id,
                    "sub_workflow_name": completed_step.from_sub_workflow_name,
                    "outcome": "REJECTED"
                },
                correlation_id=correlation_id
            )
            
            # Handle rejection - check if in branch with CONTINUE_OTHERS
            if parent_step.branch_id:
                self._handle_branch_rejection(
                    ticket, parent_step, workflow_version, actor, correlation_id
                )
            else:
                # Main flow - reject entire ticket
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                self._reject_ticket(ticket, actor, correlation_id, "Sub-workflow rejected")
        
        return True
    
    def _get_sub_workflow_version_for_step(
        self,
        ticket_step: TicketStep
    ) -> Optional[WorkflowVersion]:
        """
        Get the workflow version for a step that's part of a sub-workflow.
        
        This is needed to resolve transitions within sub-workflows.
        """
        if not ticket_step.from_sub_workflow_id:
            return None
        
        # Get the parent SUB_WORKFLOW_STEP to find version info
        parent_step = self.ticket_repo.get_step(
            ticket_step.parent_sub_workflow_step_id
        )
        
        if not parent_step or not parent_step.data:
            return None
        
        sub_workflow_id = parent_step.data.get("sub_workflow_id")
        sub_workflow_version = parent_step.data.get("sub_workflow_version")
        
        if sub_workflow_id and sub_workflow_version:
            return self.sub_workflow_handler.load_sub_workflow_version(
                sub_workflow_id,
                sub_workflow_version
            )
        
        return None
    
    def _handle_branch_rejection(
        self,
        ticket: Ticket,
        rejected_step: TicketStep,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """
        Handle rejection of a step that's in a branch.
        
        Uses the failure policy from the fork step to determine behavior.
        """
        # Find the fork step for this branch
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        
        # Get fork step definition to check failure policy
        fork_step_def = None
        for step_def in workflow_version.definition.steps:
            if step_def.get("step_type") == StepType.FORK_STEP.value:
                branches = step_def.get("branches", [])
                for branch in branches:
                    if branch.get("branch_id") == rejected_step.branch_id:
                        fork_step_def = step_def
                        break
        
        if not fork_step_def:
            # Can't determine policy, default to fail all
            self._reject_ticket(ticket, actor, correlation_id, "Branch step rejected")
            return
        
        failure_policy = fork_step_def.get(
            "failure_policy", 
            BranchFailurePolicy.FAIL_ALL.value
        )
        
        if failure_policy == BranchFailurePolicy.CONTINUE_OTHERS.value:
            # Just mark this branch as failed, don't fail ticket
            self._mark_branch_failed(ticket, rejected_step, actor, correlation_id)
            
            # Check if JOIN can proceed after branch rejection (for ANY/MAJORITY mode)
            parent_fork_step_id = getattr(rejected_step, 'parent_fork_step_id', None)
            if parent_fork_step_id:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                for join_step in all_steps:
                    if join_step.step_type == StepType.JOIN_STEP:
                        join_step_def = self._find_step_definition(join_step.step_id, workflow_version)
                        if join_step_def and join_step_def.get("source_fork_step_id") == parent_fork_step_id:
                            if self._check_join_completion(ticket, join_step, join_step_def, workflow_version):
                                # Only transition if join step is NOT_STARTED or ACTIVE
                                if join_step.state == StepState.NOT_STARTED:
                                    self._activate_step(ticket, join_step, workflow_version, actor, correlation_id)
                                elif join_step.state == StepState.ACTIVE:
                                    self._transition_after_join(ticket, join_step, workflow_version, actor, correlation_id)
                            break
            
            # After rejecting branch, check if there's a pending NOTIFY to activate
            # (JOIN may have already proceeded with ANY/MAJORITY mode)
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            if ticket.pending_end_step_id:
                self._try_activate_pending_notify(ticket, workflow_version, actor, correlation_id)
        else:
            # FAIL_ALL or CANCEL_OTHERS - reject the ticket
            self._reject_ticket(ticket, actor, correlation_id, "Branch step rejected")
    
    def _reject_ticket(
        self,
        ticket: Ticket,
        actor: ActorContext,
        correlation_id: str,
        reason: str = "Ticket rejected"
    ) -> None:
        """Mark ticket as rejected and cancel all remaining active steps"""
        now = utc_now()
        
        # Cancel all remaining non-terminal steps (orphan tasks/approvals in branches)
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        cancellable_states = {StepState.NOT_STARTED, StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL}
        
        for remaining_step in all_steps:
            if remaining_step.state in cancellable_states:
                new_state = StepState.CANCELLED
                try:
                    self.ticket_repo.update_step(
                        remaining_step.ticket_step_id,
                        {
                            "state": new_state.value,
                            "outcome": "CANCELLED",
                            "completed_at": now
                        },
                        expected_version=remaining_step.version
                    )
                    logger.info(
                        f"Cancelled remaining step {remaining_step.step_id} (was {remaining_step.state.value})",
                        extra={"ticket_id": ticket.ticket_id, "step_id": remaining_step.step_id}
                    )
                except Exception as e:
                    logger.warning(f"Could not cancel step {remaining_step.step_id}: {e}")
        
        self.ticket_repo.update_ticket(
            ticket.ticket_id,
            {
                "status": TicketStatus.REJECTED.value,
                "completed_at": now
            },
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_ticket_rejected(
            ticket_id=ticket.ticket_id,
            actor=actor,
            reason=reason,
            correlation_id=correlation_id
        )
        
        # Notify requester
        self.notification_service.enqueue_ticket_rejected(
            ticket_id=ticket.ticket_id,
            requester_email=ticket.requester.email,
            ticket_title=ticket.title,
            reason=reason
        )
    
    # =========================================================================
    # Action Handlers
    # =========================================================================
    
    def handle_submit_form(
        self,
        ticket_id: str,
        ticket_step_id: str,
        form_values: Dict[str, Any],
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle form submission"""
        logger.info(
            f"Submitting form for step {ticket_step_id}",
            extra={"ticket_id": ticket_id, "correlation_id": correlation_id}
        )
        
        # Refresh step to get latest version
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Permission check
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "submit_form"):
            logger.warning(
                f"Permission denied for form submission: "
                f"actor={actor.email} (aad_id={actor.aad_id}), "
                f"requester={ticket.requester.email} (aad_id={ticket.requester.aad_id}), "
                f"step_state={step.state}, step_id={step.step_id}"
            )
            raise PermissionDeniedError(
                f"You cannot submit this form. Step state: {step.state.value}, "
                f"User: {actor.email}, Requester: {ticket.requester.email}"
            )
        
        # State check
        if step.state != StepState.ACTIVE:
            raise InvalidStateError(f"Step is not active (state: {step.state})")
        
        # Validate form values against field definitions
        field_definitions = step.data.get("fields", []) if step.data else []
        sections = step.data.get("sections", []) if step.data else []
        if field_definitions:
            validation_errors = self._validate_form_values(form_values, field_definitions, sections)
            if validation_errors:
                raise ValidationError(
                    message=validation_errors[0],  # Return first error
                    details={"validation_errors": validation_errors}
                )
        
        now = utc_now()
        
        # Update step with retry for concurrency
        max_retries = 3
        for attempt in range(max_retries):
            try:
                step = self.ticket_repo.get_step_or_raise(ticket_step_id)
                self.ticket_repo.update_step(
                    ticket_step_id,
                    {
                        "state": StepState.COMPLETED.value,
                        "completed_at": now,
                        "data.form_values": form_values
                    },
                    expected_version=step.version
                )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to update step after {max_retries} attempts")
                    raise
                logger.warning(f"Concurrency conflict on step update, retrying (attempt {attempt + 1})")
        
        # Collect all attachment IDs from form values (FILE type fields store them as arrays)
        all_attachment_ids = list(attachment_ids) if attachment_ids else []
        for key, value in form_values.items():
            if isinstance(value, list):
                # Check if it's a list of attachment IDs
                for v in value:
                    if isinstance(v, str) and v.startswith("ATT-") and v not in all_attachment_ids:
                        all_attachment_ids.append(v)
            elif isinstance(value, str) and value.startswith("ATT-") and value not in all_attachment_ids:
                all_attachment_ids.append(value)
        
        # Update ticket form values and attachment_ids with retry for concurrency
        for attempt in range(max_retries):
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
                # Merge new attachment IDs with existing ones
                updated_attachment_ids = list(ticket.attachment_ids or [])
                for att_id in all_attachment_ids:
                    if att_id not in updated_attachment_ids:
                        updated_attachment_ids.append(att_id)
                
                self.ticket_repo.update_ticket(
                    ticket_id,
                    {
                        "form_values": {**ticket.form_values, **form_values},
                        "attachment_ids": updated_attachment_ids
                    },
                    expected_version=ticket.version
                )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to update ticket after {max_retries} attempts")
                    raise
                logger.warning(f"Concurrency conflict on ticket update, retrying (attempt {attempt + 1})")
        
        # Link any new attachments to this ticket (move from temp to ticket folder)
        if all_attachment_ids:
            self._link_attachments_to_ticket(ticket_id, all_attachment_ids)
        
        # Audit
        self.audit_writer.write_submit_form(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            form_values=form_values,
            correlation_id=correlation_id
        )
        
        # Transition to next step - use correct workflow version for sub-workflow steps
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        if step.from_sub_workflow_id:
            workflow_version = self._get_sub_workflow_version_for_step(step)
            if not workflow_version:
                workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        else:
            workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        self._transition_to_next(ticket, step, TransitionEvent.SUBMIT_FORM, workflow_version, actor, correlation_id)
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_approve(
        self,
        ticket_id: str,
        ticket_step_id: str,
        comment: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle approval - supports both single and parallel approvals"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "approve"):
            raise PermissionDeniedError("You cannot approve this step")
        
        # Cancel any open info request if approving while waiting for info
        open_info_request = self.ticket_repo.get_open_info_request_for_step(ticket_step_id)
        if open_info_request:
            self.ticket_repo.update_info_request(
                open_info_request.info_request_id,
                {"status": InfoRequestStatus.CANCELLED.value}
            )
            logger.info(
                f"Cancelled info request {open_info_request.info_request_id} due to approval",
                extra={"ticket_id": ticket_id, "step_id": ticket_step_id, "correlation_id": correlation_id}
            )
        
        # Helper to match approver by aad_id or email
        def is_actor_approver(task_approver):
            if actor.aad_id and task_approver.aad_id and actor.aad_id == task_approver.aad_id:
                return True
            return task_approver.email.lower() == actor.email.lower()
        
        # Idempotency check
        approval_tasks = self.ticket_repo.get_approval_tasks_for_step(ticket_step_id)
        for task in approval_tasks:
            if is_actor_approver(task.approver):
                if task.decision == ApprovalDecision.APPROVED:
                    # Already approved - idempotent success
                    return self._build_action_response(ticket_id, actor)
                elif task.decision != ApprovalDecision.PENDING:
                    raise InvalidStateError("Approval already decided with different outcome")
        
        now = utc_now()
        
        # Update approval task for this approver
        for task in approval_tasks:
            if is_actor_approver(task.approver):
                self.ticket_repo.update_approval_task(
                    task.approval_task_id,
                    {
                        "decision": ApprovalDecision.APPROVED.value,
                        "comment": comment,
                        "decided_at": now
                    }
                )
        
        # Check for parallel approval logic
        # Get step raw document to check for parallel settings
        step_raw = self.ticket_repo.get_step_raw(ticket_step_id)
        parallel_rule = step_raw.get("parallel_approval_rule") if step_raw else None
        pending_approvers = step_raw.get("parallel_pending_approvers", []) if step_raw else []
        completed_approvers = step_raw.get("parallel_completed_approvers", []) if step_raw else []
        parallel_approvers_info = step_raw.get("parallel_approvers_info", []) if step_raw else []
        
        should_complete_step = False
        
        if parallel_rule and pending_approvers:
            # Parallel approval mode
            actor_email_lower = actor.email.lower()
            
            # Find the matching approver (by email or AAD ID)
            # This handles UPN vs mail attribute mismatches
            matched_email = None
            for approver_email in pending_approvers:
                if approver_email.lower() == actor_email_lower:
                    matched_email = approver_email
                    break
            
            # If not matched by email, try AAD ID in parallel_approvers_info
            if not matched_email and actor.aad_id:
                for info in parallel_approvers_info:
                    if info.get('aad_id') == actor.aad_id:
                        matched_email = info.get('email')
                        logger.info(
                            f"Matched approver by AAD ID from parallel_approvers_info: actor={actor.email}, matched={matched_email}",
                            extra={"aad_id": actor.aad_id}
                        )
                        break
            
            # If still not matched, check approval_tasks as fallback
            # (for tickets created before parallel_approvers_info was stored)
            if not matched_email and actor.aad_id:
                approval_tasks = self.ticket_repo.get_approval_tasks_for_step(ticket_step_id)
                for task in approval_tasks:
                    if task.approver and task.approver.aad_id == actor.aad_id:
                        if task.approver.email.lower() in [e.lower() for e in pending_approvers]:
                            matched_email = task.approver.email
                            logger.info(
                                f"Matched approver by AAD ID from approval_tasks: actor={actor.email}, matched={matched_email}",
                                extra={"aad_id": actor.aad_id}
                            )
                            break
            
            # Update tracking lists - remove the matched email (not actor.email)
            email_to_remove = matched_email or actor.email
            new_pending = [e for e in pending_approvers if e.lower() != email_to_remove.lower()]
            new_completed = completed_approvers + [email_to_remove]
            
            if parallel_rule == "ANY":
                # ANY mode: One approval is enough
                should_complete_step = True
            elif parallel_rule == "ALL":
                # ALL mode: All must approve
                should_complete_step = len(new_pending) == 0
            
            # Update step with tracking info
            step_updates = {
                "parallel_pending_approvers": new_pending,
                "parallel_completed_approvers": new_completed
            }
            
            if should_complete_step:
                step_updates["state"] = StepState.COMPLETED.value
                step_updates["outcome"] = "APPROVED"
                step_updates["completed_at"] = now
            
            self.ticket_repo.update_step(
                ticket_step_id,
                step_updates,
                expected_version=step.version
            )
        else:
            # Single approver mode - complete immediately
            should_complete_step = True
            self.ticket_repo.update_step(
                ticket_step_id,
                {
                    "state": StepState.COMPLETED.value,
                    "outcome": "APPROVED",
                    "completed_at": now
                },
                expected_version=step.version
            )
        
        # Audit
        self.audit_writer.write_approve(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            comment=comment,
            correlation_id=correlation_id
        )
        
        # Notify requester only when step is completed
        if should_complete_step:
            self.notification_service.enqueue_approved(
                ticket_id=ticket_id,
                requester_email=ticket.requester.email,
                ticket_title=ticket.title,
                approver_name=actor.display_name,
                workflow_name=ticket.workflow_name,
                workflow_id=ticket.workflow_id
            )
            
            # Transition to next step
            # For sub-workflow steps, use the sub-workflow's version for correct transition resolution
            if step.from_sub_workflow_id:
                workflow_version = self._get_sub_workflow_version_for_step(step)
                if not workflow_version:
                    # Fallback to parent workflow version
                    workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
            else:
                workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
            self._transition_to_next(ticket, step, TransitionEvent.APPROVE, workflow_version, actor, correlation_id)
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_reject(
        self,
        ticket_id: str,
        ticket_step_id: str,
        comment: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle rejection"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "reject"):
            raise PermissionDeniedError("You cannot reject this step")
        
        now = utc_now()
        
        # Cancel any open info request if rejecting while waiting for info
        open_info_request = self.ticket_repo.get_open_info_request_for_step(ticket_step_id)
        if open_info_request:
            self.ticket_repo.update_info_request(
                open_info_request.info_request_id,
                {"status": InfoRequestStatus.CANCELLED.value}
            )
            logger.info(
                f"Cancelled info request {open_info_request.info_request_id} due to rejection",
                extra={"ticket_id": ticket_id, "step_id": ticket_step_id, "correlation_id": correlation_id}
            )
        
        # Update approval task - match by aad_id or email
        approval_tasks = self.ticket_repo.get_approval_tasks_for_step(ticket_step_id)
        for task in approval_tasks:
            is_match = False
            # Primary: match by aad_id
            if actor.aad_id and task.approver.aad_id and actor.aad_id == task.approver.aad_id:
                is_match = True
            # Fallback: match by email (case-insensitive)
            elif task.approver.email.lower() == actor.email.lower():
                is_match = True
                
            if is_match:
                self.ticket_repo.update_approval_task(
                    task.approval_task_id,
                    {
                        "decision": ApprovalDecision.REJECTED.value,
                        "comment": comment,
                        "decided_at": now
                    }
                )
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": StepState.REJECTED.value,
                "outcome": "REJECTED",
                "completed_at": now
            },
            expected_version=step.version
        )
        
        # Check if this step is part of a branch
        branch_id = getattr(step, 'branch_id', None)
        branch_name = getattr(step, 'branch_name', None)
        parent_fork_step_id = getattr(step, 'parent_fork_step_id', None)
        
        if branch_id and parent_fork_step_id:
            # This is a branch step - check fork failure policy
            # CRITICAL: For sub-workflow steps, use the sub-workflow version to find the fork definition
            if step.from_sub_workflow_id:
                workflow_version = self._get_sub_workflow_version_for_step(step)
                if not workflow_version:
                    workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
            else:
                workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
            fork_step_def = self._find_step_definition(parent_fork_step_id, workflow_version)
            
            if fork_step_def:
                failure_policy = fork_step_def.get("failure_policy", BranchFailurePolicy.FAIL_ALL.value)
                
                logger.info(
                    f"handle_reject: Branch step rejected. policy={failure_policy}, branch={branch_id}",
                    extra={"ticket_id": ticket_id, "step_id": step.step_id, "failure_policy": failure_policy}
                )
                
                if failure_policy == BranchFailurePolicy.CONTINUE_OTHERS.value:
                    # Only mark this branch as failed, don't reject the entire ticket
                    self._mark_branch_failed(ticket, step, actor, correlation_id)
                    
                    # Cancel any subsequent steps in this rejected branch
                    all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
                    
                    # First, find steps by branch_id
                    branch_steps = [s for s in all_steps if getattr(s, 'branch_id', None) == branch_id]
                    
                    # Also find steps that SHOULD be in this branch by tracing from the branch start_step_id
                    # This handles cases where steps weren't assigned branch_id during creation
                    fork_step_def = self._find_step_definition(parent_fork_step_id, workflow_version)
                    if fork_step_def:
                        branches = fork_step_def.get("branches", [])
                        branch_def = next((b for b in branches if b.get("branch_id") == branch_id), None)
                        if branch_def:
                            # Get branch_name from branch_def if not already set
                            if not branch_name:
                                branch_name = branch_def.get("branch_name", "")
                            start_step_id = branch_def.get("start_step_id")
                            if start_step_id:
                                # Trace all steps that should be in this branch using a queue
                                branch_step_ids = set()
                                queue = [start_step_id]
                                visited = set()
                                transitions = workflow_version.definition.transitions
                                
                                while queue:
                                    current_step_id = queue.pop(0)
                                    if current_step_id in visited:
                                        continue
                                    visited.add(current_step_id)
                                    branch_step_ids.add(current_step_id)
                                    
                                    # Find all next steps
                                    for t in transitions:
                                        from_id = t.from_step_id if hasattr(t, 'from_step_id') else (t.get("from_step_id") if isinstance(t, dict) else None)
                                        if from_id == current_step_id:
                                            to_id = t.to_step_id if hasattr(t, 'to_step_id') else (t.get("to_step_id") if isinstance(t, dict) else None)
                                            if to_id and to_id not in visited:
                                                # Check if next step is a JOIN step - if so, skip
                                                next_step_def = next((s for s in workflow_version.definition.steps if s.get("step_id") == to_id), None)
                                                if next_step_def and next_step_def.get("step_type") == StepType.JOIN_STEP.value:
                                                    continue
                                                queue.append(to_id)
                                
                                # Find steps by step_id that should be in this branch
                                for step in all_steps:
                                    if step.step_id in branch_step_ids and step.step_id not in [s.step_id for s in branch_steps]:
                                        branch_steps.append(step)
                                        # Also update the step to have the correct branch_id
                                        if not getattr(step, 'branch_id', None):
                                            self.ticket_repo.update_step(
                                                step.ticket_step_id,
                                                {
                                                    "branch_id": branch_id,
                                                    "branch_name": branch_name,
                                                    "parent_fork_step_id": parent_fork_step_id
                                                },
                                                expected_version=step.version
                                            )
                    
                    # Cancel all non-terminal steps in the rejected branch
                    cancellable_states = {StepState.NOT_STARTED, StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL}
                    for branch_step in branch_steps:
                        if branch_step.state in cancellable_states:
                            try:
                                # Re-fetch step to get latest version
                                step_latest = self.ticket_repo.get_step(branch_step.ticket_step_id)
                                if step_latest and step_latest.state in cancellable_states:
                                    self.ticket_repo.update_step(
                                        branch_step.ticket_step_id,
                                        {
                                            "state": StepState.CANCELLED.value,
                                            "outcome": "CANCELLED",
                                            "completed_at": now,
                                            # Ensure branch_id is set even if it wasn't before
                                            "branch_id": branch_id,
                                            "branch_name": branch_name,
                                            "parent_fork_step_id": parent_fork_step_id
                                        },
                                        expected_version=step_latest.version
                                    )
                                    logger.info(
                                        f"Cancelled step {branch_step.step_id} in rejected branch {branch_id}",
                                        extra={"ticket_id": ticket_id, "step_id": branch_step.step_id, "branch_id": branch_id}
                                    )
                            except Exception as e:
                                logger.warning(f"Could not cancel step {branch_step.step_id}: {e}")
                    
                    # Check if join can proceed (other branches may have completed)
                    # CRITICAL: Refresh ticket to get updated active_branches after _mark_branch_failed
                    ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
                    join_steps = [s for s in all_steps if s.step_type == StepType.JOIN_STEP]
                    
                    for join_step in join_steps:
                        join_step_def = self._find_step_definition(join_step.step_id, workflow_version)
                        if join_step_def and join_step_def.get("source_fork_step_id") == parent_fork_step_id:
                            # Check if join can proceed
                            if self._check_join_completion(ticket, join_step, join_step_def, workflow_version):
                                # Only transition if join step is NOT_STARTED or ACTIVE (not if already COMPLETED)
                                if join_step.state == StepState.NOT_STARTED:
                                    self._activate_step(ticket, join_step, workflow_version, actor, correlation_id)
                                elif join_step.state == StepState.ACTIVE:
                                    self._transition_after_join(ticket, join_step, workflow_version, actor, correlation_id)
                                # If COMPLETED, already transitioned - nothing to do
                            break
                    
                    # After rejecting branch, check if there's a pending NOTIFY to activate
                    # (JOIN may have already proceeded with ANY/MAJORITY mode)
                    ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
                    if ticket.pending_end_step_id:
                        self._try_activate_pending_notify(ticket, workflow_version, actor, correlation_id)
                    
                    # Audit branch rejection (not ticket rejection)
                    self.audit_writer.write_event(
                        ticket_id=ticket_id,
                        ticket_step_id=ticket_step_id,
                        event_type=AuditEventType.BRANCH_FAILED,
                        actor=actor,
                        details={
                            "branch_id": branch_id,
                            "branch_name": getattr(step, 'branch_name', ''),
                            "comment": comment
                        },
                        correlation_id=correlation_id
                    )
                    
                    # Don't reject the ticket or notify as rejected - other branches continue
                    return self._build_action_response(ticket_id, actor)
                
                elif failure_policy == BranchFailurePolicy.CANCEL_OTHERS.value:
                    # CANCEL_OTHERS: Cancel all in-progress steps in OTHER branches, then reject ticket
                    logger.info(
                        f"handle_reject: CANCEL_OTHERS policy - cancelling other branches before rejecting ticket",
                        extra={"ticket_id": ticket_id, "failed_branch": branch_id}
                    )
                    
                    # First, mark the failed branch
                    self._mark_branch_failed(ticket, step, actor, correlation_id)
                    
                    # Cancel all steps in other branches
                    cancelled_count = self._cancel_other_branches(
                        ticket=ticket,
                        failed_step=step,
                        failed_branch_id=branch_id,
                        workflow_version=workflow_version,
                        actor=actor,
                        correlation_id=correlation_id,
                        reason=f"Cancelled due to rejection in branch '{branch_name or branch_id}'"
                    )
                    
                    logger.info(
                        f"handle_reject: CANCEL_OTHERS - Cancelled {cancelled_count} steps in other branches",
                        extra={"ticket_id": ticket_id, "cancelled_count": cancelled_count}
                    )
                    
                    # Cancel any remaining NOT_STARTED steps in the failed branch too
                    all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
                    for branch_step in all_steps:
                        if getattr(branch_step, 'branch_id', None) == branch_id and branch_step.state == StepState.NOT_STARTED:
                            try:
                                self.ticket_repo.update_step(
                                    branch_step.ticket_step_id,
                                    {
                                        "state": StepState.CANCELLED.value,
                                        "outcome": "CANCELLED",
                                        "completed_at": now
                                    },
                                    expected_version=branch_step.version
                                )
                            except Exception as e:
                                logger.warning(f"Could not cancel step {branch_step.step_id}: {e}")
                    
                    # Now reject the ticket (fall through to rejection code below)
                    # Refresh ticket for latest version
                    ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
                
                # FAIL_ALL policy (default) - just proceed to reject the ticket
                # (no special handling needed, falls through to rejection below)
        
        # Not a branch step, FAIL_ALL policy, or CANCEL_OTHERS (after cancelling) - reject entire ticket
        logger.info(
            f"handle_reject: Rejecting entire ticket",
            extra={"ticket_id": ticket_id, "step_id": ticket_step_id}
        )
        
        # Refresh ticket to get latest version
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Cancel all remaining non-terminal steps (orphan tasks/approvals in branches)
        # This includes:
        # - NOT_STARTED steps → CANCELLED
        # - ACTIVE steps → CANCELLED (orphan tasks in branches)
        # - WAITING_FOR_APPROVAL steps → CANCELLED (orphan approvals in branches)
        # But NOTIFY steps should be TRIGGERED, not cancelled
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        cancellable_states = {StepState.NOT_STARTED, StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL}
        notify_steps_to_trigger = []  # Collect ALL notify steps to trigger
        
        for remaining_step in all_steps:
            if remaining_step.state in cancellable_states:
                # Check if this is a NOTIFY step - we'll trigger it instead of cancelling
                if remaining_step.step_type == StepType.NOTIFY_STEP:
                    notify_steps_to_trigger.append(remaining_step)
                    continue  # Don't cancel NOTIFY, we'll trigger it
                
                try:
                    # Re-fetch step to get latest version
                    step_latest = self.ticket_repo.get_step(remaining_step.ticket_step_id)
                    if step_latest and step_latest.state in cancellable_states:
                        self.ticket_repo.update_step(
                            remaining_step.ticket_step_id,
                            {
                                "state": StepState.CANCELLED.value,
                                "outcome": "CANCELLED",
                                "completed_at": now
                            },
                            expected_version=step_latest.version
                        )
                        # Also cancel any pending approval tasks for this step
                        self._cancel_approval_tasks_for_step(remaining_step.ticket_step_id)
                        logger.info(
                            f"Cancelled orphan step {remaining_step.step_id} (was {remaining_step.state.value})",
                            extra={"ticket_id": ticket_id, "step_id": remaining_step.step_id}
                        )
                except Exception as e:
                    logger.debug(f"Could not cancel step {remaining_step.step_id}: {e}")
        
        # Trigger ALL NOTIFY steps (to send rejection notification and show as triggered in UI)
        # This handles both sub-workflow and parent NOTIFY steps
        parent_workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        for notify_step in notify_steps_to_trigger:
            try:
                # Re-fetch to get latest version
                notify_latest = self.ticket_repo.get_step(notify_step.ticket_step_id)
                if notify_latest and notify_latest.state in cancellable_states:
                    # Determine correct workflow version based on whether this is a sub-workflow step
                    if notify_latest.from_sub_workflow_id:
                        step_workflow_version = self._get_sub_workflow_version_for_step(notify_latest)
                        if not step_workflow_version:
                            step_workflow_version = parent_workflow_version
                    else:
                        step_workflow_version = parent_workflow_version
                    
                    # Activate the notify step first
                    self.ticket_repo.update_step(
                        notify_latest.ticket_step_id,
                        {
                            "state": StepState.ACTIVE.value,
                            "started_at": now
                        },
                        expected_version=notify_latest.version
                    )
                    # Now complete the notify step - this will send the notification
                    notify_step_latest = self.ticket_repo.get_step_or_raise(notify_latest.ticket_step_id)
                    self._complete_notify_step(
                        ticket=ticket,
                        step=notify_step_latest,
                        workflow_version=step_workflow_version,
                        actor=actor,
                        correlation_id=correlation_id,
                        outcome="REJECTED"
                    )
                    logger.info(
                        f"Triggered NOTIFY step {notify_step.step_id} for rejection",
                        extra={"ticket_id": ticket_id, "step_id": notify_step.step_id}
                    )
            except Exception as e:
                logger.warning(f"Could not trigger notify step {notify_step.step_id}: {e}")
        
        # Refresh ticket for latest version
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Update ticket status
        self.ticket_repo.update_ticket(
            ticket_id,
            {
                "status": TicketStatus.REJECTED.value,
                "completed_at": now
            },
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_reject(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            comment=comment,
            correlation_id=correlation_id
        )
        
        # Notify via notification service as backup (in case NOTIFY step failed)
        self.notification_service.enqueue_rejected(
            ticket_id=ticket_id,
            requester_email=ticket.requester.email,
            ticket_title=ticket.title,
            approver_name=actor.display_name,
            reason=comment,
            workflow_name=ticket.workflow_name,
            workflow_id=ticket.workflow_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_skip(
        self,
        ticket_id: str,
        ticket_step_id: str,
        comment: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """
        Handle skip action - similar to reject but with SKIPPED status.
        
        Skip behavior:
        - For branch steps with CONTINUE_OTHERS policy: only the branch is skipped
        - For all other cases: entire workflow is skipped
        """
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - same as reject
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "reject"):
            raise PermissionDeniedError("You cannot skip this step")
        
        now = utc_now()
        
        # Update approval task with SKIPPED decision
        approval_tasks = self.ticket_repo.get_approval_tasks_for_step(ticket_step_id)
        for task in approval_tasks:
            is_match = False
            # Primary: match by aad_id
            if actor.aad_id and task.approver.aad_id and actor.aad_id == task.approver.aad_id:
                is_match = True
            # Fallback: match by email (case-insensitive)
            elif task.approver.email.lower() == actor.email.lower():
                is_match = True
                
            if is_match:
                self.ticket_repo.update_approval_task(
                    task.approval_task_id,
                    {
                        "decision": ApprovalDecision.SKIPPED.value,
                        "comment": comment,
                        "decided_at": now
                    }
                )
        
        # Update step state to SKIPPED
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": StepState.SKIPPED.value,
                "outcome": "SKIPPED",
                "completed_at": now
            },
            expected_version=step.version
        )
        
        # Check if this step is part of a branch
        branch_id = getattr(step, 'branch_id', None)
        branch_name = getattr(step, 'branch_name', None)
        parent_fork_step_id = getattr(step, 'parent_fork_step_id', None)
        
        if branch_id and parent_fork_step_id:
            # This is a branch step - check fork failure policy
            # CRITICAL: For sub-workflow steps, use the sub-workflow version to find the fork definition
            if step.from_sub_workflow_id:
                workflow_version = self._get_sub_workflow_version_for_step(step)
                if not workflow_version:
                    workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
            else:
                workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
            fork_step_def = self._find_step_definition(parent_fork_step_id, workflow_version)
            
            if fork_step_def:
                failure_policy = fork_step_def.get("failure_policy", BranchFailurePolicy.FAIL_ALL.value)
                
                logger.info(
                    f"handle_skip: Branch step skipped. policy={failure_policy}, branch={branch_id}",
                    extra={"ticket_id": ticket_id, "step_id": step.step_id, "failure_policy": failure_policy}
                )
                
                if failure_policy == BranchFailurePolicy.CONTINUE_OTHERS.value:
                    # Only mark this branch as skipped, don't skip the entire ticket
                    # Pass workflow_version so JOIN evaluation can happen
                    self._mark_branch_skipped(ticket, step, actor, correlation_id, workflow_version)
                    
                    # Cancel any subsequent steps in this skipped branch
                    all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
                    
                    # Find steps by branch_id
                    branch_steps = [s for s in all_steps if getattr(s, 'branch_id', None) == branch_id]
                    
                    # Also find steps that SHOULD be in this branch by tracing
                    fork_step_def = self._find_step_definition(parent_fork_step_id, workflow_version)
                    if fork_step_def:
                        branches = fork_step_def.get("branches", [])
                        branch_def = next((b for b in branches if b.get("branch_id") == branch_id), None)
                        if branch_def:
                            if not branch_name:
                                branch_name = branch_def.get("branch_name", "")
                            start_step_id = branch_def.get("start_step_id")
                            if start_step_id:
                                # Trace all steps in this branch
                                branch_step_ids = set()
                                queue = [start_step_id]
                                visited = set()
                                transitions = workflow_version.definition.transitions
                                
                                while queue:
                                    current_step_id = queue.pop(0)
                                    if current_step_id in visited:
                                        continue
                                    visited.add(current_step_id)
                                    branch_step_ids.add(current_step_id)
                                    
                                    for t in transitions:
                                        from_id = t.from_step_id if hasattr(t, 'from_step_id') else (t.get("from_step_id") if isinstance(t, dict) else None)
                                        if from_id == current_step_id:
                                            to_id = t.to_step_id if hasattr(t, 'to_step_id') else (t.get("to_step_id") if isinstance(t, dict) else None)
                                            if to_id and to_id not in visited:
                                                next_step_def = next((s for s in workflow_version.definition.steps if s.get("step_id") == to_id), None)
                                                if next_step_def and next_step_def.get("step_type") == StepType.JOIN_STEP.value:
                                                    continue
                                                queue.append(to_id)
                                
                                for step in all_steps:
                                    if step.step_id in branch_step_ids and step.step_id not in [s.step_id for s in branch_steps]:
                                        branch_steps.append(step)
                    
                    # Cancel all non-terminal steps in the skipped branch
                    cancellable_states = {StepState.NOT_STARTED, StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL}
                    for branch_step in branch_steps:
                        if branch_step.state in cancellable_states:
                            try:
                                # Re-fetch step to get latest version
                                step_latest = self.ticket_repo.get_step(branch_step.ticket_step_id)
                                if step_latest and step_latest.state in cancellable_states:
                                    self.ticket_repo.update_step(
                                        branch_step.ticket_step_id,
                                        {
                                            "state": StepState.CANCELLED.value,
                                            "outcome": "CANCELLED",
                                            "completed_at": now,
                                            "branch_id": branch_id,
                                            "branch_name": branch_name,
                                            "parent_fork_step_id": parent_fork_step_id
                                        },
                                        expected_version=step_latest.version
                                    )
                                    logger.info(
                                        f"Cancelled step {branch_step.step_id} in skipped branch {branch_id}",
                                        extra={"ticket_id": ticket_id, "step_id": branch_step.step_id, "branch_id": branch_id}
                                    )
                            except Exception as e:
                                logger.warning(f"Could not cancel step {branch_step.step_id}: {e}")
                    
                    # Note: JOIN evaluation and pending NOTIFY activation are now handled
                    # inside _mark_branch_skipped (called above) to avoid duplicate transitions
                    
                    # Audit branch skip
                    self.audit_writer.write_event(
                        ticket_id=ticket_id,
                        ticket_step_id=ticket_step_id,
                        event_type=AuditEventType.STEP_SKIPPED,
                        actor=actor,
                        details={
                            "branch_id": branch_id,
                            "branch_name": getattr(step, 'branch_name', ''),
                            "comment": comment
                        },
                        correlation_id=correlation_id
                    )
                    
                    return self._build_action_response(ticket_id, actor)
                
                elif failure_policy == BranchFailurePolicy.CANCEL_OTHERS.value:
                    # CANCEL_OTHERS: Cancel all in-progress steps in OTHER branches, then skip ticket
                    logger.info(
                        f"handle_skip: CANCEL_OTHERS policy - cancelling other branches before skipping ticket",
                        extra={"ticket_id": ticket_id, "skipped_branch": branch_id}
                    )
                    
                    # First, mark the skipped branch
                    self._mark_branch_skipped(ticket, step, actor, correlation_id, workflow_version)
                    
                    # Cancel all steps in other branches
                    cancelled_count = self._cancel_other_branches(
                        ticket=ticket,
                        failed_step=step,
                        failed_branch_id=branch_id,
                        workflow_version=workflow_version,
                        actor=actor,
                        correlation_id=correlation_id,
                        reason=f"Cancelled due to skip in branch '{branch_name or branch_id}'"
                    )
                    
                    logger.info(
                        f"handle_skip: CANCEL_OTHERS - Cancelled {cancelled_count} steps in other branches",
                        extra={"ticket_id": ticket_id, "cancelled_count": cancelled_count}
                    )
                    
                    # Cancel any remaining NOT_STARTED steps in the skipped branch too
                    all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
                    for branch_step in all_steps:
                        if getattr(branch_step, 'branch_id', None) == branch_id and branch_step.state == StepState.NOT_STARTED:
                            try:
                                self.ticket_repo.update_step(
                                    branch_step.ticket_step_id,
                                    {
                                        "state": StepState.SKIPPED.value,
                                        "outcome": "SKIPPED",
                                        "completed_at": now
                                    },
                                    expected_version=branch_step.version
                                )
                            except Exception as e:
                                logger.warning(f"Could not skip step {branch_step.step_id}: {e}")
                    
                    # Now skip the ticket (fall through to skip code below)
                    # Refresh ticket for latest version
                    ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
                
                # FAIL_ALL policy (default) - just proceed to skip the ticket
                # (no special handling needed, falls through to skip below)
        
        # Not a branch step, FAIL_ALL policy, or CANCEL_OTHERS (after cancelling) - skip entire ticket
        logger.info(
            f"handle_skip: Skipping entire ticket",
            extra={"ticket_id": ticket_id, "step_id": ticket_step_id}
        )
        
        # Refresh ticket to get latest version
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Mark all remaining non-terminal steps as CANCELLED
        # ALL orphan steps (NOT_STARTED, ACTIVE, WAITING_FOR_APPROVAL) should be CANCELLED
        # for consistency - they're orphans, not deliberately skipped
        # But NOTIFY steps should be TRIGGERED, not cancelled
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        cancellable_states = {StepState.NOT_STARTED, StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL}
        notify_steps_to_trigger = []  # Collect ALL notify steps to trigger
        
        for remaining_step in all_steps:
            if remaining_step.state in cancellable_states:
                # Check if this is a NOTIFY step - we'll trigger it instead of cancelling
                if remaining_step.step_type == StepType.NOTIFY_STEP:
                    notify_steps_to_trigger.append(remaining_step)
                    continue  # Don't cancel NOTIFY, we'll trigger it
                
                try:
                    # Re-fetch step to get latest version
                    step_latest = self.ticket_repo.get_step(remaining_step.ticket_step_id)
                    if step_latest and step_latest.state in cancellable_states:
                        self.ticket_repo.update_step(
                            remaining_step.ticket_step_id,
                            {
                                "state": StepState.CANCELLED.value,
                                "outcome": "CANCELLED",
                                "completed_at": now
                            },
                            expected_version=step_latest.version
                        )
                        # Also cancel any pending approval tasks for this step
                        self._cancel_approval_tasks_for_step(remaining_step.ticket_step_id)
                        logger.info(
                            f"Cancelled orphan step {remaining_step.step_id} (was {remaining_step.state.value})",
                            extra={"ticket_id": ticket_id, "step_id": remaining_step.step_id}
                        )
                except Exception as e:
                    logger.warning(f"Could not cancel step {remaining_step.step_id}: {e}")
        
        # Trigger ALL NOTIFY steps (to send skip notification and show as triggered in UI)
        # This handles both sub-workflow and parent NOTIFY steps
        parent_workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        for notify_step in notify_steps_to_trigger:
            try:
                # Re-fetch to get latest version
                notify_latest = self.ticket_repo.get_step(notify_step.ticket_step_id)
                if notify_latest and notify_latest.state in cancellable_states:
                    # Determine correct workflow version based on whether this is a sub-workflow step
                    if notify_latest.from_sub_workflow_id:
                        step_workflow_version = self._get_sub_workflow_version_for_step(notify_latest)
                        if not step_workflow_version:
                            step_workflow_version = parent_workflow_version
                    else:
                        step_workflow_version = parent_workflow_version
                    
                    # Activate the notify step first
                    self.ticket_repo.update_step(
                        notify_latest.ticket_step_id,
                        {
                            "state": StepState.ACTIVE.value,
                            "started_at": now
                        },
                        expected_version=notify_latest.version
                    )
                    # Now complete the notify step - this will send the notification
                    notify_step_latest = self.ticket_repo.get_step_or_raise(notify_latest.ticket_step_id)
                    self._complete_notify_step(
                        ticket=ticket,
                        step=notify_step_latest,
                        workflow_version=step_workflow_version,
                        actor=actor,
                        correlation_id=correlation_id,
                        outcome="SKIPPED"
                    )
                    logger.info(
                        f"Triggered NOTIFY step {notify_step.step_id} for skip",
                        extra={"ticket_id": ticket_id, "step_id": notify_step.step_id}
                    )
            except Exception as e:
                logger.warning(f"Could not trigger notify step {notify_step.step_id}: {e}")
        
        # Refresh ticket for latest version after step updates
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        self.ticket_repo.update_ticket(
            ticket_id,
            {
                "status": TicketStatus.SKIPPED.value,
                "completed_at": now
            },
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.SKIP,
            actor=actor,
            details={"comment": comment},
            correlation_id=correlation_id
        )
        
        # Notify requester
        self.notification_service.enqueue_skipped(
            ticket_id=ticket_id,
            requester_email=ticket.requester.email,
            ticket_title=ticket.title,
            approver_name=actor.display_name,
            reason=comment,
            workflow_name=ticket.workflow_name,
            workflow_id=ticket.workflow_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def _mark_branch_skipped(
        self,
        ticket: Ticket,
        step: TicketStep,
        actor: ActorContext,
        correlation_id: str,
        workflow_version: Optional[WorkflowVersion] = None
    ) -> None:
        """Mark a branch as skipped in the ticket's active_branches and check if JOIN can proceed"""
        branch_id = getattr(step, 'branch_id', None)
        branch_name = getattr(step, 'branch_name', None)
        parent_fork_step_id = getattr(step, 'parent_fork_step_id', None)
        
        if not branch_id:
            return
        
        now = utc_now()
        
        # Update branch state with retry for concurrency (consistent with _mark_branch_failed)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                active_branches = ticket.active_branches or []
                
                for i, branch in enumerate(active_branches):
                    if branch.branch_id == branch_id:
                        active_branches[i] = BranchState(
                            branch_id=branch.branch_id,
                            branch_name=branch.branch_name,
                            parent_fork_step_id=branch.parent_fork_step_id,
                            state=StepState.SKIPPED,
                            current_step_id=step.step_id,
                            started_at=branch.started_at,
                            completed_at=now,
                            outcome="SKIPPED"
                        )
                        break
                
                self.ticket_repo.update_ticket(
                    ticket.ticket_id,
                    {"active_branches": [b.model_dump(mode="json") for b in active_branches]},
                    expected_version=ticket.version
                )
                
                logger.info(
                    f"Marked branch {branch_id} as skipped",
                    extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id, "branch_name": branch_name}
                )
                break
                
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Retry {attempt + 1}/{max_retries} marking branch skipped due to: {e}",
                        extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id}
                    )
                else:
                    logger.error(
                        f"Failed to mark branch skipped after {max_retries} attempts: {e}",
                        extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id}
                    )
                    raise
        
        # Audit
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=step.ticket_step_id,
            event_type=AuditEventType.BRANCH_FAILED,
            actor=actor,
            details={
                "branch_id": branch_id,
                "branch_name": branch_name or "",
                "outcome": "SKIPPED"
            },
            correlation_id=correlation_id
        )
        
        # After marking branch as skipped, check if JOIN can proceed
        # This handles ANY/MAJORITY join modes where skipped branches count as terminal
        if workflow_version and parent_fork_step_id:
            all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
            for join_step in all_steps:
                if join_step.step_type == StepType.JOIN_STEP:
                    join_step_def = self._find_step_definition(join_step.step_id, workflow_version)
                    if join_step_def and join_step_def.get("source_fork_step_id") == parent_fork_step_id:
                        # Refresh ticket to get latest branch states
                        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                        
                        # Check if join can proceed
                        if self._check_join_completion(ticket, join_step, join_step_def, workflow_version):
                            logger.info(
                                f"Join step {join_step.step_id} can proceed after branch {branch_id} skipped",
                                extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id, "branch_id": branch_id}
                            )
                            
                            # If join step is NOT_STARTED, activate it first
                            if join_step.state == StepState.NOT_STARTED:
                                logger.info(
                                    f"Activating join step {join_step.step_id} as it can proceed",
                                    extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id}
                                )
                                self._activate_step(ticket, join_step, workflow_version, actor, correlation_id)
                            elif join_step.state == StepState.ACTIVE:
                                # Join step is active, proceed with transition
                                self._transition_after_join(ticket, join_step, workflow_version, actor, correlation_id)
                            # If COMPLETED, already transitioned - nothing to do
                        else:
                            logger.debug(
                                f"Join step {join_step.step_id} cannot proceed yet - waiting for more branches",
                                extra={"ticket_id": ticket.ticket_id, "join_step": join_step.step_id, "branch_id": branch_id}
                            )
                        break
        
        # Also check for pending NOTIFY to activate (for ANY/MAJORITY where JOIN already proceeded)
        if workflow_version:
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            if ticket.pending_end_step_id:
                self._try_activate_pending_notify(ticket, workflow_version, actor, correlation_id)
    
    def handle_reassign_approval(
        self,
        ticket_id: str,
        ticket_step_id: str,
        new_approver_email: str,
        new_approver_aad_id: Optional[str],
        new_approver_display_name: Optional[str],
        reason: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """
        Reassign approval to a new approver.
        
        - Only the current approver can reassign
        - New approver becomes owner of this approval step
        - Auto-onboards new approver if not in system (Reassign Agent)
        - Sends notification to new approver
        """
        from ..repositories.admin_repo import AdminRepository
        
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - only current approver can reassign
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "approve"):
            raise PermissionDeniedError("You cannot reassign this approval")
        
        # Validate step is an approval step and pending
        if step.step_type != StepType.APPROVAL_STEP:
            raise InvalidStateError("Can only reassign approval steps")
        
        if step.state != StepState.WAITING_FOR_APPROVAL:
            raise InvalidStateError("Approval is not pending")
        
        # Prevent reassigning to yourself
        if new_approver_email.lower() == actor.email.lower():
            raise InvalidStateError("Cannot reassign approval to yourself")
        
        now = utc_now()
        from ..domain.enums import OnboardSource
        admin_repo = AdminRepository()
        
        # Auto-onboard new approver if not in system
        display_name = new_approver_display_name or new_approver_email.split("@")[0].replace(".", " ").title()
        access, was_created, added_manager, added_agent = admin_repo.auto_onboard_user(
            email=new_approver_email,
            display_name=display_name,
            triggered_by_email=actor.email,
            triggered_by_display_name=actor.display_name,
            as_manager=True,  # Approval requires manager persona
            aad_id=new_approver_aad_id,
            onboard_source=OnboardSource.APPROVAL_REASSIGNMENT  # Explicit: This is a reassignment
        )
        
        # Log audit if user was created OR if manager persona was added to existing user
        if was_created or added_manager:
            admin_repo.log_admin_action(
                action=AdminAuditAction.AUTO_ONBOARD_MANAGER,
                actor_email=actor.email,
                actor_display_name=actor.display_name,
                target_email=new_approver_email,
                target_display_name=display_name,
                details={
                    "trigger": "approval_reassignment",
                    "ticket_id": ticket_id,
                    "ticket_step_id": ticket_step_id,
                    "was_new_user": was_created,
                    "added_manager_to_existing": added_manager and not was_created
                }
            )
        
        # Log admin audit for reassignment action
        admin_repo.log_admin_action(
            action=AdminAuditAction.REASSIGN_APPROVAL,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            target_email=new_approver_email,
            target_display_name=display_name,
            details={
                "ticket_id": ticket_id,
                "ticket_step_id": ticket_step_id,
                "ticket_title": ticket.title,
                "reason": reason,
                "new_approver_auto_onboarded": was_created
            }
        )
        
        # Create new approver snapshot
        new_approver = UserSnapshot(
            aad_id=new_approver_aad_id,
            email=new_approver_email,
            display_name=display_name
        )
        
        # Update the approval task with new approver
        approval_tasks = self.ticket_repo.get_approval_tasks_for_step(ticket_step_id)
        old_approver_email = None  # Track the email used in parallel lists
        
        for task in approval_tasks:
            # Find the current approver's task and update it
            is_match = False
            if actor.aad_id and task.approver.aad_id and actor.aad_id == task.approver.aad_id:
                is_match = True
                old_approver_email = task.approver.email
            elif task.approver.email.lower() == actor.email.lower():
                is_match = True
                old_approver_email = task.approver.email
            
            if is_match and task.decision == ApprovalDecision.PENDING:
                # Update the approver on the task
                self.ticket_repo.update_approval_task(
                    task.approval_task_id,
                    {
                        "approver": new_approver.model_dump(mode="json"),
                        "updated_at": now
                    }
                )
        
        # Get step raw data for parallel approval handling
        step_raw = self.ticket_repo.get_step_raw(ticket_step_id)
        step_updates = {"assigned_to": new_approver.model_dump(mode="json")}
        
        # Handle parallel approval lists if present
        if step_raw:
            parallel_pending = step_raw.get("parallel_pending_approvers", [])
            parallel_info = step_raw.get("parallel_approvers_info", [])
            primary_email = step_raw.get("primary_approver_email")
            
            if parallel_pending:
                # Find the old approver's email in the pending list
                email_to_remove = old_approver_email or actor.email
                old_email_lower = email_to_remove.lower()
                
                # Remove old approver from pending list
                new_pending = [e for e in parallel_pending if e.lower() != old_email_lower]
                # Add new approver to pending list
                new_pending.append(new_approver_email)
                step_updates["parallel_pending_approvers"] = new_pending
                
                # Update parallel_approvers_info
                if parallel_info:
                    new_info = [i for i in parallel_info if i.get("email", "").lower() != old_email_lower]
                    new_info.append({
                        "email": new_approver_email,
                        "aad_id": new_approver_aad_id,
                        "display_name": display_name
                    })
                    step_updates["parallel_approvers_info"] = new_info
                
                # If the old approver was the primary, transfer primary to new approver
                if primary_email and primary_email.lower() == old_email_lower:
                    step_updates["primary_approver_email"] = new_approver_email
                    logger.info(
                        f"Primary approver transferred from {email_to_remove} to {new_approver_email}",
                        extra={"ticket_step_id": ticket_step_id}
                    )
        
        # Update the step
        self.ticket_repo.update_step(
            ticket_step_id,
            step_updates,
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.REASSIGN_APPROVAL,
            actor=actor,
            details={
                "previous_approver": actor.email,
                "new_approver": new_approver_email,
                "new_approver_display_name": display_name,
                "reason": reason,
                "auto_onboarded": was_created
            },
            correlation_id=correlation_id
        )
        
        # Notify new approver
        self.notification_service.enqueue_approval_reassigned(
            ticket_id=ticket_id,
            new_approver_email=new_approver_email,
            ticket_title=ticket.title,
            reassigned_by_name=actor.display_name,
            reason=reason
        )
        
        logger.info(
            f"Approval reassigned from {actor.email} to {new_approver_email}",
            extra={
                "ticket_id": ticket_id,
                "ticket_step_id": ticket_step_id,
                "auto_onboarded": was_created
            }
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_complete_task(
        self,
        ticket_id: str,
        ticket_step_id: str,
        execution_notes: Optional[str],
        output_values: Dict[str, Any],
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle task completion"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Log step details for debugging
        logger.info(
            f"Complete task request: ticket_id={ticket_id}, step_id={ticket_step_id}, "
            f"step_type={step.step_type}, step_state={step.state}, "
            f"has_assigned_to={step.assigned_to is not None}, "
            f"actor_email={actor.email}, actor_aad_id={actor.aad_id}"
        )
        
        # Idempotency check: If step is already completed, check if same user (allow) or different user (deny)
        if step.state == StepState.COMPLETED:
            # Check if the same user is trying to complete it again (idempotent operation)
            # This handles double-clicks, network retries, or UI state sync issues
            if step.assigned_to:
                # Use same matching logic as permission guard: aad_id first, then email
                is_same_user = False
                if actor.aad_id and step.assigned_to.aad_id:
                    is_same_user = actor.aad_id == step.assigned_to.aad_id
                if not is_same_user and step.assigned_to.email:
                    is_same_user = actor.email.lower() == step.assigned_to.email.lower()
                
                if is_same_user:
                    logger.info(
                        f"Task already completed by same user (idempotent): ticket_id={ticket_id}, "
                        f"step_id={ticket_step_id}, actor_email={actor.email}, "
                        f"actor_aad_id={actor.aad_id}, assigned_to_email={step.assigned_to.email}, "
                        f"assigned_to_aad_id={step.assigned_to.aad_id}"
                    )
                    # Return success without re-processing (idempotent)
                    return self._build_action_response(ticket_id, actor)
            
            # Step is completed but by different user - deny with clear message
            logger.warning(
                f"Task already completed by different user: ticket_id={ticket_id}, step_id={ticket_step_id}, "
                f"actor_email={actor.email}, actor_aad_id={actor.aad_id}, "
                f"completed_by_email={step.assigned_to.email if step.assigned_to else 'unknown'}, "
                f"completed_by_aad_id={step.assigned_to.aad_id if step.assigned_to else 'unknown'}"
            )
            raise PermissionDeniedError(
                f"This task has already been completed by {step.assigned_to.email if step.assigned_to else 'another user'}"
            )
        
        # Permission check for active steps
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "complete_task"):
            logger.warning(
                f"Permission denied for complete_task: ticket_id={ticket_id}, step_id={ticket_step_id}, "
                f"actor_email={actor.email}, step_assigned_to={step.assigned_to.email if step.assigned_to else None}, "
                f"step_state={step.state}"
            )
            raise PermissionDeniedError("You cannot complete this task")
        
        # Validate task form fields if present
        field_definitions = step.data.get("fields", []) if step.data else []
        sections = step.data.get("sections", []) if step.data else []
        if field_definitions:
            # For task steps, output_values contains the form data
            validation_errors = self._validate_form_values(output_values, field_definitions, sections)
            if validation_errors:
                raise ValidationError(
                    message=validation_errors[0],
                    details={"validation_errors": validation_errors}
                )
        
        now = utc_now()
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": StepState.COMPLETED.value,
                "completed_at": now,
                "data.execution_notes": execution_notes,
                "data.output_values": output_values
            },
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_complete_task(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            correlation_id=correlation_id
        )
        
        # Transition - use correct workflow version for sub-workflow steps
        # Refresh step to get latest state
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        if step.from_sub_workflow_id:
            workflow_version = self._get_sub_workflow_version_for_step(step)
            if not workflow_version:
                workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        else:
            workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        self._transition_to_next(ticket, step, TransitionEvent.COMPLETE_TASK, workflow_version, actor, correlation_id)
        
        # After transition, check if all steps in the branch are completed
        branch_id = getattr(step, 'branch_id', None)
        if branch_id:
            ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
            if self._are_all_branch_steps_completed(ticket, branch_id, workflow_version):
                # All steps completed - mark branch as completed
                self._mark_branch_completed(ticket, step, actor, correlation_id, workflow_version)
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_add_note(
        self,
        ticket_id: str,
        ticket_step_id: str,
        content: str,
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle adding a note to a task"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be assigned agent or manager
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "add_note", all_steps):
            raise PermissionDeniedError("You cannot add notes to this task")
        
        now = utc_now()
        
        # Get existing notes or create empty list
        existing_notes = step.data.get("notes", [])
        
        # Add new note with timestamp, author, and attachments
        new_note = {
            "content": content,
            "actor": {
                "aad_id": actor.aad_id,
                "email": actor.email,
                "display_name": actor.display_name
            },
            "timestamp": format_iso(now),
            "attachment_ids": attachment_ids
        }
        existing_notes.append(new_note)
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {"data.notes": existing_notes},
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_note_added(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            note_preview=content[:100],
            correlation_id=correlation_id
        )
        
        # Send notifications to relevant parties (excluding the actor themselves)
        # Only notify people who are ACTIVELY involved in this step/ticket
        recipient_emails = set()
        actor_email_lower = actor.email.lower()
        
        # 1. Always notify the person assigned to this step (approver/agent)
        #    This is the most relevant person for any note on this step
        if step.assigned_to and step.assigned_to.email:
            assigned_email = step.assigned_to.email.lower()
            if assigned_email != actor_email_lower:
                recipient_emails.add(step.assigned_to.email)
        
        # 2. For APPROVAL_STEP with parallel approvers, notify all parallel approvers
        if step.step_type == StepType.APPROVAL_STEP and step.data:
            parallel_approvers = step.data.get("parallel_approvers", [])
            for approver in parallel_approvers:
                approver_email = None
                if isinstance(approver, dict):
                    approver_email = approver.get("email")
                elif isinstance(approver, str):
                    approver_email = approver
                
                if approver_email and approver_email.lower() != actor_email_lower:
                    recipient_emails.add(approver_email)
        
        # 3. Always notify the requester (they should know about activity on their ticket)
        if ticket.requester and ticket.requester.email:
            requester_email = ticket.requester.email.lower()
            if requester_email != actor_email_lower:
                recipient_emails.add(ticket.requester.email)
        
        # Note: We intentionally do NOT notify ticket.manager_snapshot (AD manager)
        # unless they happen to be the assigned_to person. The AD manager is only
        # relevant when they are actually the approver (REQUESTER_MANAGER resolution).
        # If they are the approver, they'll be in step.assigned_to already.
        
        if recipient_emails:
            self.notification_service.enqueue_note_added(
                ticket_id=ticket_id,
                ticket_title=ticket.title,
                step_name=step.step_name,
                step_type=step.step_type.value if hasattr(step.step_type, 'value') else str(step.step_type),
                note_author=actor.display_name or actor.email,
                note_preview=content[:200],
                recipient_emails=list(recipient_emails)
            )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_add_requester_note(
        self,
        ticket_id: str,
        content: str,
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle adding a requester note to a ticket (ticket-level, not step-specific)"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Permission check - only the requester can add requester notes
        is_requester = (
            actor.email.lower() == ticket.requester.email.lower() or
            (actor.aad_id and ticket.requester.aad_id and actor.aad_id == ticket.requester.aad_id)
        )
        
        if not is_requester:
            raise PermissionDeniedError("Only the ticket requester can add requester notes")
        
        # Check ticket is not in a terminal state
        if ticket.status in [TicketStatus.COMPLETED, TicketStatus.CANCELLED, TicketStatus.REJECTED]:
            raise InvalidStateError(f"Cannot add notes to a {ticket.status.value} ticket")
        
        now = utc_now()
        
        # Generate unique note ID
        import uuid
        note_id = f"RN-{uuid.uuid4().hex[:12]}"
        
        # Create the requester note with attachments
        new_note = {
            "note_id": note_id,
            "content": content,
            "actor": {
                "aad_id": actor.aad_id,
                "email": actor.email,
                "display_name": actor.display_name
            },
            "created_at": format_iso(now),
            "attachment_ids": attachment_ids
        }
        
        # Get existing requester notes or create empty list
        existing_notes = ticket.requester_notes if hasattr(ticket, 'requester_notes') and ticket.requester_notes else []
        # Convert Pydantic models to dicts if needed
        existing_notes_dicts = [
            n.model_dump() if hasattr(n, 'model_dump') else n 
            for n in existing_notes
        ]
        existing_notes_dicts.append(new_note)
        
        # Update ticket with new note
        self.ticket_repo.update_ticket(
            ticket_id,
            {
                "requester_notes": existing_notes_dicts,
                "updated_at": format_iso(now)
            },
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_requester_note_added(
            ticket_id=ticket_id,
            actor=actor,
            note_preview=content[:100],
            correlation_id=correlation_id
        )
        
        # Send notifications to relevant parties (current step assignees)
        recipient_emails = set()
        actor_email_lower = actor.email.lower()
        
        # Get all active steps for this ticket
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        active_states = [
            StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL, 
            StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT
        ]
        
        for step in all_steps:
            if step.state in active_states:
                # Notify assigned person
                if step.assigned_to and step.assigned_to.email:
                    assigned_email = step.assigned_to.email.lower()
                    if assigned_email != actor_email_lower:
                        recipient_emails.add(step.assigned_to.email)
                
                # For parallel approvers
                if step.step_type == StepType.APPROVAL_STEP and step.data:
                    parallel_approvers = step.data.get("parallel_approvers", [])
                    for approver in parallel_approvers:
                        approver_email = None
                        if isinstance(approver, dict):
                            approver_email = approver.get("email")
                        elif isinstance(approver, str):
                            approver_email = approver
                        
                        if approver_email and approver_email.lower() != actor_email_lower:
                            recipient_emails.add(approver_email)
        
        # Also notify the manager if they are the current approver
        if ticket.manager_snapshot and ticket.manager_snapshot.email:
            manager_email = ticket.manager_snapshot.email.lower()
            if manager_email != actor_email_lower and manager_email in [e.lower() for e in recipient_emails]:
                # Manager is already in recipient list as assignee, no need to add again
                pass
        
        if recipient_emails:
            self.notification_service.enqueue_requester_note_added(
                ticket_id=ticket_id,
                ticket_title=ticket.title,
                requester_name=actor.display_name or actor.email,
                note_preview=content[:200],
                recipient_emails=list(recipient_emails)
            )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_save_draft(
        self,
        ticket_id: str,
        ticket_step_id: str,
        draft_values: Dict[str, Any],
        execution_notes: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle saving draft values for a task without completing it"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be assigned agent
        if step.step_type != StepType.TASK_STEP:
            raise InvalidStateError("Can only save draft for task steps")
        
        if step.state not in [StepState.ACTIVE, StepState.ON_HOLD, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT, StepState.WAITING_FOR_CR]:
            raise InvalidStateError(f"Cannot save draft for step in state {step.state}")
        
        if not step.assigned_to or not self.permission_guard._is_same_user(actor, step.assigned_to):
            raise PermissionDeniedError("Only the assigned agent can save draft")
        
        now = utc_now()
        
        # Update step with draft values
        update_fields = {
            "data.draft_values": draft_values,
            "data.draft_saved_at": format_iso(now),
            "data.draft_saved_by": {
                "aad_id": actor.aad_id,
                "email": actor.email,
                "display_name": actor.display_name
            }
        }
        
        if execution_notes is not None:
            update_fields["data.draft_execution_notes"] = execution_notes
        
        self.ticket_repo.update_step(
            ticket_step_id,
            update_fields,
            expected_version=step.version
        )
        
        logger.info(f"Draft saved for step {ticket_step_id} by {actor.email}")
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_request_info(
        self,
        ticket_id: str,
        ticket_step_id: str,
        question_text: str,
        actor: ActorContext,
        correlation_id: str,
        requested_from_email: Optional[str] = None,
        subject: Optional[str] = None,
        attachment_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Handle request for more info from requester or previous agent"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "request_info"):
            raise PermissionDeniedError("You cannot request info for this step")
        
        # Check no open info request exists
        existing = self.ticket_repo.get_open_info_request_for_step(ticket_step_id)
        if existing:
            raise InfoRequestOpenError("Info request already open for this step")
        
        now = utc_now()
        
        # Determine who the request is directed to and their step type
        requested_from: Optional[UserSnapshot] = None
        requested_from_step_type: str = "REQUESTER"  # Default
        is_requesting_from_agent = False
        
        if requested_from_email:
            # Check if the email contains step_name (format: email::step_name)
            email_parts = requested_from_email.split("::")
            actual_email = email_parts[0]
            target_step_name = email_parts[1] if len(email_parts) > 1 else None
            
            logger.info(f"Request info: actual_email={actual_email}, target_step_name={target_step_name}")
            
            # Helper to get step type as string
            def get_step_type_str(step_type) -> str:
                if hasattr(step_type, 'value'):
                    return step_type.value
                return str(step_type).replace("StepType.", "")
            
            # If a step name is specified, find that specific step first
            if target_step_name:
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
                for prev_step in all_steps:
                    logger.info(f"Checking step: name='{prev_step.step_name}', type={prev_step.step_type}, assigned_to={prev_step.assigned_to.email if prev_step.assigned_to else None}")
                    if prev_step.step_name == target_step_name:
                        # Match by email (case-insensitive)
                        if prev_step.assigned_to:
                            email_match = prev_step.assigned_to.email.lower() == actual_email.lower()
                            if email_match:
                                requested_from = prev_step.assigned_to
                                step_type_str = get_step_type_str(prev_step.step_type)
                                requested_from_step_type = step_type_str
                                is_requesting_from_agent = (step_type_str != "FORM_STEP")
                                logger.info(f"Found recipient in step '{target_step_name}', type={step_type_str}, requested_from_step_type={requested_from_step_type}")
                                break
            
            # If no step name or not found, check if it's the requester
            if not requested_from and ticket.requester and ticket.requester.email.lower() == actual_email.lower():
                requested_from = ticket.requester
                requested_from_step_type = "REQUESTER"
                is_requesting_from_agent = False
                logger.info(f"Recipient is the requester")
            
            # Check if it's the manager (not as approver on a step)
            if not requested_from and ticket.manager_snapshot and ticket.manager_snapshot.email.lower() == actual_email.lower():
                requested_from = ticket.manager_snapshot
                requested_from_step_type = "APPROVAL_STEP"
                is_requesting_from_agent = True
                logger.info(f"Recipient is the manager")
            
            # If still not found, search all steps
            if not requested_from:
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
                for prev_step in all_steps:
                    if prev_step.assigned_to and prev_step.assigned_to.email.lower() == actual_email.lower():
                        requested_from = prev_step.assigned_to
                        step_type_str = get_step_type_str(prev_step.step_type)
                        requested_from_step_type = step_type_str
                        is_requesting_from_agent = True
                        logger.info(f"Found recipient in step (fallback), type={step_type_str}, requested_from_step_type={requested_from_step_type}")
                        break
                
                if not requested_from:
                    # User not found - create UserSnapshot from email
                    requested_from = UserSnapshot(
                        email=actual_email,
                        display_name=actual_email.split('@')[0]
                    )
                    requested_from_step_type = "UNKNOWN"
                    is_requesting_from_agent = True
                    logger.info(f"Recipient not found in steps, created from email")
        else:
            # Default to requester
            requested_from = ticket.requester
            requested_from_step_type = "REQUESTER"
            logger.info(f"No email specified, defaulting to requester")
        
        # Save previous state
        previous_state = step.state
        
        # Create info request with recipient's step type
        info_request = InfoRequest(
            info_request_id=generate_info_request_id(),
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            requested_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            requested_from=requested_from,
            requested_from_step_type=requested_from_step_type,
            subject=subject,
            question_text=question_text,
            request_attachment_ids=attachment_ids or [],
            status=InfoRequestStatus.OPEN,
            requested_at=now
        )
        self.ticket_repo.create_info_request(info_request)
        
        # Link any attachments to this ticket
        if attachment_ids:
            self._link_attachments_to_ticket(ticket_id, attachment_ids)
        
        # Update step state - use WAITING_FOR_AGENT if requesting from agent, otherwise WAITING_FOR_REQUESTER
        step_state = StepState.WAITING_FOR_AGENT if is_requesting_from_agent else StepState.WAITING_FOR_REQUESTER
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": step_state.value,
                "previous_state": previous_state.value
            },
            expected_version=step.version
        )
        
        # Update ticket status
        ticket_status = TicketStatus.WAITING_FOR_AGENT if is_requesting_from_agent else TicketStatus.WAITING_FOR_REQUESTER
        self.ticket_repo.update_ticket(
            ticket_id,
            {"status": ticket_status.value},
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_request_info(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            question=question_text,
            correlation_id=correlation_id
        )
        
        # Notify the person being asked
        self.notification_service.enqueue_info_requested(
            ticket_id=ticket_id,
            requester_email=requested_from.email,
            ticket_title=ticket.title,
            requestor_name=actor.display_name,
            question=question_text,
            subject=subject,
            attachment_count=len(attachment_ids) if attachment_ids else 0
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_respond_info(
        self,
        ticket_id: str,
        ticket_step_id: str,
        response_text: str,
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle response to info request"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Get open info request
        info_request = self.ticket_repo.get_open_info_request_for_step(ticket_step_id)
        if not info_request:
            raise InvalidStateError("No open info request for this step")
        
        # Permission check - requester or the requested agent can respond
        can_respond = False
        if info_request.requested_from:
            # Check if actor is the person the request was directed to
            can_respond = (
                info_request.requested_from.email.lower() == actor.email.lower() or
                (info_request.requested_from.aad_id and actor.aad_id and 
                 info_request.requested_from.aad_id == actor.aad_id)
            )
        else:
            # Default to requester if requested_from is not set (backward compatibility)
            can_respond = ticket.requester.email.lower() == actor.email.lower()
        
        if not can_respond:
            raise PermissionDeniedError("Only the person the request was directed to can respond")
        
        now = utc_now()
        
        # Update info request - serialize datetime to ISO format for consistency
        self.ticket_repo.update_info_request(
            info_request.info_request_id,
            {
                "status": InfoRequestStatus.RESPONDED.value,
                "response_text": response_text,
                "response_attachment_ids": attachment_ids,
                "responded_by": UserSnapshot(
                    aad_id=actor.aad_id,
                    email=actor.email,
                    display_name=actor.display_name
                ).model_dump(mode="json"),
                "responded_at": format_iso(now)
            }
        )
        
        # Restore step state
        previous_state = step.previous_state or StepState.ACTIVE
        if step.step_type == StepType.APPROVAL_STEP:
            previous_state = StepState.WAITING_FOR_APPROVAL
        
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": previous_state.value if isinstance(previous_state, StepState) else previous_state,
                "previous_state": None
            },
            expected_version=step.version
        )
        
        # Update ticket status
        self.ticket_repo.update_ticket(
            ticket_id,
            {"status": TicketStatus.IN_PROGRESS.value},
            expected_version=ticket.version
        )
        
        # Audit
        self.audit_writer.write_respond_info(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            response_summary=response_text[:200],
            correlation_id=correlation_id
        )
        
        # Notify the person who requested the info
        if info_request.requested_by and info_request.requested_by.email:
            self.notification_service.enqueue_info_responded(
                ticket_id=ticket_id,
                recipient_email=info_request.requested_by.email,
                ticket_title=ticket.title,
                responder_name=actor.display_name,
                response_summary=response_text[:200]
            )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_assign(
        self,
        ticket_id: str,
        ticket_step_id: str,
        agent_email: str,
        actor: ActorContext,
        correlation_id: str,
        agent_aad_id: Optional[str] = None,
        agent_display_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle agent assignment with auto-onboarding"""
        from ..repositories.admin_repo import AdminRepository
        
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        
        # Permission check - pass all_steps to check if actor approved previous step
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "assign", all_steps):
            raise PermissionDeniedError("You cannot assign agents")
        
        # Use provided aad_id if available, otherwise fall back to directory lookup
        display_name = agent_display_name or agent_email.split('@')[0].replace('.', ' ').title()
        if agent_aad_id:
            agent_snapshot = UserSnapshot(
                aad_id=agent_aad_id,
                email=agent_email,
                display_name=display_name
            )
            logger.info(f"Using provided aad_id for assignment: {agent_aad_id}")
        else:
            # Fall back to directory lookup (may use mock)
            agent_snapshot = self.directory_service.resolve_user_for_assignment(agent_email, actor)
            display_name = agent_snapshot.display_name
        
        # Auto-onboard agent if not in system (first-time task assignment)
        admin_repo = AdminRepository()
        access, was_created, added_manager, added_agent = admin_repo.auto_onboard_user(
            email=agent_email,
            display_name=display_name,
            triggered_by_email=actor.email,
            triggered_by_display_name=actor.display_name,
            as_agent=True,  # Task assignment requires agent persona
            aad_id=agent_aad_id
            # onboard_source defaults to TASK_ASSIGNMENT
        )
        
        # Log audit if user was created OR if agent persona was added to existing user
        if was_created or added_agent:
            admin_repo.log_admin_action(
                action=AdminAuditAction.AUTO_ONBOARD_AGENT,
                actor_email=actor.email,
                actor_display_name=actor.display_name,
                target_email=agent_email,
                target_display_name=display_name,
                details={
                    "trigger": "task_assignment",
                    "ticket_id": ticket_id,
                    "ticket_step_id": ticket_step_id,
                    "was_new_user": was_created,
                    "added_agent_to_existing": added_agent and not was_created
                }
            )
            logger.info(
                f"Task Assignment: Auto-onboarded agent {agent_email}",
                extra={"ticket_id": ticket_id, "triggered_by": actor.email, "was_new": was_created}
            )
        
        now = utc_now()
        
        # Create assignment record
        assignment = Assignment(
            assignment_id=generate_assignment_id(),
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            assigned_to=agent_snapshot,
            assigned_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            status=AssignmentStatus.ACTIVE,
            assigned_at=now
        )
        self.ticket_repo.create_assignment(assignment)
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "assigned_to": agent_snapshot.model_dump(mode="json"),
                "state": StepState.ACTIVE.value
            },
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_assign(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            agent_email=agent_email,
            correlation_id=correlation_id
        )
        
        # Notify agent
        self.notification_service.enqueue_task_assigned(
            ticket_id=ticket_id,
            agent_email=agent_email,
            ticket_title=ticket.title,
            assigned_by_name=actor.display_name
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_reassign(
        self,
        ticket_id: str,
        ticket_step_id: str,
        agent_email: str,
        actor: ActorContext,
        correlation_id: str,
        agent_aad_id: Optional[str] = None,
        agent_display_name: Optional[str] = None,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle agent reassignment with auto-onboarding"""
        from ..repositories.admin_repo import AdminRepository
        
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check
        if not self.permission_guard.can_act_on_step(actor, ticket, step, "reassign"):
            raise PermissionDeniedError("You cannot reassign agents")
        
        old_agent = step.assigned_to
        if not old_agent:
            raise InvalidStateError("No agent currently assigned")
        
        # Use provided aad_id if available, otherwise fall back to directory lookup
        display_name = agent_display_name or agent_email.split('@')[0].replace('.', ' ').title()
        if agent_aad_id:
            agent_snapshot = UserSnapshot(
                aad_id=agent_aad_id,
                email=agent_email,
                display_name=display_name
            )
            logger.info(f"Using provided aad_id for reassignment: {agent_aad_id}")
        else:
            agent_snapshot = self.directory_service.resolve_user_for_assignment(agent_email, actor)
            display_name = agent_snapshot.display_name
        
        # Auto-onboard agent if not in system (Reassign Agent feature)
        from ..domain.enums import OnboardSource
        admin_repo = AdminRepository()
        access, was_created, added_manager, added_agent = admin_repo.auto_onboard_user(
            email=agent_email,
            display_name=display_name,
            triggered_by_email=actor.email,
            triggered_by_display_name=actor.display_name,
            as_agent=True,  # Task reassignment requires agent persona
            aad_id=agent_aad_id,
            onboard_source=OnboardSource.REASSIGN_AGENT  # Explicit: This is a reassignment
        )
        
        # Log audit if user was created OR if agent persona was added to existing user
        if was_created or added_agent:
            admin_repo.log_admin_action(
                action=AdminAuditAction.AUTO_ONBOARD_AGENT,
                actor_email=actor.email,
                actor_display_name=actor.display_name,
                target_email=agent_email,
                target_display_name=display_name,
                details={
                    "trigger": "task_reassignment",
                    "ticket_id": ticket_id,
                    "ticket_step_id": ticket_step_id,
                    "previous_agent": old_agent.email,
                    "was_new_user": was_created,
                    "added_agent_to_existing": added_agent and not was_created
                }
            )
            logger.info(
                f"Reassign Agent: Auto-onboarded agent {agent_email}",
                extra={"ticket_id": ticket_id, "triggered_by": actor.email, "was_new": was_created}
            )
        
        now = utc_now()
        
        # Update old assignment
        old_assignment = self.ticket_repo.get_active_assignment(ticket_step_id)
        if old_assignment:
            self.ticket_repo.update_assignment(
                old_assignment.assignment_id,
                {
                    "status": AssignmentStatus.REASSIGNED.value,
                    "ended_at": now
                }
            )
        
        # Create new assignment
        assignment = Assignment(
            assignment_id=generate_assignment_id(),
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            assigned_to=agent_snapshot,
            assigned_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            status=AssignmentStatus.ACTIVE,
            reason=reason,
            assigned_at=now
        )
        self.ticket_repo.create_assignment(assignment)
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {"assigned_to": agent_snapshot.model_dump(mode="json")},
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_reassign(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            old_agent_email=old_agent.email,
            new_agent_email=agent_email,
            reason=reason,
            correlation_id=correlation_id
        )
        
        # Notify new agent
        self.notification_service.enqueue_task_reassigned(
            ticket_id=ticket_id,
            new_agent_email=agent_email,
            ticket_title=ticket.title,
            reassigned_by_name=actor.display_name,
            previous_agent_email=old_agent.email,
            reason=reason
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_cancel(
        self,
        ticket_id: str,
        reason: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle ticket cancellation"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Permission check
        if not self.permission_guard.can_cancel_ticket(actor, ticket):
            raise PermissionDeniedError("You cannot cancel this ticket")
        
        now = utc_now()
        
        # Update ticket
        self.ticket_repo.update_ticket(
            ticket_id,
            {
                "status": TicketStatus.CANCELLED.value,
                "completed_at": now
            },
            expected_version=ticket.version
        )
        
        # Update all active steps to SKIPPED
        steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        for step in steps:
            if step.state in [StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT]:
                self.ticket_repo.update_step(
                    step.ticket_step_id,
                    {"state": StepState.SKIPPED.value},
                    expected_version=step.version
                )
        
        # Close any open info requests for this ticket
        open_info_requests = self.ticket_repo.get_info_requests_for_ticket(ticket_id)
        for ir in open_info_requests:
            if ir.status == InfoRequestStatus.OPEN:
                self.ticket_repo.update_info_request(
                    ir.info_request_id,
                    {
                        "status": InfoRequestStatus.RESPONDED.value,
                        "response_text": "[Auto-closed: Ticket was cancelled]"
                    }
                )
        
        # Cancel any pending approval tasks for this ticket
        pending_tasks = self.ticket_repo.get_approval_tasks_for_ticket(ticket_id)
        for task in pending_tasks:
            if task.decision == ApprovalDecision.PENDING:
                self.ticket_repo.update_approval_task(
                    task.approval_task_id,
                    {"decision": ApprovalDecision.CANCELLED.value, "decided_at": now}
                )
        
        # Audit
        self.audit_writer.write_cancel_ticket(
            ticket_id=ticket_id,
            actor=actor,
            reason=reason,
            correlation_id=correlation_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_hold(
        self,
        ticket_id: str,
        ticket_step_id: str,
        reason: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle putting a step on hold"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be assigned agent (match by aad_id first, then email)
        is_assigned_agent = False
        if step.assigned_to:
            # Primary: match by AAD ID
            if actor.aad_id and step.assigned_to.aad_id and actor.aad_id == step.assigned_to.aad_id:
                is_assigned_agent = True
            # Fallback: match by email
            elif step.assigned_to.email and actor.email.lower() == step.assigned_to.email.lower():
                is_assigned_agent = True
        
        if not is_assigned_agent:
            raise PermissionDeniedError("Only assigned agent can put step on hold")
        
        # State check
        if step.state not in [StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL]:
            raise InvalidStateError(f"Cannot put step on hold from state {step.state}")
        
        now = utc_now()
        previous_state = step.state
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": StepState.ON_HOLD.value,
                "previous_state": previous_state.value,
                "data.hold_reason": reason,
                "data.held_at": now.isoformat(),
                "data.held_by": actor.email
            },
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_hold(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            reason=reason,
            correlation_id=correlation_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_resume(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle resuming a step from hold"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be assigned agent or manager (match by aad_id first, then email)
        is_assigned = False
        if step.assigned_to:
            if actor.aad_id and step.assigned_to.aad_id and actor.aad_id == step.assigned_to.aad_id:
                is_assigned = True
            elif step.assigned_to.email and actor.email.lower() == step.assigned_to.email.lower():
                is_assigned = True
        
        is_manager = False
        if ticket.manager_snapshot:
            if actor.aad_id and ticket.manager_snapshot.aad_id and actor.aad_id == ticket.manager_snapshot.aad_id:
                is_manager = True
            elif ticket.manager_snapshot.email and actor.email.lower() == ticket.manager_snapshot.email.lower():
                is_manager = True
        
        if not is_assigned and not is_manager:
            raise PermissionDeniedError("Only assigned agent or manager can resume step")
        
        # State check
        if step.state != StepState.ON_HOLD:
            raise InvalidStateError(f"Step is not on hold (state: {step.state})")
        
        # Restore previous state
        previous_state = step.previous_state or StepState.ACTIVE
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": previous_state.value if isinstance(previous_state, StepState) else previous_state,
                "previous_state": None,
                "data.resumed_at": utc_now().isoformat(),
                "data.resumed_by": actor.email
            },
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_resume(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_handover_request(
        self,
        ticket_id: str,
        ticket_step_id: str,
        reason: str,
        suggested_agent_email: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle agent requesting handover"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be assigned agent (check by AAD ID first, then email)
        is_assigned_agent = False
        if step.assigned_to:
            # Primary: match by AAD ID
            if actor.aad_id and step.assigned_to.aad_id and actor.aad_id == step.assigned_to.aad_id:
                is_assigned_agent = True
            # Fallback: match by email
            elif step.assigned_to.email.lower() == actor.email.lower():
                is_assigned_agent = True
        
        if not is_assigned_agent:
            raise PermissionDeniedError("Only assigned agent can request handover")
        
        # Check no pending handover exists
        existing = self.ticket_repo.get_pending_handover_for_step(ticket_step_id)
        if existing:
            raise InvalidStateError("Handover request already pending for this step")
        
        now = utc_now()
        
        # Resolve suggested agent if provided
        suggested_agent = None
        if suggested_agent_email:
            try:
                suggested_agent = self.directory_service.resolve_user_for_assignment(suggested_agent_email, actor)
            except Exception:
                pass
        
        # Create handover request
        handover_request = HandoverRequest(
            handover_request_id=generate_handover_request_id(),
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            requested_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            requested_to=suggested_agent,
            reason=reason,
            status=HandoverRequestStatus.PENDING,
            requested_at=now
        )
        self.ticket_repo.create_handover_request(handover_request)
        
        # Audit
        self.audit_writer.write_handover_requested(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            reason=reason,
            correlation_id=correlation_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_handover_decision(
        self,
        ticket_id: str,
        ticket_step_id: str,
        handover_request_id: str,
        approved: bool,
        new_agent_email: Optional[str],
        actor: ActorContext,
        correlation_id: str,
        new_agent_aad_id: Optional[str] = None,
        new_agent_display_name: Optional[str] = None,
        comment: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle manager decision on handover request"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        
        # Permission check - must be AD manager OR previous approver (including primary approver for parallel approvals)
        is_manager = ticket.manager_snapshot and (
            ticket.manager_snapshot.email.lower() == actor.email.lower() or
            (ticket.manager_snapshot.aad_id and ticket.manager_snapshot.aad_id == actor.aad_id)
        )
        
        # Also check if actor is the approver responsible for this task
        # For parallel approvals: ONLY the primary approver handles handovers
        # For single approvals: the assigned_to approver handles handovers
        is_approver = False
        for prev_step in all_steps:
            if prev_step.step_type == StepType.APPROVAL_STEP and prev_step.state == StepState.COMPLETED:
                step_raw = self.ticket_repo.get_step_raw(prev_step.ticket_step_id)
                
                # Check if this was a parallel approval
                primary_email = step_raw.get("primary_approver_email") if step_raw else None
                
                if primary_email:
                    # Parallel approval: ONLY the primary approver is responsible
                    if primary_email.lower() == actor.email.lower():
                        is_approver = True
                        logger.info(
                            f"Actor {actor.email} is primary approver for step {prev_step.ticket_step_id}",
                            extra={"primary_email": primary_email}
                        )
                        break
                    
                    # Also check by AAD ID in parallel_approvers_info
                    if actor.aad_id:
                        parallel_info = step_raw.get("parallel_approvers_info", [])
                        for info in parallel_info:
                            if info.get("email", "").lower() == primary_email.lower() and info.get("aad_id") == actor.aad_id:
                                is_approver = True
                                logger.info(
                                    f"Actor {actor.email} matched primary approver by AAD ID",
                                    extra={"primary_email": primary_email}
                                )
                                break
                        if is_approver:
                            break
                else:
                    # Single approver: check assigned_to
                    if prev_step.assigned_to and (
                        prev_step.assigned_to.email.lower() == actor.email.lower() or
                        (prev_step.assigned_to.aad_id and prev_step.assigned_to.aad_id == actor.aad_id)
                    ):
                        is_approver = True
                        break
        
        if not is_manager and not is_approver:
            raise PermissionDeniedError("Only manager or previous approver can decide on handover requests")
        
        handover_request = self.ticket_repo.get_handover_request(handover_request_id)
        if not handover_request:
            raise NotFoundError(f"Handover request {handover_request_id} not found")
        
        if handover_request.status != HandoverRequestStatus.PENDING:
            raise InvalidStateError(f"Handover request already decided")
        
        now = utc_now()
        
        if approved:
            from ..repositories.admin_repo import AdminRepository
            
            # Resolve new agent
            if not new_agent_email:
                raise ValidationError("New agent email required for approval")
            
            # Use provided aad_id if available
            display_name = new_agent_display_name or new_agent_email.split('@')[0].replace('.', ' ').title()
            if new_agent_aad_id:
                new_agent_snapshot = UserSnapshot(
                    aad_id=new_agent_aad_id,
                    email=new_agent_email,
                    display_name=display_name
                )
                logger.info(f"Using provided aad_id for handover reassignment: {new_agent_aad_id}")
            else:
                new_agent_snapshot = self.directory_service.resolve_user_for_assignment(new_agent_email, actor)
                display_name = new_agent_snapshot.display_name
            
            # Auto-onboard new agent if not in system (Handover approval)
            from ..domain.enums import OnboardSource
            admin_repo = AdminRepository()
            access, was_created, added_manager, added_agent = admin_repo.auto_onboard_user(
                email=new_agent_email,
                display_name=display_name,
                triggered_by_email=actor.email,
                triggered_by_display_name=actor.display_name,
                as_agent=True,  # Handover requires agent persona
                aad_id=new_agent_aad_id,
                onboard_source=OnboardSource.HANDOVER_ASSIGNMENT  # Explicit: Via handover approval
            )
            
            # Log audit if user was created OR if agent persona was added to existing user
            if was_created or added_agent:
                admin_repo.log_admin_action(
                    action=AdminAuditAction.AUTO_ONBOARD_AGENT,
                    actor_email=actor.email,
                    actor_display_name=actor.display_name,
                    target_email=new_agent_email,
                    target_display_name=display_name,
                    details={
                        "trigger": "handover_approval",
                        "ticket_id": ticket_id,
                        "ticket_step_id": ticket_step_id,
                        "handover_request_id": handover_request_id,
                        "was_new_user": was_created,
                        "added_agent_to_existing": added_agent and not was_created
                    }
                )
                logger.info(
                    f"Handover: Auto-onboarded agent {new_agent_email} via handover approval",
                    extra={"ticket_id": ticket_id, "triggered_by": actor.email, "was_new": was_created}
                )
            
            # Update handover request
            self.ticket_repo.update_handover_request(
                handover_request_id,
                {
                    "status": HandoverRequestStatus.APPROVED.value,
                    "decided_by": UserSnapshot(
                        aad_id=actor.aad_id,
                        email=actor.email,
                        display_name=actor.display_name
                    ).model_dump(mode="json"),
                    "decision_comment": comment,
                    "new_assignee": new_agent_snapshot.model_dump(mode="json"),
                    "decided_at": now
                }
            )
            
            # Perform the reassignment
            old_agent = step.assigned_to
            
            # Update old assignment
            old_assignment = self.ticket_repo.get_active_assignment(ticket_step_id)
            if old_assignment:
                self.ticket_repo.update_assignment(
                    old_assignment.assignment_id,
                    {
                        "status": AssignmentStatus.REASSIGNED.value,
                        "ended_at": now
                    }
                )
            
            # Create new assignment
            from ..utils.idgen import generate_assignment_id
            assignment = Assignment(
                assignment_id=generate_assignment_id(),
                ticket_id=ticket_id,
                ticket_step_id=ticket_step_id,
                assigned_to=new_agent_snapshot,
                assigned_by=UserSnapshot(
                    aad_id=actor.aad_id,
                    email=actor.email,
                    display_name=actor.display_name
                ),
                status=AssignmentStatus.ACTIVE,
                reason=f"Handover approved: {comment or 'No comment'}",
                assigned_at=now
            )
            self.ticket_repo.create_assignment(assignment)
            
            # Update step
            self.ticket_repo.update_step(
                ticket_step_id,
                {"assigned_to": new_agent_snapshot.model_dump(mode="json")},
                expected_version=step.version
            )
            
            # Audit
            self.audit_writer.write_handover_approved(
                ticket_id=ticket_id,
                ticket_step_id=ticket_step_id,
                actor=actor,
                old_agent_email=old_agent.email if old_agent else None,
                new_agent_email=new_agent_email,
                correlation_id=correlation_id
            )
            
            # Notify new agent
            self.notification_service.enqueue_task_reassigned(
                ticket_id=ticket_id,
                new_agent_email=new_agent_email,
                ticket_title=ticket.title,
                reassigned_by_name=actor.display_name,
                previous_agent_email=old_agent.email if old_agent else None,
                reason=f"Handover approved{': ' + comment if comment else ''}"
            )
        else:
            # Reject handover
            self.ticket_repo.update_handover_request(
                handover_request_id,
                {
                    "status": HandoverRequestStatus.REJECTED.value,
                    "decided_by": UserSnapshot(
                        aad_id=actor.aad_id,
                        email=actor.email,
                        display_name=actor.display_name
                    ).model_dump(mode="json"),
                    "decision_comment": comment,
                    "decided_at": now
                }
            )
            
            # Audit
            self.audit_writer.write_handover_rejected(
                ticket_id=ticket_id,
                ticket_step_id=ticket_step_id,
                actor=actor,
                correlation_id=correlation_id
            )
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_cancel_handover(
        self,
        ticket_id: str,
        ticket_step_id: str,
        handover_request_id: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle agent cancelling their own handover request"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Get the handover request
        handover_request = self.ticket_repo.get_handover_request(handover_request_id)
        if not handover_request:
            raise ValidationError("Handover request not found")
        
        # Permission check - must be the agent who requested the handover
        if not handover_request.requested_by:
            raise PermissionDeniedError("Cannot cancel handover - no requester recorded")
        
        if not self.permission_guard._is_same_user(actor, handover_request.requested_by):
            raise PermissionDeniedError("Only the agent who requested handover can cancel it")
        
        # Status check - can only cancel pending requests
        if handover_request.status != HandoverRequestStatus.PENDING:
            raise InvalidStateError(f"Cannot cancel handover in status {handover_request.status}")
        
        now = utc_now()
        
        # Update handover request
        self.ticket_repo.update_handover_request(
            handover_request_id,
            {
                "status": HandoverRequestStatus.CANCELLED.value,
                "decided_at": now,
                "decision_comment": "Cancelled by agent"
            }
        )
        
        # Audit
        self.audit_writer.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.HANDOVER_CANCELLED,
            actor=actor,
            details={
                "ticket_step_id": ticket_step_id,
                "handover_request_id": handover_request_id,
                "reason": "Agent cancelled handover request"
            },
            correlation_id=correlation_id
        )
        
        logger.info(f"Handover request {handover_request_id} cancelled by {actor.email}")
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_skip_step(
        self,
        ticket_id: str,
        ticket_step_id: str,
        reason: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle manager skipping a step"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be manager or admin
        is_manager = ticket.manager_snapshot and ticket.manager_snapshot.email.lower() == actor.email.lower()
        is_admin = "admin" in [r.lower() for r in actor.roles]
        
        if not is_manager and not is_admin:
            raise PermissionDeniedError("Only manager or admin can skip steps")
        
        # State check - can only skip active/waiting steps
        if step.state not in [StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL, StepState.WAITING_FOR_REQUESTER, StepState.ON_HOLD]:
            raise InvalidStateError(f"Cannot skip step in state {step.state}")
        
        now = utc_now()
        
        # Update step
        self.ticket_repo.update_step(
            ticket_step_id,
            {
                "state": StepState.SKIPPED.value,
                "completed_at": now,
                "data.skipped_reason": reason,
                "data.skipped_by": actor.email
            },
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_step_skipped(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            reason=reason,
            correlation_id=correlation_id
        )
        
        # Transition to next step
        workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
        self._transition_to_next(ticket, step, TransitionEvent.SKIP_STEP, workflow_version, actor, correlation_id)
        
        return self._build_action_response(ticket_id, actor)
    
    def handle_acknowledge_sla(
        self,
        ticket_id: str,
        ticket_step_id: str,
        notes: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Handle agent acknowledging SLA breach"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        step = self.ticket_repo.get_step_or_raise(ticket_step_id)
        
        # Permission check - must be assigned agent
        if not step.assigned_to or step.assigned_to.email.lower() != actor.email.lower():
            raise PermissionDeniedError("Only assigned agent can acknowledge SLA")
        
        # Check if step is overdue
        if step.due_at and step.due_at >= utc_now():
            raise InvalidStateError("Step is not overdue")
        
        # Create acknowledgment
        acknowledgment = SlaAcknowledgment(
            acknowledgment_id=generate_sla_acknowledgment_id(),
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            acknowledged_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            acknowledged_at=utc_now(),
            notes=notes
        )
        self.ticket_repo.create_sla_acknowledgment(acknowledgment)
        
        # Update step with acknowledgment flag
        self.ticket_repo.update_step(
            ticket_step_id,
            {"data.sla_acknowledged": True, "data.sla_acknowledged_at": utc_now().isoformat()},
            expected_version=step.version
        )
        
        # Audit
        self.audit_writer.write_sla_acknowledged(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            correlation_id=correlation_id
        )
        
        return self._build_action_response(ticket_id, actor)
    
    # =========================================================================
    # Transitions
    # =========================================================================
    
    def _transition_to_next(
        self,
        ticket: Ticket,
        current_step: TicketStep,
        event: TransitionEvent,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """Transition to next step"""
        # Check if this step is part of a sub-workflow
        if current_step.parent_sub_workflow_step_id:
            # This step is part of a sub-workflow - check if sub-workflow is complete
            # We need to use the sub-workflow's definition for internal transitions
            sub_workflow_version = self._get_sub_workflow_version_for_step(current_step)
            
            if sub_workflow_version:
                # Try to resolve next step within sub-workflow
                ticket_context = {
                    "ticket": ticket.model_dump(mode="json"),
                    "form_values": ticket.form_values,
                    "current_step": current_step.model_dump(mode="json")
                }
                
                try:
                    next_step_id = self.transition_resolver.resolve_next_step(
                        current_step_id=current_step.step_id,
                        event=event,
                        ticket_context=ticket_context,
                        workflow_version=sub_workflow_version
                    )
                    
                    if next_step_id:
                        # Find and activate next step within sub-workflow
                        sub_steps = self.sub_workflow_handler.get_sub_workflow_steps(
                            ticket.ticket_id,
                            current_step.parent_sub_workflow_step_id
                        )
                        next_step = next(
                            (s for s in sub_steps if s.step_id == next_step_id),
                            None
                        )
                        
                        if next_step:
                            # CRITICAL: If current step is in a branch and next step is JOIN,
                            # mark the branch as completed BEFORE activating the join
                            branch_id = getattr(current_step, 'branch_id', None)
                            if branch_id and next_step.step_type == StepType.JOIN_STEP:
                                logger.info(
                                    f"Sub-workflow branch {branch_id} completing (step {current_step.step_id} -> JOIN {next_step_id})",
                                    extra={"ticket_id": ticket.ticket_id}
                                )
                                self._mark_branch_completed(ticket, current_step, actor, correlation_id, sub_workflow_version)
                                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                                
                                # Check if all branches are now complete for the join
                                join_step_def = self._find_step_definition(next_step_id, sub_workflow_version)
                                if join_step_def and self._check_join_completion(ticket, next_step, join_step_def, sub_workflow_version):
                                    logger.info(
                                        f"All branches complete, proceeding after join {next_step_id}",
                                        extra={"ticket_id": ticket.ticket_id}
                                    )
                                    self._transition_after_join(ticket, next_step, sub_workflow_version, actor, correlation_id)
                                return
                            
                            self._activate_step(
                                ticket, next_step, sub_workflow_version, actor, correlation_id
                            )
                            return
                    
                    # No next step - sub-workflow has ended, check completion
                    # IMPORTANT: Use PARENT workflow version, not sub-workflow version
                    parent_workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
                    self._check_and_complete_sub_workflow(
                        ticket, current_step, actor, correlation_id, parent_workflow_version
                    )
                    return
                    
                except Exception as e:
                    logger.debug(
                        f"No transition found in sub-workflow, checking completion: {e}"
                    )
                    # No transition found - sub-workflow may have ended
                    # IMPORTANT: Use PARENT workflow version, not sub-workflow version
                    parent_workflow_version = self.workflow_repo.get_version(ticket.workflow_version_id)
                    self._check_and_complete_sub_workflow(
                        ticket, current_step, actor, correlation_id, parent_workflow_version
                    )
                    return
        
        # Check if this step is part of a parallel branch
        branch_id = getattr(current_step, 'branch_id', None)
        if branch_id:
            # Check if completion triggers join - PASS THE ACTUAL EVENT TYPE
            if self._handle_branch_step_completion(ticket, current_step, workflow_version, actor, correlation_id, event):
                return  # Join handled the transition
        
        # Build context for condition evaluation
        ticket_context = {
            "ticket": ticket.model_dump(mode="json"),
            "form_values": ticket.form_values,
            "current_step": current_step.model_dump(mode="json")
        }
        
        # Resolve next step
        next_step_id = self.transition_resolver.resolve_next_step(
            current_step_id=current_step.step_id,
            event=event,
            ticket_context=ticket_context,
            workflow_version=workflow_version
        )
        
        if next_step_id is None:
            # Check if we're in a branch - don't complete ticket, wait for join
            if branch_id:
                logger.info(f"Branch {branch_id} has no explicit next step, checking if all steps are completed")
                # Check if all steps in branch are completed before marking as completed
                if self._are_all_branch_steps_completed(ticket, branch_id, workflow_version):
                    self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                else:
                    # Clear current_step_id since we've reached the end but not all steps are done
                    self._update_branch_current_step(ticket, branch_id, None)
                
                # Find the join step that this branch should lead to
                # Look for a join step that has this fork as its source
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                fork_step = None
                for step in all_steps:
                    if step.step_type == StepType.FORK_STEP:
                        # Check if this branch belongs to this fork
                        if getattr(current_step, 'parent_fork_step_id', None) == step.step_id:
                            fork_step = step
                            break
                
                if fork_step:
                    # Find the join step for this fork
                    for step in all_steps:
                        if step.step_type == StepType.JOIN_STEP:
                            join_step_def = self._find_step_definition(step.step_id, workflow_version)
                            if join_step_def and join_step_def.get("source_fork_step_id") == fork_step.step_id:
                                # Check if join can proceed
                                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                                if self._check_join_completion(ticket, step, join_step_def, workflow_version):
                                    self._transition_after_join(ticket, step, workflow_version, actor, correlation_id)
                                break
                return
            # Terminal - complete ticket
            self._complete_ticket(ticket, actor, correlation_id)
            return
        
        # Check if next step is a JOIN step
        next_step_def = self._find_step_definition(next_step_id, workflow_version)
        if next_step_def and next_step_def.get("step_type") == StepType.JOIN_STEP.value:
            # This branch is ending, check if join can proceed
            all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
            join_step = self._find_ticket_step(all_steps, next_step_id)
            
            if join_step:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                if self._check_join_completion(ticket, join_step, next_step_def, workflow_version):
                    self._transition_after_join(ticket, join_step, workflow_version, actor, correlation_id)
                else:
                    # Mark this branch as completed, wait for others
                    self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
            return
        
        # Get next step and activate
        steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        next_step = self._find_ticket_step(steps, next_step_id)
        
        # Check if we're in a rejected branch - don't activate subsequent steps
        if branch_id:
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            active_branches = ticket.active_branches or []
            branch_state = next((b for b in active_branches if b.branch_id == branch_id), None)
            if branch_state and branch_state.state == StepState.REJECTED:
                logger.info(
                    f"Branch {branch_id} is rejected, skipping activation of step {next_step_id}",
                    extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id, "next_step_id": next_step_id}
                )
                # Mark branch as completed (it's done, just rejected)
                self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                return
        
        if next_step:
            # CRITICAL: Check if next step is in a DIFFERENT branch (cross-branch transition)
            # This can happen with incorrectly designed workflows or when branches share steps
            # In this case, mark the CURRENT branch as completed before transitioning
            if branch_id:
                next_step_branch_id = getattr(next_step, 'branch_id', None)
                if next_step_branch_id and next_step_branch_id != branch_id:
                    logger.info(
                        f"Cross-branch transition detected: {current_step.step_id} (branch={branch_id}) -> "
                        f"{next_step_id} (branch={next_step_branch_id}). Marking current branch as completed.",
                        extra={"ticket_id": ticket.ticket_id}
                    )
                    # Mark current branch as completed since we're leaving it
                    self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                    
                    # Refresh ticket to get updated branch states
                    ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                    
                    # Check if this completes a join
                    parent_fork_id = getattr(current_step, 'parent_fork_step_id', None)
                    if parent_fork_id:
                        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                        for step in all_steps:
                            if step.step_type == StepType.JOIN_STEP:
                                join_step_def = self._find_step_definition(step.step_id, workflow_version)
                                if join_step_def and join_step_def.get("source_fork_step_id") == parent_fork_id:
                                    if self._check_join_completion(ticket, step, join_step_def, workflow_version):
                                        logger.info(
                                            f"Join step {step.step_id} can proceed after cross-branch transition",
                                            extra={"ticket_id": ticket.ticket_id}
                                        )
                                        self._transition_after_join(ticket, step, workflow_version, actor, correlation_id)
                                        return
                                    break
                    
                    # If next step is not started yet, activate it (in the other branch)
                    if next_step.state == StepState.NOT_STARTED:
                        self._activate_step(ticket, next_step, workflow_version, actor, correlation_id)
                    return
            
            # Check if next step is already completed or rejected
            # Also check if it's an approval step with all tasks rejected
            is_step_done = False
            if next_step.state in [StepState.COMPLETED, StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                is_step_done = True
            elif next_step.step_type == StepType.APPROVAL_STEP:
                # Check approval task status - if all tasks are rejected/skipped, step is effectively done
                approval_tasks = self.ticket_repo.get_approval_tasks_for_step(next_step.ticket_step_id)
                if approval_tasks:
                    all_rejected_or_skipped = all(task.decision in [ApprovalDecision.REJECTED, ApprovalDecision.SKIPPED] for task in approval_tasks)
                    all_approved = all(task.decision == ApprovalDecision.APPROVED for task in approval_tasks)
                    if all_rejected_or_skipped:
                        is_step_done = True
                        # Update step state to REJECTED if not already
                        if next_step.state != StepState.REJECTED:
                            self.ticket_repo.update_step(
                                next_step.ticket_step_id,
                                {"state": StepState.REJECTED.value},
                                expected_version=next_step.version
                            )
                            next_step.state = StepState.REJECTED
                    elif all_approved and next_step.state != StepState.COMPLETED:
                        # All approved but step not marked complete - mark it complete
                        self.ticket_repo.update_step(
                            next_step.ticket_step_id,
                            {"state": StepState.COMPLETED.value, "completed_at": utc_now()},
                            expected_version=next_step.version
                        )
                        next_step.state = StepState.COMPLETED
                        is_step_done = True
            
            if is_step_done:
                if branch_id:
                    # Check if the next step is in the same branch
                    next_step_branch_id = getattr(next_step, 'branch_id', None)
                    if next_step_branch_id != branch_id:
                        # Next step is from a different branch - this shouldn't happen with correct transitions
                        # But if it does, just mark our branch as completed and check for join
                        logger.warning(
                            f"Next step {next_step_id} is from different branch {next_step_branch_id}, "
                            f"not current branch {branch_id}. Marking current branch as completed.",
                            extra={"ticket_id": ticket.ticket_id, "current_step": current_step.step_id, 
                                   "next_step": next_step_id, "current_branch": branch_id, "next_branch": next_step_branch_id}
                        )
                        # Mark branch as completed and check for join
                        self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                        return
                    
                    # Step is already done and in same branch - check if this triggers join completion
                    # Find join step that this branch leads to
                    next_step_def = self._find_step_definition(next_step_id, workflow_version)
                    if next_step_def and next_step_def.get("step_type") == StepType.JOIN_STEP.value:
                        # Next step is a join - check if it can proceed
                        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                        if self._check_join_completion(ticket, next_step, next_step_def, workflow_version):
                            self._transition_after_join(ticket, next_step, workflow_version, actor, correlation_id)
                        else:
                            # Mark this branch as completed, wait for others
                            self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                    else:
                        # Step is done but not a join - skip it and mark branch as completed
                        # Don't try to recursively transition from completed steps - just mark branch done
                        logger.info(
                            f"Next step {next_step_id} is already done (state: {next_step.state}). "
                            f"Marking branch {branch_id} as completed.",
                            extra={"ticket_id": ticket.ticket_id, "current_step": current_step.step_id, 
                                   "next_step": next_step_id, "branch_id": branch_id}
                        )
                        self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                        return
                else:
                    # Not in a branch - if next step is done, skip it and continue
                    # But don't recursively transition from completed/rejected steps
                    # Instead, find the step after the completed one in the workflow definition
                    logger.warning(
                        f"Next step {next_step_id} is already done (state: {next_step.state}). "
                        f"Skipping transition from step {current_step.step_id}.",
                        extra={"ticket_id": ticket.ticket_id, "current_step": current_step.step_id, "next_step": next_step_id}
                    )
                    # Mark branch as completed if in a branch
                    if branch_id:
                        self._mark_branch_completed(ticket, current_step, actor, correlation_id, workflow_version)
                    return
            
            # If we're in a branch, propagate branch info to next step and update branch tracking
            # CRITICAL: Only propagate if next step doesn't already belong to a different branch
            if branch_id:
                next_step_branch_id = getattr(next_step, 'branch_id', None)
                
                # Only update branch metadata if:
                # 1. Next step has no branch_id (not yet assigned to a branch), OR
                # 2. Next step has the same branch_id (same branch, just updating metadata)
                if not next_step_branch_id or next_step_branch_id == branch_id:
                    self.ticket_repo.update_step(
                        next_step.ticket_step_id,
                        {
                            "branch_id": branch_id,
                            "branch_name": getattr(current_step, 'branch_name', None),
                            "parent_fork_step_id": getattr(current_step, 'parent_fork_step_id', None)
                        },
                        expected_version=next_step.version
                    )
                    next_step = self.ticket_repo.get_step_or_raise(next_step.ticket_step_id)
                    
                    # Update branch's current_step_id to track progress
                    self._update_branch_current_step(ticket, branch_id, next_step_id)
                else:
                    # Next step belongs to a different branch - don't overwrite!
                    logger.warning(
                        f"Not propagating branch metadata: next step {next_step_id} already belongs to branch {next_step_branch_id}, "
                        f"not {branch_id} from current step {current_step.step_id}",
                        extra={
                            "ticket_id": ticket.ticket_id,
                            "current_step": current_step.step_id,
                            "next_step": next_step_id,
                            "current_branch_id": branch_id,
                            "next_branch_id": next_step_branch_id
                        }
                    )
            
            # Refresh ticket for version
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            self._activate_step(ticket, next_step, workflow_version, actor, correlation_id)
    
    def _update_branch_current_step(
        self,
        ticket: Ticket,
        branch_id: str,
        new_step_id: Optional[str]
    ) -> None:
        """Update a branch's current_step_id to track progress within the branch"""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                active_branches = ticket.active_branches or []
                updated = False
                
                for i, branch in enumerate(active_branches):
                    if branch.branch_id == branch_id:
                        # Update branch with new current step
                        active_branches[i] = BranchState(
                            branch_id=branch.branch_id,
                            branch_name=branch.branch_name,
                            parent_fork_step_id=branch.parent_fork_step_id,
                            state=branch.state,
                            current_step_id=new_step_id,
                            started_at=branch.started_at,
                            completed_at=branch.completed_at,
                            outcome=branch.outcome
                        )
                        updated = True
                        break
                
                if updated:
                    self.ticket_repo.update_ticket(
                        ticket.ticket_id,
                        {"active_branches": [b.model_dump(mode="json") for b in active_branches]},
                        expected_version=ticket.version
                    )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.warning(f"Failed to update branch current step after {max_retries} attempts - non-critical")
                    break
                logger.warning(f"Concurrency conflict on branch current step update, retrying (attempt {attempt + 1})")
    
    def _mark_branch_failed(
        self,
        ticket: Ticket,
        failed_step: TicketStep,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """Mark a branch as failed (rejected/cancelled)"""
        branch_id = getattr(failed_step, 'branch_id', None)
        if not branch_id:
            return
        
        now = utc_now()
        
        # Update branch state with retry for concurrency
        max_retries = 3
        for attempt in range(max_retries):
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                active_branches = ticket.active_branches or []
                
                for i, branch in enumerate(active_branches):
                    if branch.branch_id == branch_id:
                        active_branches[i] = BranchState(
                            branch_id=branch.branch_id,
                            branch_name=branch.branch_name,
                            parent_fork_step_id=branch.parent_fork_step_id,
                            state=StepState.REJECTED,
                            current_step_id=failed_step.step_id,
                            started_at=branch.started_at,
                            completed_at=now,
                            outcome="REJECTED"
                        )
                        break
                
                self.ticket_repo.update_ticket(
                    ticket.ticket_id,
                    {"active_branches": [b.model_dump(mode="json") for b in active_branches]},
                    expected_version=ticket.version
                )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to update branch state after {max_retries} attempts")
                    raise
                logger.warning(f"Concurrency conflict on branch state update, retrying (attempt {attempt + 1})")
    
    def _cancel_other_branches(
        self,
        ticket: Ticket,
        failed_step: TicketStep,
        failed_branch_id: str,
        workflow_version: WorkflowVersion,
        actor: ActorContext,
        correlation_id: str,
        reason: str = "Another branch was rejected"
    ) -> int:
        """
        Cancel all in-progress steps in OTHER branches (not the failed branch).
        
        This is used for CANCEL_OTHERS failure policy.
        
        Args:
            ticket: The ticket
            failed_step: The step that failed/was rejected
            failed_branch_id: The branch that failed (won't be cancelled)
            workflow_version: The workflow version
            actor: The actor who triggered this
            correlation_id: For audit tracking
            reason: Reason for cancellation
            
        Returns:
            Number of steps cancelled
        """
        now = utc_now()
        cancelled_count = 0
        
        logger.info(
            f"CANCEL_OTHERS: Starting cancellation of other branches. Failed branch: {failed_branch_id}",
            extra={
                "ticket_id": ticket.ticket_id,
                "failed_step_id": failed_step.step_id,
                "failed_branch_id": failed_branch_id,
                "correlation_id": correlation_id
            }
        )
        
        try:
            # Get all steps for this ticket
            all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
            
            # Get the parent fork step to find all branches
            parent_fork_step_id = getattr(failed_step, 'parent_fork_step_id', None)
            if not parent_fork_step_id:
                logger.warning(
                    f"CANCEL_OTHERS: Failed step has no parent_fork_step_id, cannot determine other branches",
                    extra={"ticket_id": ticket.ticket_id, "step_id": failed_step.step_id}
                )
                return 0
            
            # Get fork step definition to find all branches
            fork_step_def = self._find_step_definition(parent_fork_step_id, workflow_version)
            if not fork_step_def:
                logger.error(
                    f"CANCEL_OTHERS: Could not find fork step definition for {parent_fork_step_id}",
                    extra={"ticket_id": ticket.ticket_id}
                )
                return 0
            
            branches = fork_step_def.get("branches", [])
            other_branch_ids = [
                b.get("branch_id") for b in branches 
                if b.get("branch_id") and b.get("branch_id") != failed_branch_id
            ]
            
            logger.info(
                f"CANCEL_OTHERS: Found {len(other_branch_ids)} other branches to cancel: {other_branch_ids}",
                extra={"ticket_id": ticket.ticket_id}
            )
            
            # Cancel all in-progress or not-started steps in other branches
            for step in all_steps:
                step_branch_id = getattr(step, 'branch_id', None)
                
                # Skip if not in one of the other branches
                if step_branch_id not in other_branch_ids:
                    continue
                
                # Skip if already in a terminal state
                if step.state in [StepState.COMPLETED, StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                    logger.debug(
                        f"CANCEL_OTHERS: Step {step.step_id} already in terminal state {step.state}, skipping",
                        extra={"ticket_id": ticket.ticket_id}
                    )
                    continue
                
                # Cancel this step
                try:
                    self.ticket_repo.update_step(
                        step.ticket_step_id,
                        {
                            "state": StepState.CANCELLED.value,
                            "outcome": "CANCELLED",
                            "completed_at": now
                        },
                        expected_version=step.version
                    )
                    cancelled_count += 1
                    
                    logger.info(
                        f"CANCEL_OTHERS: Cancelled step {step.step_name} ({step.step_id}) in branch {step_branch_id}",
                        extra={
                            "ticket_id": ticket.ticket_id,
                            "step_id": step.step_id,
                            "branch_id": step_branch_id,
                            "previous_state": step.state.value if hasattr(step.state, 'value') else str(step.state)
                        }
                    )
                    
                    # Cancel any pending approval tasks for this step
                    if step.step_type == StepType.APPROVAL_STEP:
                        try:
                            approval_tasks = self.ticket_repo.get_approval_tasks_for_step(step.ticket_step_id)
                            for task in approval_tasks:
                                if task.decision == ApprovalDecision.PENDING:
                                    self.ticket_repo.update_approval_task(
                                        task.approval_task_id,
                                        {
                                            "decision": ApprovalDecision.CANCELLED.value if hasattr(ApprovalDecision, 'CANCELLED') else "CANCELLED",
                                            "comment": f"Cancelled: {reason}",
                                            "decided_at": now
                                        }
                                    )
                                    logger.debug(
                                        f"CANCEL_OTHERS: Cancelled approval task for step {step.step_id}",
                                        extra={"ticket_id": ticket.ticket_id, "task_id": task.approval_task_id}
                                    )
                        except Exception as e:
                            logger.warning(
                                f"CANCEL_OTHERS: Could not cancel approval tasks for step {step.step_id}: {e}",
                                extra={"ticket_id": ticket.ticket_id}
                            )
                    
                    # Audit the cancellation
                    self.audit_writer.write_event(
                        ticket_id=ticket.ticket_id,
                        ticket_step_id=step.ticket_step_id,
                        event_type=AuditEventType.STEP_CANCELLED,
                        actor=actor,
                        details={
                            "reason": reason,
                            "cancelled_branch_id": step_branch_id,
                            "triggered_by_branch": failed_branch_id,
                            "triggered_by_step": failed_step.step_id
                        },
                        correlation_id=correlation_id
                    )
                    
                except ConcurrencyError:
                    logger.warning(
                        f"CANCEL_OTHERS: Concurrency conflict cancelling step {step.step_id}, may already be updated",
                        extra={"ticket_id": ticket.ticket_id}
                    )
                except Exception as e:
                    logger.error(
                        f"CANCEL_OTHERS: Failed to cancel step {step.step_id}: {e}",
                        extra={"ticket_id": ticket.ticket_id, "error": str(e)}
                    )
            
            # Update branch states for other branches to CANCELLED
            try:
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                active_branches = ticket.active_branches or []
                updated = False
                
                for i, branch in enumerate(active_branches):
                    if branch.branch_id in other_branch_ids and branch.state not in [StepState.COMPLETED, StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                        active_branches[i] = BranchState(
                            branch_id=branch.branch_id,
                            branch_name=branch.branch_name,
                            parent_fork_step_id=branch.parent_fork_step_id,
                            state=StepState.CANCELLED,
                            current_step_id=branch.current_step_id,
                            started_at=branch.started_at,
                            completed_at=now,
                            outcome="CANCELLED"
                        )
                        updated = True
                        logger.info(
                            f"CANCEL_OTHERS: Marked branch '{branch.branch_name}' ({branch.branch_id}) as CANCELLED",
                            extra={"ticket_id": ticket.ticket_id}
                        )
                
                if updated:
                    self.ticket_repo.update_ticket(
                        ticket.ticket_id,
                        {"active_branches": [b.model_dump(mode="json") for b in active_branches]},
                        expected_version=ticket.version
                    )
            except Exception as e:
                logger.error(
                    f"CANCEL_OTHERS: Failed to update branch states: {e}",
                    extra={"ticket_id": ticket.ticket_id, "error": str(e)}
                )
            
            logger.info(
                f"CANCEL_OTHERS: Completed. Cancelled {cancelled_count} steps in {len(other_branch_ids)} branches",
                extra={
                    "ticket_id": ticket.ticket_id,
                    "cancelled_count": cancelled_count,
                    "other_branches": other_branch_ids
                }
            )
            
            return cancelled_count
            
        except Exception as e:
            logger.error(
                f"CANCEL_OTHERS: Unexpected error during cancellation: {e}",
                extra={"ticket_id": ticket.ticket_id, "error": str(e)}
            )
            raise
    
    def _are_all_branch_steps_completed(
        self,
        ticket: Ticket,
        branch_id: str,
        workflow_version: WorkflowVersion
    ) -> bool:
        """Check if all steps in a branch are completed"""
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        branch_steps = [step for step in all_steps if getattr(step, 'branch_id', None) == branch_id]
        
        logger.info(
            f"_are_all_branch_steps_completed: branch_id={branch_id}, found {len(branch_steps)} steps",
            extra={"ticket_id": ticket.ticket_id}
        )
        
        if not branch_steps:
            logger.warning(
                f"_are_all_branch_steps_completed: no steps found for branch {branch_id}",
                extra={"ticket_id": ticket.ticket_id}
            )
            return False
        
        # Check if all steps in the branch are completed, rejected, cancelled, or skipped
        for step in branch_steps:
            logger.debug(
                f"_are_all_branch_steps_completed: step {step.step_name} state={step.state}",
                extra={"ticket_id": ticket.ticket_id, "step_id": step.step_id}
            )
            if step.state not in [StepState.COMPLETED, StepState.REJECTED, StepState.CANCELLED, StepState.SKIPPED]:
                # For approval steps, check if all approval tasks are decided
                if step.step_type == StepType.APPROVAL_STEP:
                    approval_tasks = self.ticket_repo.get_approval_tasks_for_step(step.ticket_step_id)
                    if approval_tasks:
                        all_decided = all(
                            task.decision in [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED, ApprovalDecision.SKIPPED]
                            for task in approval_tasks
                        )
                        if not all_decided:
                            logger.info(
                                f"_are_all_branch_steps_completed: step {step.step_name} has undecided tasks",
                                extra={"ticket_id": ticket.ticket_id, "step_id": step.step_id}
                            )
                            return False
                    else:
                        logger.info(
                            f"_are_all_branch_steps_completed: step {step.step_name} has no approval tasks",
                            extra={"ticket_id": ticket.ticket_id, "step_id": step.step_id}
                        )
                        return False
                else:
                    logger.info(
                        f"_are_all_branch_steps_completed: step {step.step_name} not in terminal state: {step.state}",
                        extra={"ticket_id": ticket.ticket_id, "step_id": step.step_id}
                    )
                    return False
        
        logger.info(
            f"_are_all_branch_steps_completed: all {len(branch_steps)} steps are in terminal state",
            extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id}
        )
        return True
    
    def _mark_branch_completed(
        self,
        ticket: Ticket,
        last_step: TicketStep,
        actor: ActorContext,
        correlation_id: str,
        workflow_version: Optional[WorkflowVersion] = None
    ) -> None:
        """Mark a parallel branch as completed - only if all steps in the branch are completed"""
        branch_id = getattr(last_step, 'branch_id', None)
        logger.info(
            f"_mark_branch_completed called: branch_id={branch_id}, last_step={last_step.step_id}",
            extra={"ticket_id": ticket.ticket_id}
        )
        
        if not branch_id:
            logger.warning(f"_mark_branch_completed: no branch_id on step {last_step.step_id}")
            return
        
        # Verify all steps in the branch are completed before marking branch as completed
        if workflow_version:
            all_completed = self._are_all_branch_steps_completed(ticket, branch_id, workflow_version)
            logger.info(
                f"_mark_branch_completed: _are_all_branch_steps_completed returned {all_completed}",
                extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id}
            )
            if not all_completed:
                logger.warning(
                    f"Branch {branch_id} not all steps completed yet, not marking branch as completed",
                    extra={"ticket_id": ticket.ticket_id, "branch_id": branch_id, "last_step": last_step.step_id}
                )
                return
        
        now = utc_now()
        
        # Update branch state with retry for concurrency
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Refresh ticket to get latest version (parallel branches may have updated it)
                ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                active_branches = ticket.active_branches or []
                
                for i, branch in enumerate(active_branches):
                    if branch.branch_id == branch_id:
                        active_branches[i] = BranchState(
                            branch_id=branch.branch_id,
                            branch_name=branch.branch_name,
                            parent_fork_step_id=branch.parent_fork_step_id,
                            state=StepState.COMPLETED,
                            current_step_id=None,  # Clear current_step_id when branch is completed
                            started_at=branch.started_at,
                            completed_at=now,
                            outcome="COMPLETED"
                        )
                        break
                
                self.ticket_repo.update_ticket(
                    ticket.ticket_id,
                    {"active_branches": [b.model_dump(mode="json") for b in active_branches]},
                    expected_version=ticket.version
                )
                break
            except ConcurrencyError:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to mark branch completed after {max_retries} attempts")
                    raise
                logger.warning(f"Concurrency conflict on branch completion, retrying (attempt {attempt + 1})")
        
        # Audit
        self.audit_writer.write_event(
            ticket_id=ticket.ticket_id,
            ticket_step_id=last_step.ticket_step_id,
            event_type=AuditEventType.BRANCH_COMPLETED,
            actor=actor,
            details={
                "branch_id": branch_id,
                "branch_name": getattr(last_step, 'branch_name', '')
            },
            correlation_id=correlation_id
        )
        
        # After marking branch as completed, check if join can proceed
        # This handles the case where a branch completes and we need to check join
        if workflow_version:
            parent_fork_id = getattr(last_step, 'parent_fork_step_id', None)
            if parent_fork_id:
                # Find the join step for this fork
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                for step in all_steps:
                    if step.step_type == StepType.JOIN_STEP:
                        join_step_def = self._find_step_definition(step.step_id, workflow_version)
                        if join_step_def and join_step_def.get("source_fork_step_id") == parent_fork_id:
                            # Refresh ticket to get latest branch states
                            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
                            
                            # Check if join can proceed (regardless of join step state)
                            if self._check_join_completion(ticket, step, join_step_def, workflow_version):
                                logger.info(
                                    f"Join step {step.step_id} can proceed after branch {branch_id} completion",
                                    extra={"ticket_id": ticket.ticket_id, "join_step": step.step_id, "branch_id": branch_id}
                                )
                                
                                # If join step is NOT_STARTED, activate it first
                                if step.state == StepState.NOT_STARTED:
                                    logger.info(
                                        f"Activating join step {step.step_id} as it can proceed",
                                        extra={"ticket_id": ticket.ticket_id, "join_step": step.step_id}
                                    )
                                    self._activate_step(ticket, step, workflow_version, actor, correlation_id)
                                elif step.state == StepState.ACTIVE:
                                    # Join step is active, proceed with transition
                                    self._transition_after_join(ticket, step, workflow_version, actor, correlation_id)
                                # If COMPLETED, already transitioned - nothing to do
                            else:
                                logger.debug(
                                    f"Join step {step.step_id} cannot proceed yet - waiting for more branches",
                                    extra={"ticket_id": ticket.ticket_id, "join_step": step.step_id, "branch_id": branch_id}
                                )
                            break
        
        # After marking branch complete, check if there's a pending NOTIFY to activate
        # This handles the ANY/MAJORITY case where JOIN already proceeded but NOTIFY was deferred
        if workflow_version:
            ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
            if ticket.pending_end_step_id:
                self._try_activate_pending_notify(ticket, workflow_version, actor, correlation_id)
    
    def _validate_form_values(
        self,
        form_values: Dict[str, Any],
        field_definitions: List[Dict[str, Any]],
        sections: List[Dict[str, Any]] = None
    ) -> List[str]:
        """
        Validate form values against field definitions.
        
        Returns a list of validation error messages.
        
        Args:
            form_values: The form values to validate
            field_definitions: List of field definitions
            sections: Optional list of section definitions (to handle repeating sections)
        """
        import re
        
        errors = []
        sections = sections or []
        
        # Build a map of section_id -> section for quick lookup
        section_map = {s.get("section_id"): s for s in sections}
        
        # Group fields by section
        fields_by_section = {}
        ungrouped_fields = []
        for field in field_definitions:
            section_id = field.get("section_id")
            if section_id:
                if section_id not in fields_by_section:
                    fields_by_section[section_id] = []
                fields_by_section[section_id].append(field)
            else:
                ungrouped_fields.append(field)
        
        # Validate fields in repeating sections
        for section_id, section_fields in fields_by_section.items():
            section = section_map.get(section_id, {})
            is_repeating = section.get("is_repeating", False)
            
            if is_repeating:
                # For repeating sections, values are in form_values["__section_<sectionId>"]
                section_key = f"__section_{section_id}"
                rows = form_values.get(section_key, [])
                
                if not isinstance(rows, list):
                    rows = []
                
                # Check minimum rows requirement
                min_rows = section.get("min_rows", 0) or 0
                section_title = section.get("section_title", f"Section {section_id}")
                if min_rows > 0 and len(rows) < min_rows:
                    errors.append(
                        f"{section_title} requires at least {min_rows} row{'s' if min_rows > 1 else ''}"
                    )
                
                # Validate each row
                for row_index, row in enumerate(rows):
                    row_label = f"Row {row_index + 1}"
                    for field in section_fields:
                        field_errors = self._validate_single_field(
                            field, row, form_values, row_label, row
                        )
                        errors.extend(field_errors)
            else:
                # Non-repeating section - validate normally
                for field in section_fields:
                    field_errors = self._validate_single_field(field, form_values, form_values)
                    errors.extend(field_errors)
        
        # Validate ungrouped fields
        for field in ungrouped_fields:
            field_errors = self._validate_single_field(field, form_values, form_values)
            errors.extend(field_errors)
        
        return errors
    
    def _validate_single_field(
        self,
        field: Dict[str, Any],
        value_source: Dict[str, Any],
        all_form_values: Dict[str, Any],
        row_label: str = None,
        row_context: Dict[str, Any] = None
    ) -> List[str]:
        """
        Validate a single field.
        
        Args:
            field: Field definition
            value_source: Where to look up the field value (row dict for repeating sections)
            all_form_values: All form values (for conditional requirements referencing other fields)
            row_label: Optional label for error messages in repeating sections
            row_context: Optional row context for conditional requirements in repeating sections
        """
        import re
        
        errors = []
        
        field_key = field.get("field_key")
        field_label = field.get("field_label", field_key)
        field_type = field.get("field_type", "TEXT")
        static_required = field.get("required", False)
        validation = field.get("validation", {}) or {}
        conditional_requirements = field.get("conditional_requirements", []) or []
        
        # Determine if field is required (static or conditional)
        is_required = self._is_field_required(
            static_required, conditional_requirements, all_form_values, row_context
        )
        
        value = value_source.get(field_key)
        
        # Check if value is empty
        is_empty = (
            value is None or 
            value == "" or 
            (isinstance(value, list) and len(value) == 0)
        )
        
        # Required check
        if is_required and is_empty:
            label = f"{field_label} ({row_label})" if row_label else field_label
            errors.append(f"{label} is required")
            return errors
        
        # Skip further validation if empty
        if is_empty:
            return errors
        
        # Text length validation (for TEXT and TEXTAREA)
        if field_type in ("TEXT", "TEXTAREA"):
            text_value = str(value)
            char_count = len(text_value)
            
            min_length = validation.get("min_length")
            max_length = validation.get("max_length")
            regex_pattern = validation.get("regex_pattern")
            
            if min_length and char_count < min_length:
                label = f"{field_label} ({row_label})" if row_label else field_label
                errors.append(
                    f"{label} must be at least {min_length} characters (currently {char_count})"
                )
            
            if max_length and char_count > max_length:
                label = f"{field_label} ({row_label})" if row_label else field_label
                errors.append(
                    f"{label} must not exceed {max_length} characters (currently {char_count})"
                )
            
            if regex_pattern:
                try:
                    if not re.match(regex_pattern, text_value):
                        label = f"{field_label} ({row_label})" if row_label else field_label
                        errors.append(f"{label} format is invalid")
                except re.error:
                    # Invalid regex pattern - skip validation
                    logger.warning(f"Invalid regex pattern for field {field_key}: {regex_pattern}")
        
        # Number validation
        elif field_type == "NUMBER":
            try:
                num_value = float(value) if not isinstance(value, (int, float)) else value
                
                min_value = validation.get("min_value")
                max_value = validation.get("max_value")
                
                if min_value is not None and num_value < min_value:
                    label = f"{field_label} ({row_label})" if row_label else field_label
                    errors.append(f"{label} must be at least {min_value}")
                
                if max_value is not None and num_value > max_value:
                    label = f"{field_label} ({row_label})" if row_label else field_label
                    errors.append(f"{label} must not exceed {max_value}")
            except (ValueError, TypeError):
                label = f"{field_label} ({row_label})" if row_label else field_label
                errors.append(f"{label} must be a valid number")
        
        # Date validation
        elif field_type == "DATE":
            date_error = self._validate_date_field(
                value, field_label, validation, conditional_requirements,
                all_form_values, row_context, row_label
            )
            if date_error:
                errors.append(date_error)
        
        return errors
    
    def _is_field_required(
        self,
        static_required: bool,
        conditional_requirements: List[Dict[str, Any]],
        form_values: Dict[str, Any],
        row_context: Dict[str, Any] = None
    ) -> bool:
        """
        Determine if a field is required based on static flag and conditional rules.
        
        Conditional rules are evaluated in order. First matching rule wins.
        If no rules match, the static required flag is used.
        Supports compound conditions (AND/OR logic with multiple conditions).
        
        Args:
            static_required: The static required flag from field definition
            conditional_requirements: List of conditional requirement rules
            form_values: All form values (top-level)
            row_context: For repeating sections, the current row's values
        """
        if not conditional_requirements:
            return static_required
        
        for rule in conditional_requirements:
            when = rule.get("when", {})
            then = rule.get("then", {})
            
            # Check if the rule matches (supports compound conditions)
            if self._evaluate_conditional_rule(when, form_values, row_context):
                # This rule matches, return its 'required' setting
                return then.get("required", static_required)
        
        # No conditional rules matched, use static required flag
        return static_required
    
    def _get_source_value(
        self,
        field_key: str,
        form_values: Dict[str, Any],
        row_context: Dict[str, Any] = None
    ) -> Any:
        """Get the value of a source field for conditional evaluation."""
        if row_context and field_key in row_context:
            return row_context.get(field_key)
        return form_values.get(field_key)
    
    def _evaluate_single_condition(
        self,
        condition: Dict[str, Any],
        form_values: Dict[str, Any],
        row_context: Dict[str, Any] = None
    ) -> bool:
        """Evaluate a single condition against form values."""
        field_key = condition.get("field_key")
        operator = condition.get("operator", "equals")
        expected_value = condition.get("value")
        
        actual_value = self._get_source_value(field_key, form_values, row_context)
        return self._evaluate_condition(operator, actual_value, expected_value)
    
    def _evaluate_conditional_rule(
        self,
        when: Dict[str, Any],
        form_values: Dict[str, Any],
        row_context: Dict[str, Any] = None
    ) -> bool:
        """
        Evaluate a conditional rule's 'when' clause.
        Supports compound conditions (AND/OR with multiple conditions).
        """
        # Evaluate the primary condition
        primary_result = self._evaluate_single_condition(when, form_values, row_context)
        
        # Check for compound conditions
        additional_conditions = when.get("conditions") or []
        if not additional_conditions:
            return primary_result
        
        # Get logic (default: AND)
        logic = when.get("logic", "AND")
        
        # Evaluate all conditions including primary
        all_results = [primary_result]
        for condition in additional_conditions:
            all_results.append(self._evaluate_single_condition(condition, form_values, row_context))
        
        # Apply AND or OR logic
        if logic == "AND":
            return all(all_results)
        else:  # OR
            return any(all_results)
    
    def _evaluate_condition(
        self,
        operator: str,
        actual_value: Any,
        expected_value: Any
    ) -> bool:
        """Evaluate a conditional requirement condition."""
        if operator == "equals":
            return actual_value == expected_value
        elif operator == "not_equals":
            return actual_value != expected_value
        elif operator == "in":
            if isinstance(expected_value, list):
                return actual_value in expected_value
            return False
        elif operator == "not_in":
            if isinstance(expected_value, list):
                return actual_value not in expected_value
            return True
        elif operator == "is_empty":
            return actual_value is None or actual_value == "" or (isinstance(actual_value, list) and len(actual_value) == 0)
        elif operator == "is_not_empty":
            return actual_value is not None and actual_value != "" and not (isinstance(actual_value, list) and len(actual_value) == 0)
        else:
            return False
    
    def _validate_date_field(
        self,
        value: str,
        field_label: str,
        validation: Dict[str, Any],
        conditional_requirements: List[Dict[str, Any]],
        all_form_values: Dict[str, Any],
        row_context: Dict[str, Any] = None,
        row_label: str = None
    ) -> Optional[str]:
        """
        Validate a DATE field against date validation rules.
        
        Checks both static validation (field.validation.date_validation) and
        conditional date validation (conditional_requirements.then.date_validation).
        
        Returns error message if validation fails, None if valid.
        """
        from datetime import datetime, date
        
        # Parse the date value
        try:
            if isinstance(value, date):
                date_value = value
            elif isinstance(value, datetime):
                date_value = value.date()
            elif isinstance(value, str):
                # Try ISO format first
                date_value = datetime.strptime(value.split('T')[0], '%Y-%m-%d').date()
            else:
                return None  # Skip validation for unexpected types
        except (ValueError, TypeError):
            label = f"{field_label} ({row_label})" if row_label else field_label
            return f"{label} has an invalid date format"
        
        today = date.today()
        
        # Default: all dates allowed
        allow_past_dates = True
        allow_today = True
        allow_future_dates = True
        
        # First, apply static date validation from field.validation.date_validation
        date_validation = validation.get("date_validation")
        if date_validation:
            allow_past_dates = date_validation.get("allow_past_dates", True) is not False
            allow_today = date_validation.get("allow_today", True) is not False
            allow_future_dates = date_validation.get("allow_future_dates", True) is not False
        
        # Then, check conditional requirements for date-specific validation
        for rule in conditional_requirements:
            when = rule.get("when", {})
            
            # Use compound condition evaluator (supports AND/OR)
            if self._evaluate_conditional_rule(when, all_form_values, row_context):
                # Rule matched - check for date_validation in then clause
                then = rule.get("then", {})
                rule_date_validation = then.get("date_validation")
                if rule_date_validation:
                    allow_past_dates = rule_date_validation.get("allow_past_dates", True) is not False
                    allow_today = rule_date_validation.get("allow_today", True) is not False
                    allow_future_dates = rule_date_validation.get("allow_future_dates", True) is not False
                break  # First matching rule wins
        
        # Validate the date
        label = f"{field_label} ({row_label})" if row_label else field_label
        
        if date_value < today and not allow_past_dates:
            return f"{label}: past dates are not allowed"
        
        if date_value == today and not allow_today:
            return f"{label}: today's date is not allowed"
        
        if date_value > today and not allow_future_dates:
            return f"{label}: future dates are not allowed"
        
        return None  # Validation passed
    
    def _link_attachments_to_ticket(
        self,
        ticket_id: str,
        attachment_ids: List[str]
    ) -> None:
        """
        Link attachments to a ticket by moving them from temp folder
        and updating their ticket_id in the database.
        """
        from ..services.attachment_service import AttachmentService
        
        logger.info(f"Linking {len(attachment_ids)} attachments to ticket {ticket_id}: {attachment_ids}")
        
        attachment_service = AttachmentService()
        for att_id in attachment_ids:
            try:
                attachment_service.move_temp_attachment(att_id, ticket_id)
                logger.info(f"Successfully linked attachment {att_id} to ticket {ticket_id}")
            except Exception as e:
                logger.error(f"Failed to link attachment {att_id} to ticket {ticket_id}: {e}", exc_info=True)
    
    def _complete_ticket(
        self,
        ticket: Ticket,
        actor: ActorContext,
        correlation_id: str
    ) -> None:
        """Complete ticket and cancel any remaining orphan steps (from incomplete branches)"""
        now = utc_now()
        
        # Refresh ticket to get latest version
        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
        
        # Cancel all remaining non-terminal steps (orphan tasks/approvals in branches)
        # This can happen with ANY/MAJORITY join modes where not all branches complete
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
        cancellable_states = {StepState.NOT_STARTED, StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL}
        
        for remaining_step in all_steps:
            if remaining_step.state in cancellable_states:
                new_state = StepState.CANCELLED
                try:
                    # Re-fetch step to get latest version
                    step_latest = self.ticket_repo.get_step(remaining_step.ticket_step_id)
                    if step_latest and step_latest.state in cancellable_states:
                        self.ticket_repo.update_step(
                            remaining_step.ticket_step_id,
                            {
                                "state": new_state.value,
                                "outcome": "CANCELLED",
                                "completed_at": now
                            },
                            expected_version=step_latest.version
                        )
                        logger.info(
                            f"Cancelled orphan step {remaining_step.step_id} (was {remaining_step.state.value})",
                            extra={"ticket_id": ticket.ticket_id, "step_id": remaining_step.step_id}
                        )
                except Exception as e:
                    logger.warning(f"Could not cancel orphan step {remaining_step.step_id}: {e}")
        
        # Re-fetch ticket version after step updates
        ticket = self.ticket_repo.get_ticket_or_raise(ticket.ticket_id)
        
        self.ticket_repo.update_ticket(
            ticket.ticket_id,
            {
                "status": TicketStatus.COMPLETED.value,
                "completed_at": now
            },
            expected_version=ticket.version
        )
        
        self.audit_writer.write_ticket_completed(
            ticket_id=ticket.ticket_id,
            actor=actor,
            correlation_id=correlation_id
        )
    
    # =========================================================================
    # Response Building
    # =========================================================================
    
    def _build_action_response(
        self,
        ticket_id: str,
        actor: ActorContext
    ) -> Dict[str, Any]:
        """Build response after action"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        
        # Get current step
        current_step = None
        for step in steps:
            if step.step_id == ticket.current_step_id:
                current_step = step
                break
        
        # Get actionable tasks
        actionable_tasks = []
        for step in steps:
            actions = self.permission_guard.get_available_actions(actor, ticket, step)
            if actions:
                actionable_tasks.append({
                    "ticket_step_id": step.ticket_step_id,
                    "step_id": step.step_id,
                    "step_name": step.step_name,
                    "step_type": step.step_type.value,
                    "state": step.state.value,
                    "available_actions": actions,
                    # Branch tracking
                    "branch_id": step.branch_id,
                    "branch_name": step.branch_name,
                    # Sub-workflow tracking
                    "parent_sub_workflow_step_id": step.parent_sub_workflow_step_id,
                    "from_sub_workflow_name": step.from_sub_workflow_name,
                })
        
        # Get recent audit events
        from ..repositories.audit_repo import AuditRepository
        audit_repo = AuditRepository()
        recent_events = audit_repo.get_events_for_ticket(ticket_id, limit=5)
        
        return {
            "ticket": ticket.model_dump(mode="json"),
            "current_step": current_step.model_dump(mode="json") if current_step else None,
            "actionable_tasks": actionable_tasks,
            "newest_audit_events": [e.model_dump(mode="json") for e in recent_events]
        }
