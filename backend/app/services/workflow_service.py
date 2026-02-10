"""Workflow Service - Workflow management business logic"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from ..domain.models import (
    WorkflowTemplate, WorkflowVersion, WorkflowDefinition, UserSnapshot, ActorContext
)
from ..domain.enums import WorkflowStatus, StepType
from ..domain.errors import (
    WorkflowNotFoundError, ValidationError, WorkflowValidationError, PermissionDeniedError
)
from ..repositories.workflow_repo import WorkflowRepository
from ..utils.idgen import generate_workflow_id, generate_workflow_version_id
from ..utils.time import utc_now
from ..utils.logger import get_logger

logger = get_logger(__name__)


class WorkflowService:
    """Service for workflow operations"""
    
    def __init__(self):
        self.repo = WorkflowRepository()
    
    def create_workflow(
        self,
        name: str,
        description: Optional[str],
        category: Optional[str],
        tags: List[str],
        actor: ActorContext
    ) -> WorkflowTemplate:
        """Create a new workflow template (draft)"""
        now = utc_now()
        
        workflow = WorkflowTemplate(
            workflow_id=generate_workflow_id(),
            name=name,
            description=description,
            category=category,
            tags=tags,
            status=WorkflowStatus.DRAFT,
            definition=None,
            created_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            created_at=now,
            updated_at=now,
            version=1
        )
        
        return self.repo.create_workflow(workflow)
    
    def get_workflow(self, workflow_id: str) -> WorkflowTemplate:
        """Get workflow by ID"""
        return self.repo.get_workflow_or_raise(workflow_id)
    
    def list_workflows(
        self,
        status: Optional[WorkflowStatus] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[WorkflowTemplate]:
        """List workflows"""
        return self.repo.list_workflows(status=status, skip=skip, limit=limit)
    
    def count_workflows(self, status: Optional[WorkflowStatus] = None) -> int:
        """Count workflows"""
        return self.repo.count_workflows(status=status)
    
    def get_catalog(
        self,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[WorkflowTemplate]:
        """Get published workflows for catalog"""
        return self.repo.get_published_workflows(
            category=category,
            tags=tags,
            search=search,
            skip=skip,
            limit=limit
        )
    
    def count_catalog(
        self,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None
    ) -> int:
        """Count published workflows for catalog"""
        return self.repo.count_published_workflows(
            category=category,
            tags=tags,
            search=search
        )
    
    def save_draft(
        self,
        workflow_id: str,
        definition: Dict[str, Any],
        change_summary: Optional[str],
        actor: ActorContext
    ) -> Tuple[WorkflowTemplate, Dict[str, Any]]:
        """
        Save workflow draft definition
        
        Returns:
            Tuple of (updated workflow, validation result)
        """
        workflow = self.repo.get_workflow_or_raise(workflow_id)
        
        # Auto-fix missing branch-to-join transitions
        definition = self._auto_fix_branch_join_transitions(definition)
        
        # Validate the definition
        validation = self._validate_definition(definition)
        
        # Parse definition
        try:
            workflow_def = WorkflowDefinition.model_validate(definition)
        except Exception as e:
            validation["errors"].append({
                "type": "SCHEMA_ERROR",
                "message": f"Invalid definition schema: {str(e)}",
                "path": None
            })
            workflow_def = None
        
        # Update workflow with definition
        updates = {
            "definition": definition if workflow_def is None else workflow_def.model_dump(mode="json")
        }
        
        updated_workflow = self.repo.update_workflow(
            workflow_id=workflow_id,
            updates=updates,
            expected_version=workflow.version
        )
        
        return updated_workflow, validation
    
    def _auto_fix_branch_join_transitions(self, definition: Dict[str, Any]) -> Dict[str, Any]:
        """
        Auto-add missing transitions from branch last steps to join steps.
        This ensures all parallel branches properly connect to their join step.
        """
        steps = definition.get("steps", [])
        transitions = list(definition.get("transitions", []))
        
        # Build transition lookup: from_step_id -> list of (to_step_id, event)
        existing_transitions = set()
        from_transitions = {}
        for t in transitions:
            from_id = t.get("from_step_id")
            to_id = t.get("to_step_id")
            event = t.get("on_event")
            if from_id and to_id:
                existing_transitions.add((from_id, to_id))
                if from_id not in from_transitions:
                    from_transitions[from_id] = []
                from_transitions[from_id].append(to_id)
        
        # Build step lookup
        step_lookup = {s.get("step_id"): s for s in steps if s.get("step_id")}
        
        # For each fork step, ensure all branch last steps have transitions to join
        for step in steps:
            if step.get("step_type") != "FORK_STEP":
                continue
            
            fork_step_id = step.get("step_id")
            branches = step.get("branches", [])
            
            # Find the corresponding join step
            join_step = next(
                (s for s in steps 
                 if s.get("step_type") == "JOIN_STEP" and 
                 s.get("source_fork_step_id") == fork_step_id),
                None
            )
            
            if not join_step:
                continue  # No join for this fork, skip
            
            join_step_id = join_step.get("step_id")
            
            # For each branch, trace to find the last step
            for branch in branches:
                start_step_id = branch.get("start_step_id")
                
                if not start_step_id:
                    continue
                
                # Trace all steps in this branch to find the last one
                current_id = start_step_id
                visited = set()
                last_step_id = None
                
                while current_id and current_id not in visited:
                    visited.add(current_id)
                    current_step = step_lookup.get(current_id)
                    
                    if not current_step:
                        break
                    
                    # Stop at join step
                    if current_step.get("step_type") == "JOIN_STEP":
                        break
                    
                    last_step_id = current_id
                    
                    # Find next step
                    next_steps = from_transitions.get(current_id, [])
                    
                    # Filter out transitions to join (we want to find internal branch steps)
                    internal_next = [n for n in next_steps if n != join_step_id]
                    
                    if internal_next:
                        current_id = internal_next[0]
                    else:
                        # No more internal steps, this is the last step
                        break
                
                # Check if we need to add a transition from last_step to join
                if last_step_id and (last_step_id, join_step_id) not in existing_transitions:
                    last_step = step_lookup.get(last_step_id, {})
                    step_type = last_step.get("step_type", "TASK_STEP")
                    
                    # Determine the appropriate event based on step type
                    event_map = {
                        "FORM_STEP": "SUBMIT_FORM",
                        "APPROVAL_STEP": "APPROVE",
                        "TASK_STEP": "COMPLETE_TASK",
                        "NOTIFY_STEP": "COMPLETE_TASK",
                        "SUB_WORKFLOW_STEP": "COMPLETE_TASK",
                    }
                    event = event_map.get(step_type, "COMPLETE_TASK")
                    
                    new_transition = {
                        "transition_id": f"t_auto_{last_step_id}_to_join",
                        "from_step_id": last_step_id,
                        "to_step_id": join_step_id,
                        "on_event": event,
                        "priority": 0
                    }
                    transitions.append(new_transition)
                    existing_transitions.add((last_step_id, join_step_id))
                    
                    # Update from_transitions for subsequent branches
                    if last_step_id not in from_transitions:
                        from_transitions[last_step_id] = []
                    from_transitions[last_step_id].append(join_step_id)
                    
                    logger.info(
                        f"Auto-added transition from {last_step_id} to join {join_step_id}",
                        extra={"fork_step_id": fork_step_id, "branch_name": branch.get("branch_name")}
                    )
        
        # Update definition with fixed transitions
        definition["transitions"] = transitions
        return definition
    
    def validate_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """Validate workflow definition"""
        workflow = self.repo.get_workflow_or_raise(workflow_id)
        
        if not workflow.definition:
            return {
                "is_valid": False,
                "errors": [{"type": "NO_DEFINITION", "message": "No workflow definition found"}],
                "warnings": []
            }
        
        return self._validate_definition(workflow.definition.model_dump(mode="json"))
    
    def _validate_definition(self, definition: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate workflow definition
        
        Returns validation result with errors and warnings
        """
        errors = []
        warnings = []
        
        # Check for required fields
        if "steps" not in definition:
            errors.append({
                "type": "MISSING_STEPS",
                "message": "Workflow must have at least one step",
                "path": "steps"
            })
        elif not definition["steps"]:
            errors.append({
                "type": "EMPTY_STEPS",
                "message": "Workflow must have at least one step",
                "path": "steps"
            })
        
        if "start_step_id" not in definition:
            errors.append({
                "type": "MISSING_START",
                "message": "Workflow must have a start step",
                "path": "start_step_id"
            })
        
        if "transitions" not in definition:
            errors.append({
                "type": "MISSING_TRANSITIONS",
                "message": "Workflow must have transitions",
                "path": "transitions"
            })
        
        steps = definition.get("steps", [])
        transitions = definition.get("transitions", [])
        start_step_id = definition.get("start_step_id")
        
        # Validate steps
        step_ids = set()
        has_terminal = False
        
        for i, step in enumerate(steps):
            step_id = step.get("step_id")
            if not step_id:
                errors.append({
                    "type": "MISSING_STEP_ID",
                    "message": f"Step at index {i} is missing step_id",
                    "path": f"steps[{i}].step_id"
                })
                continue
            
            if step_id in step_ids:
                errors.append({
                    "type": "DUPLICATE_STEP_ID",
                    "message": f"Duplicate step_id: {step_id}",
                    "path": f"steps[{i}].step_id"
                })
            step_ids.add(step_id)
            
            step_type = step.get("step_type")
            if not step_type:
                errors.append({
                    "type": "MISSING_STEP_TYPE",
                    "message": f"Step {step_id} is missing step_type",
                    "path": f"steps[{i}].step_type"
                })
            
            if step.get("is_terminal"):
                has_terminal = True
            
            # Validate approval step has approver config
            if step_type == "APPROVAL_STEP":
                if not step.get("approver_resolution"):
                    errors.append({
                        "type": "MISSING_APPROVER",
                        "message": f"Approval step {step_id} must have approver_resolution",
                        "path": f"steps[{i}].approver_resolution"
                    })
            
            # Validate fork step has branches
            if step_type == "FORK_STEP":
                branches = step.get("branches", [])
                if not branches:
                    warnings.append({
                        "type": "FORK_NO_BRANCHES",
                        "message": f"Fork step {step_id} has no branches defined",
                        "path": f"steps[{i}].branches"
                    })
                for j, branch in enumerate(branches):
                    if not branch.get("start_step_id"):
                        warnings.append({
                            "type": "BRANCH_NO_START",
                            "message": f"Branch '{branch.get('branch_name', j)}' in fork {step_id} has no start step",
                            "path": f"steps[{i}].branches[{j}].start_step_id"
                        })
            
            # Validate join step has source fork
            if step_type == "JOIN_STEP":
                source_fork = step.get("source_fork_step_id")
                if not source_fork:
                    errors.append({
                        "type": "JOIN_NO_SOURCE",
                        "message": f"Join step {step_id} must specify a source fork step",
                        "path": f"steps[{i}].source_fork_step_id"
                    })
                elif source_fork not in step_ids:
                    errors.append({
                        "type": "JOIN_INVALID_SOURCE",
                        "message": f"Join step {step_id} references non-existent fork step: {source_fork}",
                        "path": f"steps[{i}].source_fork_step_id"
                    })
            
            # Validate sub-workflow step
            if step_type == "SUB_WORKFLOW_STEP":
                sub_workflow_id = step.get("sub_workflow_id")
                sub_workflow_version = step.get("sub_workflow_version")
                
                if not sub_workflow_id:
                    errors.append({
                        "type": "SUB_WORKFLOW_NO_ID",
                        "message": f"Sub-workflow step {step_id} must reference a workflow",
                        "path": f"steps[{i}].sub_workflow_id"
                    })
                elif not sub_workflow_version:
                    errors.append({
                        "type": "SUB_WORKFLOW_NO_VERSION",
                        "message": f"Sub-workflow step {step_id} must specify a version",
                        "path": f"steps[{i}].sub_workflow_version"
                    })
                else:
                    # Validate sub-workflow reference
                    sub_validation = self._validate_sub_workflow_reference(
                        sub_workflow_id, sub_workflow_version, step_id, i
                    )
                    errors.extend(sub_validation.get("errors", []))
                    warnings.extend(sub_validation.get("warnings", []))
        
        # Check start step exists
        if start_step_id and start_step_id not in step_ids:
            errors.append({
                "type": "INVALID_START",
                "message": f"Start step {start_step_id} not found in steps",
                "path": "start_step_id"
            })
        
        # Check for terminal path
        if not has_terminal:
            errors.append({
                "type": "NO_TERMINAL",
                "message": "Workflow must have at least one terminal step",
                "path": "steps"
            })
        
        # Validate transitions
        for i, transition in enumerate(transitions):
            from_step = transition.get("from_step_id")
            to_step = transition.get("to_step_id")
            
            if from_step and from_step not in step_ids:
                errors.append({
                    "type": "INVALID_TRANSITION_FROM",
                    "message": f"Transition references non-existent from_step: {from_step}",
                    "path": f"transitions[{i}].from_step_id"
                })
            
            if to_step and to_step not in step_ids:
                errors.append({
                    "type": "INVALID_TRANSITION_TO",
                    "message": f"Transition references non-existent to_step: {to_step}",
                    "path": f"transitions[{i}].to_step_id"
                })
        
        # Check for unreachable steps (warning) - pass steps for fork branch detection
        reachable = self._find_reachable_steps(start_step_id, transitions, steps) if start_step_id else set()
        unreachable = step_ids - reachable - {start_step_id} if start_step_id else set()
        
        for step_id in unreachable:
            warnings.append({
                "type": "UNREACHABLE_STEP",
                "message": f"Step {step_id} is not reachable from start",
                "path": None
            })
        
        # Check for missing branch-to-join transitions
        # This is a critical validation for fork/join workflows
        branch_to_join_warnings = self._validate_branch_to_join_transitions(steps, transitions)
        warnings.extend(branch_to_join_warnings)
        
        return {
            "is_valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def _validate_branch_to_join_transitions(
        self, 
        steps: List[Dict], 
        transitions: List[Dict]
    ) -> List[Dict]:
        """
        Validate that all branch steps have transitions to their corresponding join step.
        Returns warnings for missing transitions.
        """
        warnings = []
        
        # Build transition lookup: from_step_id -> list of to_step_ids
        from_transitions = {}
        for t in transitions:
            from_id = t.get("from_step_id")
            to_id = t.get("to_step_id")
            if from_id and to_id:
                if from_id not in from_transitions:
                    from_transitions[from_id] = []
                from_transitions[from_id].append(to_id)
        
        # Build step lookup
        step_lookup = {s.get("step_id"): s for s in steps if s.get("step_id")}
        
        # For each fork step, find all steps in its branches and check they lead to join
        for step in steps:
            if step.get("step_type") != "FORK_STEP":
                continue
            
            fork_step_id = step.get("step_id")
            branches = step.get("branches", [])
            
            # Find the corresponding join step
            join_step = next(
                (s for s in steps 
                 if s.get("step_type") == "JOIN_STEP" and 
                 s.get("source_fork_step_id") == fork_step_id),
                None
            )
            
            if not join_step:
                continue  # No join for this fork, skip
            
            join_step_id = join_step.get("step_id")
            
            # For each branch, trace all steps and check the last one has transition to join
            for branch in branches:
                branch_name = branch.get("branch_name", "")
                start_step_id = branch.get("start_step_id")
                
                if not start_step_id:
                    continue
                
                # Trace all steps in this branch
                branch_steps = []
                current_id = start_step_id
                visited = set()
                
                while current_id and current_id not in visited:
                    visited.add(current_id)
                    current_step = step_lookup.get(current_id)
                    
                    if not current_step:
                        break
                    
                    # Stop at join step
                    if current_step.get("step_type") == "JOIN_STEP":
                        break
                    
                    branch_steps.append(current_id)
                    
                    # Find next step
                    next_steps = from_transitions.get(current_id, [])
                    current_id = next_steps[0] if next_steps else None
                
                # Check if the last step in this branch has a transition to join
                if branch_steps:
                    last_step_id = branch_steps[-1]
                    destinations = from_transitions.get(last_step_id, [])
                    
                    if join_step_id not in destinations:
                        last_step = step_lookup.get(last_step_id, {})
                        warnings.append({
                            "type": "BRANCH_NO_JOIN_TRANSITION",
                            "message": f"Branch '{branch_name}' step '{last_step.get('step_name', last_step_id)}' has no transition to join step",
                            "path": f"transitions",
                            "details": {
                                "fork_step_id": fork_step_id,
                                "branch_name": branch_name,
                                "last_step_id": last_step_id,
                                "join_step_id": join_step_id
                            }
                        })
        
        return warnings
    
    def _find_reachable_steps(self, start_step_id: str, transitions: List[Dict], steps: List[Dict] = None) -> set:
        """Find all steps reachable from start, including fork branches"""
        reachable = {start_step_id}
        to_visit = [start_step_id]
        
        # Build step lookup
        step_lookup = {}
        if steps:
            step_lookup = {s.get("step_id"): s for s in steps if s.get("step_id")}
        
        while to_visit:
            current = to_visit.pop()
            
            # Check for fork branches - these are implicit transitions
            if steps:
                current_step = step_lookup.get(current)
                if current_step and current_step.get("step_type") == "FORK_STEP":
                    branches = current_step.get("branches", [])
                    for branch in branches:
                        branch_start = branch.get("start_step_id")
                        if branch_start and branch_start not in reachable:
                            reachable.add(branch_start)
                            to_visit.append(branch_start)
            
            # Follow normal transitions
            for t in transitions:
                if t.get("from_step_id") == current:
                    to_step = t.get("to_step_id")
                    if to_step and to_step not in reachable:
                        reachable.add(to_step)
                        to_visit.append(to_step)
        
        return reachable
    
    def _validate_sub_workflow_reference(
        self,
        sub_workflow_id: str,
        sub_workflow_version: int,
        step_id: str,
        step_index: int
    ) -> Dict[str, List[Dict]]:
        """
        Validate a sub-workflow reference.
        
        Checks:
        1. Sub-workflow exists
        2. Specified version is published
        3. Sub-workflow doesn't contain nested sub-workflows (Level 1 only)
        
        Returns dict with errors and warnings lists
        """
        errors = []
        warnings = []
        path_prefix = f"steps[{step_index}]"
        
        # Check workflow exists
        try:
            sub_workflow = self.repo.get_workflow(sub_workflow_id)
            if not sub_workflow:
                errors.append({
                    "type": "SUB_WORKFLOW_NOT_FOUND",
                    "message": f"Sub-workflow not found: {sub_workflow_id}",
                    "path": f"{path_prefix}.sub_workflow_id"
                })
                return {"errors": errors, "warnings": warnings}
        except Exception:
            errors.append({
                "type": "SUB_WORKFLOW_NOT_FOUND",
                "message": f"Sub-workflow not found: {sub_workflow_id}",
                "path": f"{path_prefix}.sub_workflow_id"
            })
            return {"errors": errors, "warnings": warnings}
        
        # Check version exists and is published
        try:
            version = self.repo.get_version_by_number(sub_workflow_id, sub_workflow_version)
            if not version:
                errors.append({
                    "type": "SUB_WORKFLOW_VERSION_NOT_FOUND",
                    "message": f"Version {sub_workflow_version} not found for workflow '{sub_workflow.name}'",
                    "path": f"{path_prefix}.sub_workflow_version"
                })
                return {"errors": errors, "warnings": warnings}
        except Exception:
            errors.append({
                "type": "SUB_WORKFLOW_VERSION_NOT_FOUND",
                "message": f"Version {sub_workflow_version} not found for workflow '{sub_workflow.name}'",
                "path": f"{path_prefix}.sub_workflow_version"
            })
            return {"errors": errors, "warnings": warnings}
        
        # Check for nested sub-workflows (Level 1 only)
        if version.definition and version.definition.steps:
            for sub_step in version.definition.steps:
                if sub_step.get("step_type") == StepType.SUB_WORKFLOW_STEP.value:
                    errors.append({
                        "type": "NESTED_SUB_WORKFLOW",
                        "message": (
                            f"Cannot embed workflow '{sub_workflow.name}': it contains nested sub-workflows. "
                            f"Only single-level workflow embedding is supported."
                        ),
                        "path": f"{path_prefix}.sub_workflow_id"
                    })
                    break
        
        # Check if sub-workflow has valid structure
        if version.definition:
            if not version.definition.steps:
                warnings.append({
                    "type": "SUB_WORKFLOW_EMPTY",
                    "message": f"Sub-workflow '{sub_workflow.name}' has no steps",
                    "path": f"{path_prefix}.sub_workflow_id"
                })
            elif not version.definition.get_start_step_id():
                warnings.append({
                    "type": "SUB_WORKFLOW_NO_START",
                    "message": f"Sub-workflow '{sub_workflow.name}' has no start step defined",
                    "path": f"{path_prefix}.sub_workflow_id"
                })
        
        return {"errors": errors, "warnings": warnings}
    
    def get_published_workflows_for_embedding(
        self,
        exclude_workflow_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get list of published workflows that can be embedded as sub-workflows.
        
        Returns simplified info suitable for the step library UI.
        
        Args:
            exclude_workflow_id: Optional workflow ID to exclude (to prevent self-reference)
        """
        # Get all published workflows
        published_workflows = self.repo.list_workflows(
            status=WorkflowStatus.PUBLISHED,
            skip=0,
            limit=1000  # Get all published workflows
        )
        
        result = []
        for wf in published_workflows:
            # Skip the workflow being edited (if provided)
            if exclude_workflow_id and wf.workflow_id == exclude_workflow_id:
                continue
            
            # Get the latest version
            version = self.repo.get_latest_version(wf.workflow_id)
            if not version:
                continue
            
            # Check if this workflow contains sub-workflows (if so, can't be embedded)
            has_sub_workflows = False
            step_count = 0
            step_counts = {}
            
            if version.definition and version.definition.steps:
                step_count = len(version.definition.steps)
                for step in version.definition.steps:
                    step_type = step.get("step_type", "UNKNOWN")
                    step_counts[step_type] = step_counts.get(step_type, 0) + 1
                    if step_type == StepType.SUB_WORKFLOW_STEP.value:
                        has_sub_workflows = True
            
            # Skip workflows that contain sub-workflows (Level 1 only)
            if has_sub_workflows:
                continue
            
            result.append({
                "workflow_id": wf.workflow_id,
                "name": wf.name,
                "description": wf.description,
                "category": wf.category,
                "tags": wf.tags,
                "current_version": version.version_number,
                "step_count": step_count,
                "step_counts": step_counts,
                "published_at": version.published_at.isoformat() if version.published_at else None,
                "published_by": version.published_by.display_name if version.published_by else None
            })
        
        return result
    
    def publish_workflow(
        self,
        workflow_id: str,
        actor: ActorContext
    ) -> WorkflowVersion:
        """
        Publish workflow as immutable version
        
        Raises:
            WorkflowValidationError: If validation fails
        """
        workflow = self.repo.get_workflow_or_raise(workflow_id)
        
        if not workflow.definition:
            raise WorkflowValidationError(
                "Cannot publish workflow without definition",
                details={"workflow_id": workflow_id}
            )
        
        # Validate before publishing
        validation = self._validate_definition(workflow.definition.model_dump(mode="json"))
        if not validation["is_valid"]:
            raise WorkflowValidationError(
                "Workflow validation failed",
                details={"errors": validation["errors"]}
            )
        
        # Get next version number
        version_number = self.repo.get_next_version_number(workflow_id)
        
        # Create version
        now = utc_now()
        version = WorkflowVersion(
            workflow_version_id=generate_workflow_version_id(),
            workflow_id=workflow_id,
            version_number=version_number,
            name=workflow.name,
            description=workflow.description,
            category=workflow.category,
            tags=workflow.tags,
            definition=workflow.definition,
            published_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            published_at=now
        )
        
        self.repo.create_version(version)
        
        # Update workflow status and current_version
        self.repo.update_workflow(
            workflow_id=workflow_id,
            updates={
                "status": WorkflowStatus.PUBLISHED.value,
                "current_version": version_number,  # This is what get_initial_form_chain checks!
                "published_version": version_number  # Keep for backwards compatibility
            },
            expected_version=workflow.version
        )
        
        logger.info(
            f"Published workflow version: {version.workflow_version_id}",
            extra={"workflow_id": workflow_id, "version": version_number}
        )
        
        return version
    
    def list_versions(
        self,
        workflow_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[WorkflowVersion]:
        """List versions for a workflow"""
        # Verify workflow exists
        self.repo.get_workflow_or_raise(workflow_id)
        return self.repo.list_versions(workflow_id, skip=skip, limit=limit)
    
    def get_version(self, workflow_id: str, version_number: int) -> WorkflowVersion:
        """Get specific workflow version"""
        version = self.repo.get_version_by_number(workflow_id, version_number)
        if not version:
            raise WorkflowNotFoundError(
                f"Workflow version {version_number} not found",
                details={"workflow_id": workflow_id, "version": version_number}
            )
        return version
    
    def get_latest_version(self, workflow_id: str) -> WorkflowVersion:
        """Get latest published version"""
        version = self.repo.get_latest_version(workflow_id)
        if not version:
            raise WorkflowNotFoundError(
                f"No published versions found for workflow {workflow_id}",
                details={"workflow_id": workflow_id}
            )
        return version
    
    def update_workflow_metadata(
        self, 
        workflow_id: str, 
        updates: Dict[str, Any],
        actor: ActorContext
    ) -> WorkflowTemplate:
        """
        Update workflow metadata (name, description, category, tags)
        """
        workflow = self.repo.get_workflow_or_raise(workflow_id)
        
        # Only creator can update metadata
        if workflow.created_by.email.lower() != actor.email.lower():
            if not (workflow.created_by.aad_id and workflow.created_by.aad_id == actor.aad_id):
                raise PermissionDeniedError("Only the creator can update workflow metadata")
        
        # Update workflow
        updated_workflow = self.repo.update_workflow(workflow_id, updates)
        
        logger.info(
            f"Updated workflow metadata: {workflow_id}",
            extra={"workflow_id": workflow_id, "updates": list(updates.keys())}
        )
        
        return updated_workflow
    
    def delete_workflow(self, workflow_id: str, actor: ActorContext) -> bool:
        """
        Delete a workflow
        
        Only DRAFT or ARCHIVED workflows can be deleted.
        Returns True if deleted successfully.
        """
        workflow = self.repo.get_workflow_or_raise(workflow_id)
        
        # Log warning for published workflow deletion
        if workflow.status == WorkflowStatus.PUBLISHED:
            logger.warning(
                f"Deleting published workflow: {workflow_id}",
                extra={"workflow_id": workflow_id, "actor_email": actor.email, "status": workflow.status.value}
            )
        
        # Delete the workflow
        success = self.repo.delete_workflow(workflow_id)
        
        if success:
            logger.info(
                f"Deleted workflow: {workflow_id}",
                extra={"workflow_id": workflow_id, "actor_email": actor.email}
            )
        
        return success
    
    def get_initial_form_chain(self, workflow_id: str) -> Dict[str, Any]:
        """
        Get the chain of consecutive form steps starting from the workflow's start step.
        
        This is used to implement wizard-style multi-page forms during ticket creation.
        
        Returns:
            Dict containing:
            - initial_forms: List of form step definitions in order
            - first_non_form_step_id: The step ID that should be activated after all forms
            - total_form_count: Number of initial consecutive forms
        """
        workflow = self.repo.get_workflow_or_raise(workflow_id)
        
        # Get the published version
        if not workflow.current_version:
            raise ValidationError("Workflow has no published version")
        
        version = self.repo.get_version_by_number(workflow_id, workflow.current_version)
        if not version:
            raise ValidationError("Published version not found")
        
        definition = version.definition
        steps = definition.steps
        transitions = definition.transitions
        
        # Build step lookup
        step_lookup = {s.get("step_id"): s for s in steps}
        
        # Build transition lookup (from_step_id -> list of transitions)
        transition_lookup: Dict[str, List[Dict]] = {}
        for t in transitions:
            from_id = t.from_step_id if hasattr(t, 'from_step_id') else t.get("from_step_id")
            if from_id not in transition_lookup:
                transition_lookup[from_id] = []
            transition_lookup[from_id].append(t)
        
        # Start from the start step and follow SUBMIT_FORM transitions
        initial_forms = []
        current_step_id = definition.start_step_id
        first_non_form_step_id = None
        visited = set()  # Prevent infinite loops
        
        while current_step_id and current_step_id not in visited:
            visited.add(current_step_id)
            step = step_lookup.get(current_step_id)
            
            if not step:
                break
            
            # Check if this is a form step
            if step.get("step_type") == "FORM_STEP":
                initial_forms.append(step)
                
                # Find the next step via SUBMIT_FORM transition
                step_transitions = transition_lookup.get(current_step_id, [])
                next_step_id = None
                
                for t in step_transitions:
                    event = t.on_event if hasattr(t, 'on_event') else t.get("on_event")
                    to_step = t.to_step_id if hasattr(t, 'to_step_id') else t.get("to_step_id")
                    if event == "SUBMIT_FORM":
                        next_step_id = to_step
                        break
                
                if next_step_id:
                    next_step = step_lookup.get(next_step_id)
                    if next_step and next_step.get("step_type") != "FORM_STEP":
                        # Found the first non-form step
                        first_non_form_step_id = next_step_id
                        break
                    current_step_id = next_step_id
                else:
                    # No transition found or terminal form
                    break
            else:
                # Not a form step - this is the first non-form step
                first_non_form_step_id = current_step_id
                break
        
        return {
            "initial_forms": initial_forms,
            "first_non_form_step_id": first_non_form_step_id,
            "total_form_count": len(initial_forms)
        }

    def get_consecutive_forms_from_step(
        self, 
        workflow_id: str, 
        version_number: int,
        from_step_id: str
    ) -> Dict[str, Any]:
        """
        Get chain of consecutive form steps starting from a specific step.
        
        Used for mid-workflow forms where user needs to fill multiple consecutive
        forms before the workflow can proceed to a non-form step.
        
        Args:
            workflow_id: The workflow ID
            version_number: The version number to use
            from_step_id: The step ID to start from
            
        Returns:
            Dict containing:
            - consecutive_forms: List of form step definitions in order
            - next_non_form_step_id: The step ID after all consecutive forms
            - total_form_count: Number of consecutive forms
        """
        version = self.repo.get_version_by_number(workflow_id, version_number)
        if not version:
            raise ValidationError("Workflow version not found")
        
        definition = version.definition
        steps = definition.steps
        transitions = definition.transitions
        
        # Build lookups
        step_lookup = {s.get("step_id"): s for s in steps}
        transition_lookup: Dict[str, List[Dict]] = {}
        for t in transitions:
            from_id = t.from_step_id if hasattr(t, 'from_step_id') else t.get("from_step_id")
            if from_id not in transition_lookup:
                transition_lookup[from_id] = []
            transition_lookup[from_id].append(t)
        
        # Check if the starting step is a form
        start_step = step_lookup.get(from_step_id)
        if not start_step or start_step.get("step_type") != "FORM_STEP":
            return {
                "consecutive_forms": [],
                "next_non_form_step_id": from_step_id,
                "total_form_count": 0
            }
        
        # Follow the chain of form steps
        consecutive_forms = []
        current_step_id = from_step_id
        next_non_form_step_id = None
        visited = set()
        
        while current_step_id and current_step_id not in visited:
            visited.add(current_step_id)
            step = step_lookup.get(current_step_id)
            
            if not step:
                break
            
            if step.get("step_type") == "FORM_STEP":
                consecutive_forms.append(step)
                
                # Find next step via SUBMIT_FORM
                step_transitions = transition_lookup.get(current_step_id, [])
                next_step_id = None
                
                for t in step_transitions:
                    event = t.on_event if hasattr(t, 'on_event') else t.get("on_event")
                    to_step = t.to_step_id if hasattr(t, 'to_step_id') else t.get("to_step_id")
                    if event == "SUBMIT_FORM":
                        next_step_id = to_step
                        break
                
                if next_step_id:
                    next_step = step_lookup.get(next_step_id)
                    if next_step and next_step.get("step_type") != "FORM_STEP":
                        next_non_form_step_id = next_step_id
                        break
                    current_step_id = next_step_id
                else:
                    break
            else:
                next_non_form_step_id = current_step_id
                break
        
        return {
            "consecutive_forms": consecutive_forms,
            "next_non_form_step_id": next_non_form_step_id,
            "total_form_count": len(consecutive_forms)
        }


