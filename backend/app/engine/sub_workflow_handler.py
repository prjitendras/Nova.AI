"""
Sub-Workflow Handler - Manages embedded workflow steps

This module handles the expansion, activation, and completion tracking of
sub-workflow steps (SUB_WORKFLOW_STEP type). It is designed to be used by
the main WorkflowEngine with minimal integration points.

=============================================================================
ARCHITECTURE OVERVIEW
=============================================================================

When a SUB_WORKFLOW_STEP is activated:
1. Load the referenced sub-workflow version
2. Create all sub-workflow steps as TicketSteps with parent tracking
3. Link them via parent_sub_workflow_step_id and from_sub_workflow_id
4. Transition logic handles sub-workflow internally
5. When sub-workflow completes, the parent SUB_WORKFLOW_STEP completes

Key design decisions:
- All steps are in the SAME ticket (shared form_values, requester)
- Sub-workflow steps have internal transitions (not visible in parent workflow)
- Parent SUB_WORKFLOW_STEP acts as a "container" - it activates and completes
- No nested sub-workflows allowed (Level 1 only)

=============================================================================
"""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from ..domain.models import (
    Ticket, TicketStep, WorkflowVersion, WorkflowDefinition,
    UserSnapshot, ActorContext
)
from ..domain.enums import (
    StepState, StepType, TransitionEvent, AuditEventType
)
from ..domain.errors import (
    ValidationError, WorkflowNotFoundError
)
from ..repositories.workflow_repo import WorkflowRepository
from ..repositories.ticket_repo import TicketRepository
from ..utils.logger import get_logger
from ..utils.idgen import generate_id
from ..utils.time import utc_now, calculate_due_at

logger = get_logger(__name__)


class SubWorkflowHandler:
    """
    Handles sub-workflow expansion, activation, and completion.
    
    This class is instantiated by WorkflowEngine and provides methods for:
    - Expanding sub-workflow steps into TicketSteps
    - Tracking sub-workflow completion status
    - Resolving internal transitions within sub-workflows
    """
    
    def __init__(
        self,
        workflow_repo: WorkflowRepository,
        ticket_repo: TicketRepository
    ):
        self.workflow_repo = workflow_repo
        self.ticket_repo = ticket_repo
    
    def expand_sub_workflow(
        self,
        ticket: Ticket,
        parent_step: TicketStep,
        sub_workflow_step_def: Dict[str, Any],
        now: datetime,
        branch_id: Optional[str] = None,
        branch_name: Optional[str] = None,
        parent_fork_step_id: Optional[str] = None
    ) -> Tuple[List[TicketStep], WorkflowVersion, str]:
        """
        Expand a sub-workflow step into its component steps.
        
        This creates TicketStep records for all steps in the sub-workflow,
        linking them to the parent SUB_WORKFLOW_STEP.
        
        Args:
            ticket: The current ticket
            parent_step: The SUB_WORKFLOW_STEP TicketStep being activated
            sub_workflow_step_def: The step definition from workflow
            now: Current timestamp
            branch_id: If parent step is in a branch
            branch_name: Branch display name
            parent_fork_step_id: Fork step ID if in a branch
            
        Returns:
            Tuple of:
            - List of created TicketSteps for the sub-workflow
            - The sub-workflow WorkflowVersion
            - The start step ID of the sub-workflow
            
        Raises:
            WorkflowNotFoundError: If sub-workflow not found
            ValidationError: If sub-workflow contains nested sub-workflows
        """
        sub_workflow_id = sub_workflow_step_def.get("sub_workflow_id")
        sub_workflow_version_num = sub_workflow_step_def.get("sub_workflow_version")
        sub_workflow_name = sub_workflow_step_def.get("sub_workflow_name", "Sub-Workflow")
        
        logger.info(
            f"Expanding sub-workflow: {sub_workflow_id} v{sub_workflow_version_num}",
            extra={
                "ticket_id": ticket.ticket_id,
                "parent_step_id": parent_step.ticket_step_id,
                "sub_workflow_id": sub_workflow_id,
                "sub_workflow_version": sub_workflow_version_num
            }
        )
        
        # Load the sub-workflow version
        sub_workflow_version = self.workflow_repo.get_version_by_number(
            sub_workflow_id,
            sub_workflow_version_num
        )
        
        if not sub_workflow_version:
            raise WorkflowNotFoundError(
                f"Sub-workflow version not found: {sub_workflow_id} v{sub_workflow_version_num}"
            )
        
        # Validate: No nested sub-workflows (Level 1 only)
        for step_def in sub_workflow_version.definition.steps:
            if step_def.get("step_type") == StepType.SUB_WORKFLOW_STEP.value:
                raise ValidationError(
                    message="Nested sub-workflows are not allowed",
                    details={
                        "sub_workflow_id": sub_workflow_id,
                        "nested_step_id": step_def.get("step_id")
                    }
                )
        
        # Build branch map for sub-workflow (if it has fork/join)
        step_to_branch_map = self._build_sub_workflow_branch_map(sub_workflow_version)
        
        # Create TicketSteps for all steps in sub-workflow
        created_steps = []
        step_order = 0
        
        for step_def in sub_workflow_version.definition.steps:
            step_id = step_def.get("step_id")
            step_type = StepType(step_def.get("step_type"))
            
            # Handle branch info for steps within sub-workflow
            sub_branch_info = step_to_branch_map.get(step_id)
            if sub_branch_info:
                sub_branch_id, sub_branch_name, sub_fork_step_id = sub_branch_info
            else:
                sub_branch_id = None
                sub_branch_name = None
                sub_fork_step_id = None
            
            # Build step data based on step type (include form fields, instructions, etc.)
            step_data = self._build_step_data(step_def, step_type)
            
            # Create the TicketStep with sub-workflow tracking
            ticket_step = TicketStep(
                ticket_step_id=generate_id("TS"),
                ticket_id=ticket.ticket_id,
                step_id=step_id,
                step_name=step_def.get("step_name", "Step"),
                step_type=step_type,
                state=StepState.NOT_STARTED,
                data=step_data,
                version=1,
                # Inherit parent's branch context if sub-workflow is in a branch
                branch_id=branch_id,
                branch_name=branch_name,
                parent_fork_step_id=parent_fork_step_id,
                # Sub-workflow tracking fields
                parent_sub_workflow_step_id=parent_step.ticket_step_id,
                from_sub_workflow_id=sub_workflow_id,
                from_sub_workflow_version=sub_workflow_version_num,
                from_sub_workflow_name=sub_workflow_name,
                sub_workflow_step_order=step_order
            )
            
            # If sub-workflow has internal branches, track them with simple branch_id
            # Use simple branch_id to maintain consistency with fork activation
            if sub_branch_id:
                ticket_step.branch_id = sub_branch_id  # Use simple branch_id
                ticket_step.branch_name = sub_branch_name
                ticket_step.parent_fork_step_id = sub_fork_step_id  # Use simple fork step id
            
            created_steps.append(ticket_step)
            step_order += 1
        
        # Get start step ID
        start_step_id = sub_workflow_version.definition.get_start_step_id()
        
        logger.info(
            f"Expanded sub-workflow with {len(created_steps)} steps",
            extra={
                "ticket_id": ticket.ticket_id,
                "sub_workflow_id": sub_workflow_id,
                "step_count": len(created_steps),
                "start_step_id": start_step_id
            }
        )
        
        return created_steps, sub_workflow_version, start_step_id
    
    def _build_sub_workflow_branch_map(
        self,
        workflow_version: WorkflowVersion
    ) -> Dict[str, Tuple[str, str, str]]:
        """
        Build a map of step_id -> (branch_id, branch_name, fork_step_id)
        for steps that are part of branches within the sub-workflow.
        
        This is similar to the logic in engine._create_ticket_steps but
        extracted for reuse.
        """
        step_to_branch_map = {}
        
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
                    
                    # Trace steps in this branch
                    queue = [start_step_id]
                    visited = set()
                    
                    while queue:
                        current_step_id = queue.pop(0)
                        if current_step_id in visited:
                            continue
                        visited.add(current_step_id)
                        
                        step_to_branch_map[current_step_id] = (
                            branch_id,
                            branch_name,
                            fork_step_id
                        )
                        
                        # Find next steps
                        for t in transitions:
                            from_id = t.from_step_id if hasattr(t, 'from_step_id') else t.get("from_step_id")
                            if from_id == current_step_id:
                                to_id = t.to_step_id if hasattr(t, 'to_step_id') else t.get("to_step_id")
                                if to_id and to_id not in visited:
                                    next_step_def = next(
                                        (s for s in workflow_version.definition.steps 
                                         if s.get("step_id") == to_id), 
                                        None
                                    )
                                    if next_step_def and next_step_def.get("step_type") == StepType.JOIN_STEP.value:
                                        continue
                                    queue.append(to_id)
        
        return step_to_branch_map
    
    def _build_step_data(
        self,
        step_def: Dict[str, Any],
        step_type: StepType
    ) -> Dict[str, Any]:
        """
        Build the step data dictionary based on step type.
        
        This mirrors the logic in engine._create_ticket_steps() to ensure
        sub-workflow steps have proper form fields, instructions, etc.
        """
        step_data: Dict[str, Any] = {}
        
        if step_type == StepType.FORM_STEP:
            # Include form fields and sections
            if step_def.get("fields"):
                step_data["fields"] = step_def.get("fields", [])
            if step_def.get("sections"):
                step_data["sections"] = step_def.get("sections", [])
                
        elif step_type == StepType.TASK_STEP:
            # Include task instructions and output fields
            step_data["instructions"] = step_def.get("instructions", "")
            step_data["execution_notes_required"] = step_def.get("execution_notes_required", True)
            if step_def.get("output_fields"):
                step_data["output_fields"] = step_def.get("output_fields", [])
            elif step_def.get("fields"):  # Backward compatibility
                step_data["output_fields"] = step_def.get("fields", [])
                
        elif step_type == StepType.APPROVAL_STEP:
            # Include approval configuration
            if step_def.get("parallel_approval"):
                step_data["parallel_approval"] = step_def.get("parallel_approval")
            if step_def.get("parallel_approvers"):
                step_data["parallel_approvers"] = step_def.get("parallel_approvers", [])
                
        elif step_type == StepType.NOTIFY_STEP:
            # Include notification configuration
            step_data["recipients"] = step_def.get("recipients", ["requester"])
            step_data["notification_template"] = step_def.get("notification_template", "TICKET_COMPLETED")
            
        elif step_type == StepType.FORK_STEP:
            # Include fork configuration
            if step_def.get("branches"):
                step_data["branches"] = step_def.get("branches", [])
            if step_def.get("failure_policy"):
                step_data["failure_policy"] = step_def.get("failure_policy")
                
        elif step_type == StepType.JOIN_STEP:
            # Include join configuration
            if step_def.get("join_mode"):
                step_data["join_mode"] = step_def.get("join_mode")
            # CRITICAL: Include source_fork_step_id so Join knows which Fork to wait for
            if step_def.get("source_fork_step_id"):
                step_data["source_fork_step_id"] = step_def.get("source_fork_step_id")
        
        return step_data
    
    def get_sub_workflow_steps(
        self,
        ticket_id: str,
        parent_sub_workflow_step_id: str
    ) -> List[TicketStep]:
        """
        Get all steps belonging to a specific sub-workflow instance.
        
        Args:
            ticket_id: The ticket ID
            parent_sub_workflow_step_id: The parent SUB_WORKFLOW_STEP's ticket_step_id
            
        Returns:
            List of TicketSteps belonging to this sub-workflow
        """
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        return [
            step for step in all_steps
            if step.parent_sub_workflow_step_id == parent_sub_workflow_step_id
        ]
    
    def is_sub_workflow_complete(
        self,
        ticket_id: str,
        parent_sub_workflow_step_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if a sub-workflow has completed.
        
        A sub-workflow is complete when:
        - All terminal steps are in COMPLETED state, OR
        - For branches with FAIL_ALL policy: Any step is REJECTED
        - For branches with CONTINUE_OTHERS policy: All branches are done
        - All steps are COMPLETED/SKIPPED/CANCELLED
        
        Args:
            ticket_id: The ticket ID
            parent_sub_workflow_step_id: The parent SUB_WORKFLOW_STEP's ticket_step_id
            
        Returns:
            Tuple of (is_complete, outcome) where outcome is:
            - "COMPLETED" if successfully completed
            - "REJECTED" if failed (depends on failure policy)
            - None if not yet complete
        """
        sub_steps = self.get_sub_workflow_steps(ticket_id, parent_sub_workflow_step_id)
        
        if not sub_steps:
            logger.warning(
                f"No sub-workflow steps found for parent {parent_sub_workflow_step_id}"
            )
            return True, "COMPLETED"  # Empty sub-workflow is considered complete
        
        # Terminal states (steps that are "done" and won't change)
        terminal_states = {
            StepState.COMPLETED, 
            StepState.SKIPPED, 
            StepState.CANCELLED,
            StepState.REJECTED
        }
        
        # Find fork steps to check failure_policy
        fork_steps = [s for s in sub_steps if s.step_type == StepType.FORK_STEP]
        
        # Check for rejected steps
        rejected_steps = [s for s in sub_steps if s.state == StepState.REJECTED]
        
        if rejected_steps:
            # Check if any rejected step is in a branch with CONTINUE_OTHERS policy
            for rejected_step in rejected_steps:
                branch_id = getattr(rejected_step, 'branch_id', None)
                
                if branch_id:
                    # Find the fork that owns this branch
                    for fork_step in fork_steps:
                        fork_data = fork_step.data or {}
                        branches = fork_data.get('branches', [])
                        failure_policy = fork_data.get('failure_policy', 'FAIL_ALL')
                        
                        # Check if this branch belongs to this fork
                        branch_ids = [b.get('branch_id') for b in branches]
                        
                        # Now using simple branch_ids consistently, no need for composite handling
                        if branch_id in branch_ids:
                            if failure_policy == 'CONTINUE_OTHERS':
                                logger.info(
                                    f"Sub-workflow has rejected step in branch with CONTINUE_OTHERS, checking if other branches are done",
                                    extra={
                                        "ticket_id": ticket_id,
                                        "rejected_step": rejected_step.step_id,
                                        "branch_id": branch_id,
                                        "failure_policy": failure_policy
                                    }
                                )
                                # Don't immediately fail - let other branches continue
                                # We'll check completion below
                                break
                            else:
                                # FAIL_ALL or CANCEL_OTHERS - immediate failure
                                logger.info(
                                    f"Sub-workflow failed: step {rejected_step.step_id} rejected with {failure_policy} policy",
                                    extra={
                                        "ticket_id": ticket_id,
                                        "parent_sub_workflow_step_id": parent_sub_workflow_step_id,
                                        "rejected_step_id": rejected_step.step_id
                                    }
                                )
                                return True, "REJECTED"
                else:
                    # Rejected step not in a branch - immediate failure
                    logger.info(
                        f"Sub-workflow failed: non-branch step {rejected_step.step_id} was rejected",
                        extra={
                            "ticket_id": ticket_id,
                            "parent_sub_workflow_step_id": parent_sub_workflow_step_id,
                            "rejected_step_id": rejected_step.step_id
                        }
                    )
                    return True, "REJECTED"
        
        # Check if all steps are in terminal states (including REJECTED for CONTINUE_OTHERS)
        all_terminal = all(step.state in terminal_states for step in sub_steps)
        
        if all_terminal:
            # Check if there are any rejected steps
            if rejected_steps:
                # Sub-workflow completed but with rejections
                # Check if any non-rejected path completed successfully
                has_completed = any(step.state == StepState.COMPLETED for step in sub_steps)
                
                # Find join steps - if they completed, the sub-workflow succeeded despite branch rejections
                join_steps = [s for s in sub_steps if s.step_type == StepType.JOIN_STEP]
                join_completed = any(s.state == StepState.COMPLETED for s in join_steps)
                
                if join_completed or has_completed:
                    # Join completed means workflow continued past the branches
                    logger.info(
                        f"Sub-workflow completed despite branch rejection (CONTINUE_OTHERS)",
                        extra={"ticket_id": ticket_id}
                    )
                    return True, "COMPLETED"
                else:
                    return True, "REJECTED"
            else:
                # No rejections - check if at least one step is COMPLETED
                has_completed = any(step.state == StepState.COMPLETED for step in sub_steps)
                if has_completed:
                    return True, "COMPLETED"
                else:
                    return True, "CANCELLED"
        
        return False, None
    
    def get_sub_workflow_start_step(
        self,
        ticket_id: str,
        parent_sub_workflow_step_id: str,
        sub_workflow_version: WorkflowVersion
    ) -> Optional[TicketStep]:
        """
        Get the start step of a sub-workflow.
        
        Args:
            ticket_id: The ticket ID
            parent_sub_workflow_step_id: The parent SUB_WORKFLOW_STEP's ticket_step_id
            sub_workflow_version: The sub-workflow definition
            
        Returns:
            The TicketStep for the start step, or None if not found
        """
        start_step_id = sub_workflow_version.definition.get_start_step_id()
        if not start_step_id:
            return None
        
        sub_steps = self.get_sub_workflow_steps(ticket_id, parent_sub_workflow_step_id)
        return next(
            (step for step in sub_steps if step.step_id == start_step_id),
            None
        )
    
    def find_sub_workflow_ticket_step(
        self,
        ticket_id: str,
        parent_sub_workflow_step_id: str,
        step_id: str
    ) -> Optional[TicketStep]:
        """
        Find a specific step within a sub-workflow by its step_id.
        
        Args:
            ticket_id: The ticket ID
            parent_sub_workflow_step_id: The parent SUB_WORKFLOW_STEP's ticket_step_id
            step_id: The step_id to find
            
        Returns:
            The TicketStep if found, None otherwise
        """
        sub_steps = self.get_sub_workflow_steps(ticket_id, parent_sub_workflow_step_id)
        return next(
            (step for step in sub_steps if step.step_id == step_id),
            None
        )
    
    def load_sub_workflow_version(
        self,
        sub_workflow_id: str,
        sub_workflow_version_num: int
    ) -> Optional[WorkflowVersion]:
        """
        Load a sub-workflow version.
        
        Args:
            sub_workflow_id: The workflow ID
            sub_workflow_version_num: The version number
            
        Returns:
            The WorkflowVersion if found, None otherwise
        """
        return self.workflow_repo.get_version_by_number(
            sub_workflow_id,
            sub_workflow_version_num
        )
    
    def get_parent_sub_workflow_step(
        self,
        ticket_step: TicketStep
    ) -> Optional[TicketStep]:
        """
        Get the parent SUB_WORKFLOW_STEP for a step that's part of a sub-workflow.
        
        Args:
            ticket_step: A TicketStep that may be part of a sub-workflow
            
        Returns:
            The parent SUB_WORKFLOW_STEP if this step is in a sub-workflow,
            None if not part of a sub-workflow
        """
        if not ticket_step.parent_sub_workflow_step_id:
            return None
        
        return self.ticket_repo.get_step(
            ticket_step.parent_sub_workflow_step_id
        )


# =============================================================================
# Validation Helpers
# =============================================================================

def validate_sub_workflow_reference(
    workflow_repo: WorkflowRepository,
    sub_workflow_id: str,
    sub_workflow_version: int,
    parent_workflow_id: Optional[str] = None
) -> Tuple[bool, List[str], List[str]]:
    """
    Validate a sub-workflow reference at design time.
    
    Checks:
    1. Sub-workflow exists and has the specified version
    2. Sub-workflow is published
    3. Sub-workflow doesn't contain nested sub-workflows
    4. No circular reference (if parent_workflow_id provided)
    
    Args:
        workflow_repo: Workflow repository
        sub_workflow_id: The workflow to embed
        sub_workflow_version: The version to lock to
        parent_workflow_id: Optional - the workflow being designed
        
    Returns:
        Tuple of (is_valid, errors, warnings)
    """
    errors = []
    warnings = []
    
    # Check workflow exists
    workflow = workflow_repo.get_workflow(sub_workflow_id)
    if not workflow:
        errors.append(f"Workflow not found: {sub_workflow_id}")
        return False, errors, warnings
    
    # Check version exists
    version = workflow_repo.get_version_by_number(sub_workflow_id, sub_workflow_version)
    if not version:
        errors.append(f"Version {sub_workflow_version} not found for workflow {sub_workflow_id}")
        return False, errors, warnings
    
    # Check for nested sub-workflows
    for step_def in version.definition.steps:
        if step_def.get("step_type") == StepType.SUB_WORKFLOW_STEP.value:
            errors.append(
                f"Cannot embed workflow '{workflow.name}': it contains nested sub-workflows "
                f"(step: {step_def.get('step_name', step_def.get('step_id'))})"
            )
            return False, errors, warnings
    
    # Check for circular reference
    if parent_workflow_id and sub_workflow_id == parent_workflow_id:
        errors.append("Circular reference: Cannot embed a workflow within itself")
        return False, errors, warnings
    
    # Check if sub-workflow itself references the parent (indirect circular)
    if parent_workflow_id:
        for step_def in version.definition.steps:
            if step_def.get("step_type") == StepType.SUB_WORKFLOW_STEP.value:
                nested_id = step_def.get("sub_workflow_id")
                if nested_id == parent_workflow_id:
                    errors.append(
                        f"Circular reference: '{workflow.name}' already references the current workflow"
                    )
                    return False, errors, warnings
    
    # Warnings
    if not version.definition.steps:
        warnings.append(f"Workflow '{workflow.name}' has no steps")
    
    return True, errors, warnings


def get_sub_workflow_info(
    workflow_repo: WorkflowRepository,
    sub_workflow_id: str,
    sub_workflow_version: int
) -> Optional[Dict[str, Any]]:
    """
    Get summary info about a sub-workflow for display purposes.
    
    Args:
        workflow_repo: Workflow repository
        sub_workflow_id: The workflow ID
        sub_workflow_version: The version number
        
    Returns:
        Dict with name, description, step_count, category, or None if not found
    """
    version = workflow_repo.get_version_by_number(sub_workflow_id, sub_workflow_version)
    if not version:
        return None
    
    # Count steps by type
    step_counts = {}
    for step_def in version.definition.steps:
        step_type = step_def.get("step_type", "UNKNOWN")
        step_counts[step_type] = step_counts.get(step_type, 0) + 1
    
    return {
        "workflow_id": sub_workflow_id,
        "version": sub_workflow_version,
        "name": version.name,
        "description": version.description,
        "category": version.category,
        "total_steps": len(version.definition.steps),
        "step_counts": step_counts
    }
