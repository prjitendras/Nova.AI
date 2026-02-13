"""Ticket Service - Ticket management business logic"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from ..domain.models import (
    Ticket, TicketStep, ApprovalTask, Assignment, InfoRequest,
    UserSnapshot, ActorContext, WorkflowVersion
)
from ..domain.enums import (
    TicketStatus, StepState, StepType, ApprovalDecision,
    AssignmentStatus, InfoRequestStatus, AuditEventType
)
from ..domain.errors import (
    TicketNotFoundError, PermissionDeniedError, InvalidStateError,
    ValidationError, WorkflowNotFoundError
)
from ..repositories.ticket_repo import TicketRepository
from ..repositories.mongo_client import get_collection
from ..repositories.workflow_repo import WorkflowRepository
from ..repositories.audit_repo import AuditRepository
from ..engine.engine import WorkflowEngine
from ..utils.idgen import generate_ticket_id
from ..utils.time import utc_now
from ..utils.logger import get_logger

logger = get_logger(__name__)


class TicketService:
    """Service for ticket operations"""
    
    def __init__(self):
        self.ticket_repo = TicketRepository()
        self.workflow_repo = WorkflowRepository()
        self.audit_repo = AuditRepository()
        self.engine = WorkflowEngine()
    
    def create_ticket(
        self,
        workflow_id: str,
        title: str,
        description: Optional[str],
        initial_form_values: Dict[str, Any],
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str,
        access_token: Optional[str] = None,
        initial_form_step_ids: Optional[List[str]] = None  # For wizard-style multi-form
    ) -> Ticket:
        """Create a new ticket from published workflow"""
        # Get latest published version
        workflow_version = self.workflow_repo.get_latest_version(workflow_id)
        if not workflow_version:
            raise WorkflowNotFoundError(
                f"No published version found for workflow {workflow_id}",
                details={"workflow_id": workflow_id}
            )
        
        # Create ticket via engine
        ticket = self.engine.create_ticket(
            workflow_version=workflow_version,
            title=title,
            description=description,
            initial_form_values=initial_form_values,
            attachment_ids=attachment_ids,
            actor=actor,
            correlation_id=correlation_id,
            access_token=access_token,
            initial_form_step_ids=initial_form_step_ids
        )
        
        return ticket
    
    def list_tickets(
        self,
        requester_email: Optional[str],
        status: Optional[TicketStatus],
        workflow_id: Optional[str],
        search: Optional[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        skip: int = 0,
        limit: int = 50,
        actor: Optional[ActorContext] = None,
        statuses: Optional[List[TicketStatus]] = None,
        requester_aad_id: Optional[str] = None,
        has_pending_cr: Optional[bool] = None
    ) -> Tuple[List[Ticket], int]:
        """List tickets with filters. Supports single status or multiple statuses."""
        tickets = self.ticket_repo.list_tickets(
            requester_email=requester_email,
            requester_aad_id=requester_aad_id,
            status=status,
            statuses=statuses,
            workflow_id=workflow_id,
            search=search,
            date_from=date_from,
            date_to=date_to,
            sort_by=sort_by,
            sort_order=sort_order,
            skip=skip,
            limit=limit,
            has_pending_cr=has_pending_cr
        )
        
        total = self.ticket_repo.count_tickets(
            requester_email=requester_email,
            requester_aad_id=requester_aad_id,
            status=status,
            statuses=statuses,
            workflow_id=workflow_id,
            search=search,
            date_from=date_from,
            date_to=date_to,
            has_pending_cr=has_pending_cr
        )
        
        return tickets, total
    
    def get_ticket_detail(
        self,
        ticket_id: str,
        actor: ActorContext
    ) -> Dict[str, Any]:
        """Get ticket with full details"""
        ticket = self.ticket_repo.get_ticket_or_raise(ticket_id)
        
        # Check view permission
        if not self.engine.permission_guard.can_view_ticket(actor, ticket):
            raise PermissionDeniedError(
                "You do not have permission to view this ticket",
                details={"ticket_id": ticket_id}
            )
        
        # Get steps
        steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        
        # Sort steps by workflow execution order (not creation order)
        steps = self._sort_steps_by_workflow_order(ticket, steps)
        
        # Get current step
        current_step = None
        if ticket.current_step_id:
            for step in steps:
                if step.step_id == ticket.current_step_id:
                    current_step = step
                    break
        
        # Get info requests
        info_requests = self.ticket_repo.get_info_requests_for_ticket(ticket_id)
        
        # Get audit events
        audit_events = self.audit_repo.get_events_for_ticket(ticket_id, limit=50)
        
        # Get actionable tasks for actor
        actionable_tasks = self._get_actionable_tasks(ticket, steps, actor)
        
        return {
            "ticket": ticket.model_dump(mode="json"),
            "current_step": current_step.model_dump(mode="json") if current_step else None,
            "steps": [s.model_dump(mode="json") for s in steps],
            "info_requests": [ir.model_dump(mode="json") for ir in info_requests],
            "audit_events": [ae.model_dump(mode="json") for ae in audit_events],
            "actionable_tasks": actionable_tasks
        }
    
    def _sort_steps_by_workflow_order(
        self,
        ticket: Ticket,
        steps: List[TicketStep]
    ) -> List[TicketStep]:
        """Sort steps by workflow execution order, handling Fork/Join branches properly"""
        try:
            # Get workflow version to determine step order
            version = self.workflow_repo.get_version(ticket.workflow_version_id)
            if not version:
                return steps
            
            definition = version.definition
            if not definition or not definition.steps:
                return steps
            
            # Build step lookup from definition
            step_defs = {s.get("step_id"): s for s in definition.steps}
            transitions = definition.transitions
            
            # Build execution order handling Fork/Join
            execution_order = []
            visited = set()
            
            def get_next_step_id(from_step_id: str) -> Optional[str]:
                """Get next step ID from transitions"""
                trans = next((t for t in transitions if t.from_step_id == from_step_id), None)
                return trans.to_step_id if trans else None
            
            def trace_branch(start_id: str, join_step_id: str = None) -> List[str]:
                """Trace a branch until join or end"""
                branch_order = []
                current = start_id
                branch_visited = set()
                
                while current and current not in branch_visited:
                    if current == join_step_id:
                        break
                    branch_visited.add(current)
                    branch_order.append(current)
                    
                    step_def = step_defs.get(current)
                    if not step_def:
                        break
                    
                    # If this is a join step, stop
                    if step_def.get("step_type") == "JOIN_STEP":
                        break
                    
                    current = get_next_step_id(current)
                
                return branch_order
            
            def process_step(step_id: str):
                """Process a step and its successors, handling forks"""
                if step_id in visited:
                    return
                
                visited.add(step_id)
                execution_order.append(step_id)
                
                step_def = step_defs.get(step_id)
                if not step_def:
                    return
                
                step_type = step_def.get("step_type")
                
                if step_type == "FORK_STEP":
                    # Process all branches from this fork
                    branches = step_def.get("branches", [])
                    
                    # Find the corresponding JOIN step
                    join_step_id = None
                    for s_def in definition.steps:
                        if s_def.get("step_type") == "JOIN_STEP" and s_def.get("source_fork_step_id") == step_id:
                            join_step_id = s_def.get("step_id")
                            break
                    
                    # Process each branch in order
                    for branch in sorted(branches, key=lambda b: b.get("order", 0)):
                        branch_start = branch.get("start_step_id")
                        if branch_start:
                            branch_steps = trace_branch(branch_start, join_step_id)
                            for bs_id in branch_steps:
                                if bs_id not in visited:
                                    visited.add(bs_id)
                                    execution_order.append(bs_id)
                    
                    # Now add the join step and continue from there
                    if join_step_id and join_step_id not in visited:
                        visited.add(join_step_id)
                        execution_order.append(join_step_id)
                        
                        # Continue from join step
                        next_after_join = get_next_step_id(join_step_id)
                        if next_after_join:
                            process_step(next_after_join)
                else:
                    # Regular step - continue to next
                    next_step = get_next_step_id(step_id)
                    if next_step:
                        process_step(next_step)
            
            # Start processing from the start step
            start_step_id = definition.start_step_id or (definition.steps[0].get("step_id") if definition.steps else None)
            if start_step_id:
                process_step(start_step_id)
            
            # Add any steps not in execution order at the end
            for step_def in definition.steps:
                step_id = step_def.get("step_id")
                if step_id and step_id not in visited:
                    execution_order.append(step_id)
            
            # Create order map
            order_map = {step_id: idx for idx, step_id in enumerate(execution_order)}
            
            # Sort steps by execution order
            return sorted(steps, key=lambda s: order_map.get(s.step_id, 9999))
        
        except Exception as e:
            # If anything fails, return original order
            logger.warning(f"Could not sort steps by workflow order: {e}")
            import traceback
            logger.warning(traceback.format_exc())
            return steps
    
    def _get_actionable_tasks(
        self,
        ticket: Ticket,
        steps: List[TicketStep],
        actor: ActorContext
    ) -> List[Dict[str, Any]]:
        """Get tasks that actor can act on"""
        actionable = []
        
        for step in steps:
            actions = self.engine.permission_guard.get_available_actions(actor, ticket, step)
            if actions:
                actionable.append({
                    "ticket_step_id": step.ticket_step_id,
                    "step_id": step.step_id,  # Include step_id for multi-form workflow support
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
        
        return actionable
    
    # =========================================================================
    # Action Methods - Delegate to Engine
    # =========================================================================
    
    def submit_form(
        self,
        ticket_id: str,
        ticket_step_id: str,
        form_values: Dict[str, Any],
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Submit form for a form step"""
        result = self.engine.handle_submit_form(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            form_values=form_values,
            attachment_ids=attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def approve(
        self,
        ticket_id: str,
        ticket_step_id: str,
        comment: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Approve an approval step"""
        result = self.engine.handle_approve(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            comment=comment,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def reject(
        self,
        ticket_id: str,
        ticket_step_id: str,
        comment: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Reject an approval step"""
        result = self.engine.handle_reject(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            comment=comment,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def skip(
        self,
        ticket_id: str,
        ticket_step_id: str,
        comment: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Skip an approval step - similar to reject but with SKIPPED status"""
        result = self.engine.handle_skip(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            comment=comment,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def reassign_approval(
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
        Reassign an approval to another person.
        
        The new approver becomes the owner of this approval step.
        Auto-onboards the new approver if not already in the system.
        """
        result = self.engine.handle_reassign_approval(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            new_approver_email=new_approver_email,
            new_approver_aad_id=new_approver_aad_id,
            new_approver_display_name=new_approver_display_name,
            reason=reason,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def complete_task(
        self,
        ticket_id: str,
        ticket_step_id: str,
        execution_notes: Optional[str],
        output_values: Dict[str, Any],
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Complete a task step"""
        result = self.engine.handle_complete_task(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            execution_notes=execution_notes,
            output_values=output_values,
            attachment_ids=attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def add_note(
        self,
        ticket_id: str,
        ticket_step_id: str,
        content: str,
        attachment_ids: Optional[List[str]],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Add a note to a task step"""
        result = self.engine.handle_add_note(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            content=content,
            attachment_ids=attachment_ids or [],
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def add_requester_note(
        self,
        ticket_id: str,
        content: str,
        attachment_ids: Optional[List[str]],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Add a requester note to a ticket (ticket-level, not step-specific)"""
        result = self.engine.handle_add_requester_note(
            ticket_id=ticket_id,
            content=content,
            attachment_ids=attachment_ids or [],
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def save_draft(
        self,
        ticket_id: str,
        ticket_step_id: str,
        draft_values: Dict[str, Any],
        execution_notes: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Save draft values for a task step without completing"""
        result = self.engine.handle_save_draft(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            draft_values=draft_values,
            execution_notes=execution_notes,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def request_info(
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
        """Request more info from requester or previous agent"""
        result = self.engine.handle_request_info(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            question_text=question_text,
            actor=actor,
            correlation_id=correlation_id,
            requested_from_email=requested_from_email,
            subject=subject,
            attachment_ids=attachment_ids or []
        )
        return result
    
    def respond_info(
        self,
        ticket_id: str,
        ticket_step_id: str,
        response_text: str,
        attachment_ids: List[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Respond to info request"""
        result = self.engine.handle_respond_info(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            response_text=response_text,
            attachment_ids=attachment_ids,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def assign_agent(
        self,
        ticket_id: str,
        ticket_step_id: str,
        agent_email: str,
        actor: ActorContext,
        correlation_id: str,
        agent_aad_id: Optional[str] = None,
        agent_display_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Assign agent to task step"""
        result = self.engine.handle_assign(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            agent_email=agent_email,
            agent_aad_id=agent_aad_id,
            agent_display_name=agent_display_name,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def reassign_agent(
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
        """Reassign agent for task step"""
        result = self.engine.handle_reassign(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            agent_email=agent_email,
            agent_aad_id=agent_aad_id,
            agent_display_name=agent_display_name,
            reason=reason,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def cancel_ticket(
        self,
        ticket_id: str,
        reason: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Cancel ticket"""
        result = self.engine.handle_cancel(
            ticket_id=ticket_id,
            reason=reason,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    # =========================================================================
    # Manager/Agent specific queries
    # =========================================================================
    
    def get_pending_approvals(
        self,
        approver_email: str,
        approver_aad_id: str = "",
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get pending approvals for an approver"""
        approval_tasks = self.ticket_repo.get_pending_approvals(
            approver_email=approver_email,
            approver_aad_id=approver_aad_id,
            skip=skip,
            limit=limit
        )
        
        result = []
        seen_ticket_step_pairs = set()  # Track (ticket_id, ticket_step_id) to prevent duplicates
        
        for task in approval_tasks:
            ticket = self.ticket_repo.get_ticket(task.ticket_id)
            step = self.ticket_repo.get_step(task.ticket_step_id)
            
            # Skip cancelled or rejected tickets - they should not appear in pending approvals
            if not ticket or ticket.status in [TicketStatus.CANCELLED, TicketStatus.REJECTED]:
                continue
            
            # Skip if step is already in a terminal state (rejected/cancelled/completed/skipped)
            if step and step.state in [StepState.REJECTED, StepState.CANCELLED, StepState.COMPLETED, StepState.SKIPPED]:
                continue
            
            # Prevent duplicates - use (ticket_id, ticket_step_id) as key
            pair_key = (task.ticket_id, task.ticket_step_id)
            if pair_key in seen_ticket_step_pairs:
                continue
            seen_ticket_step_pairs.add(pair_key)
            
            # Check if there's an open info request for this step
            has_open_info_request = False
            open_info_request = None
            if step:
                info_request = self.ticket_repo.get_open_info_request_for_step(step.ticket_step_id)
                if info_request:
                    has_open_info_request = True
                    open_info_request = {
                        "info_request_id": info_request.info_request_id,
                        "requested_from": info_request.requested_from.model_dump(mode="json") if info_request.requested_from else None,
                        "requested_at": info_request.requested_at.isoformat() if info_request.requested_at else None,
                        "subject": info_request.subject
                    }
            
            # Check if waiting for CR (workflow paused)
            is_waiting_for_cr = step and step.state == StepState.WAITING_FOR_CR
            pending_cr_info = None
            if is_waiting_for_cr and ticket.pending_change_request_id:
                cr_collection = get_collection("change_requests")
                cr_doc = cr_collection.find_one({"change_request_id": ticket.pending_change_request_id})
                if cr_doc:
                    pending_cr_info = {
                        "change_request_id": cr_doc.get("change_request_id"),
                        "requested_by": cr_doc.get("requested_by"),
                        "requested_at": cr_doc.get("requested_at"),
                        "assigned_to": cr_doc.get("assigned_to"),
                        "reason": cr_doc.get("reason")
                    }
            
            result.append({
                "approval_task": task.model_dump(mode="json"),
                "ticket": ticket.model_dump(mode="json"),
                "step": step.model_dump(mode="json") if step else None,
                "has_open_info_request": has_open_info_request,
                "open_info_request": open_info_request,
                "is_waiting_for_cr": is_waiting_for_cr,
                "pending_cr_info": pending_cr_info
            })
        
        return result
    
    def get_unassigned_tasks(
        self,
        manager_email: str,
        manager_aad_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get task steps needing assignment"""
        # Get steps waiting for assignment (ACTIVE task steps with no assignee)
        steps = self.ticket_repo.get_assigned_steps(
            assignee_email="",  # Empty means unassigned
            state=StepState.ACTIVE,
            skip=skip,
            limit=limit
        )
        
        result = []
        for step in steps:
            if step.step_type == StepType.TASK_STEP and step.assigned_to is None:
                ticket = self.ticket_repo.get_ticket(step.ticket_id)
                if not ticket:
                    continue
                    
                # Check if user can see this task:
                # Priority order:
                # 1. For branch steps: If someone approved in the branch, ONLY that approver sees it (not AD manager)
                # 2. For branch steps: If no one approved yet, show to AD manager
                # 3. For non-branch steps: Show to AD manager OR whoever approved
                
                is_manager = False
                step_branch_id = getattr(step, 'branch_id', None)
                
                # Get all steps for this ticket
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                
                if step_branch_id:
                    # For branch steps: Find the MOST RECENT approval in this branch
                    # (workflow loops: task Ã¢â€ â€™ approval Ã¢â€ â€™ task Ã¢â€ â€™ approval, only the last approver should see next task)
                    branch_approval_steps = [
                        s for s in all_steps
                        if s.step_type == StepType.APPROVAL_STEP 
                        and s.state == StepState.COMPLETED
                        and getattr(s, 'branch_id', None) == step_branch_id
                    ]
                    
                    # Sort by completed_at to find the most recent approval
                    # If completed_at is None, use a very old date as fallback
                    from datetime import datetime
                    branch_approval_steps.sort(
                        key=lambda s: s.completed_at or datetime.min,
                        reverse=True  # Most recent first
                    )
                    
                    # Check only the MOST RECENT approval
                    someone_approved_in_branch = False
                    approver_in_branch = None
                    
                    if branch_approval_steps:
                        # Only consider the most recent approval step
                        most_recent_approval = branch_approval_steps[0]
                        
                        # Check approval tasks to see who actually approved
                        approval_tasks = self.ticket_repo.get_approval_tasks_for_step(most_recent_approval.ticket_step_id)
                        for task in approval_tasks:
                            if task.decision == ApprovalDecision.APPROVED and task.approver:
                                someone_approved_in_branch = True
                                approver_in_branch = task.approver
                                # Check if current user is the approver
                                if manager_aad_id and task.approver.aad_id:
                                    if manager_aad_id == task.approver.aad_id:
                                        is_manager = True
                                if not is_manager and task.approver.email:
                                    if task.approver.email.lower() == manager_email.lower():
                                        is_manager = True
                                break  # Only check the first approved task
                        
                        # Fallback: check assigned_to if no approval tasks found
                        if not someone_approved_in_branch and most_recent_approval.assigned_to:
                            someone_approved_in_branch = True
                            approver_in_branch = most_recent_approval.assigned_to
                            # Check if current user is the approver
                            if manager_aad_id and most_recent_approval.assigned_to.aad_id:
                                if manager_aad_id == most_recent_approval.assigned_to.aad_id:
                                    is_manager = True
                            if not is_manager and most_recent_approval.assigned_to.email:
                                if most_recent_approval.assigned_to.email.lower() == manager_email.lower():
                                    is_manager = True
                    
                    # If someone approved in branch, ONLY show to that approver (not AD manager)
                    # If no one approved yet, show to AD manager
                    if not someone_approved_in_branch:
                        # No one approved yet - show to AD manager
                        if ticket.manager_snapshot:
                            if manager_aad_id and ticket.manager_snapshot.aad_id:
                                is_manager = manager_aad_id == ticket.manager_snapshot.aad_id
                            if not is_manager:
                                is_manager = ticket.manager_snapshot.email.lower() == manager_email.lower()
                else:
                    # For non-branch steps: Check if user is AD manager OR approved
                    # Check if user is the AD manager
                    if ticket.manager_snapshot:
                        if manager_aad_id and ticket.manager_snapshot.aad_id:
                            is_manager = manager_aad_id == ticket.manager_snapshot.aad_id
                        if not is_manager:
                            is_manager = ticket.manager_snapshot.email.lower() == manager_email.lower()
                    
                    # Also check if user approved any approval step
                    if not is_manager:
                        for prev_step in all_steps:
                            if prev_step.step_type == StepType.APPROVAL_STEP and prev_step.state == "COMPLETED":
                                # Check approval tasks first
                                approval_tasks = self.ticket_repo.get_approval_tasks_for_step(prev_step.ticket_step_id)
                                for task in approval_tasks:
                                    if task.decision == ApprovalDecision.APPROVED and task.approver:
                                        if manager_aad_id and task.approver.aad_id:
                                            if manager_aad_id == task.approver.aad_id:
                                                is_manager = True
                                                break
                                        if not is_manager and task.approver.email:
                                            if task.approver.email.lower() == manager_email.lower():
                                                is_manager = True
                                                break
                                
                                # Fallback to assigned_to
                                if not is_manager and prev_step.assigned_to:
                                    if manager_aad_id and prev_step.assigned_to.aad_id:
                                        if manager_aad_id == prev_step.assigned_to.aad_id:
                                            is_manager = True
                                            break
                                    if not is_manager and prev_step.assigned_to.email:
                                        if prev_step.assigned_to.email.lower() == manager_email.lower():
                                            is_manager = True
                                            break
                                
                                if is_manager:
                                    break
                
                if is_manager:
                    result.append({
                        "step": step.model_dump(mode="json"),
                        "ticket": ticket.model_dump(mode="json")
                    })
        
        return result
    
    def get_assigned_tasks(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get tasks assigned to an agent (TASK_STEP only, not FORM_STEP)
        
        Returns enhanced task data including:
        - Pending handover requests
        - Who assigned/approved the task
        - Additional metadata for better UX
        
        Includes both ACTIVE and ON_HOLD tasks so the frontend can display them
        in separate tabs.
        """
        # Filter by step_type at DB level for correct pagination
        # Include ACTIVE, ON_HOLD, WAITING_FOR states, and WAITING_FOR_CR for the My Tasks page
        # WAITING_FOR_CR tasks should still be visible but with actions disabled (except notes)
        steps = self.ticket_repo.get_assigned_steps_by_user(
            user_email=agent_email,
            user_aad_id=agent_aad_id,
            states=[
                StepState.ACTIVE, 
                StepState.ON_HOLD,
                StepState.WAITING_FOR_REQUESTER,
                StepState.WAITING_FOR_AGENT,
                StepState.WAITING_FOR_CR  # Include CR waiting state so task remains visible
            ],  # Include all active states including waiting for info and CR
            step_type=StepType.TASK_STEP,  # Filter at DB level
            skip=skip,
            limit=limit
        )
        
        result = []
        for step in steps:
            ticket = self.ticket_repo.get_ticket(step.ticket_id)
            if ticket:
                # Check for pending handover
                pending_handover = self.ticket_repo.get_pending_handover_for_step(step.ticket_step_id)
                
                # Find who assigned this task (look for the approver of previous approval step)
                assigned_by = None
                all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
                for prev_step in all_steps:
                    if prev_step.step_type == StepType.APPROVAL_STEP and prev_step.state == "COMPLETED":
                        if prev_step.assigned_to:
                            assigned_by = prev_step.assigned_to.model_dump(mode="json")
                            break
                
                # If no approver found, use ticket manager
                if not assigned_by and ticket.manager_snapshot:
                    assigned_by = ticket.manager_snapshot.model_dump(mode="json")
                
                # Check for open info request on this step
                open_info_request = self.ticket_repo.get_open_info_request_for_step(step.ticket_step_id)
                has_open_info_request = open_info_request is not None
                
                # A CR can be raised when task is ON_HOLD or ACTIVE, so check ticket.pending_change_request_id
                # not just the step state
                is_waiting_for_cr = bool(ticket.pending_change_request_id)
                pending_cr_info = None
                if is_waiting_for_cr:
                    # Get CR details for the banner
                    cr_collection = get_collection("change_requests")
                    cr_doc = cr_collection.find_one({"change_request_id": ticket.pending_change_request_id})
                    if cr_doc:
                        pending_cr_info = {
                            "change_request_id": cr_doc.get("change_request_id"),
                            "requested_by": cr_doc.get("requested_by"),
                            "requested_at": cr_doc.get("requested_at"),
                            "assigned_to": cr_doc.get("assigned_to"),
                            "reason": cr_doc.get("reason")
                        }
                
                task_data = {
                    "step": step.model_dump(mode="json"),
                    "ticket": ticket.model_dump(mode="json"),
                    "pending_handover": pending_handover.model_dump(mode="json") if pending_handover else None,
                    "assigned_by": assigned_by,
                    "has_open_info_request": has_open_info_request,
                    "open_info_request": open_info_request.model_dump(mode="json") if open_info_request else None,
                    "is_waiting_for_cr": is_waiting_for_cr,
                    "pending_cr_info": pending_cr_info,
                }
                
                result.append(task_data)
        
        return result
    
    # =========================================================================
    # Hold/Resume/Handover Operations
    # =========================================================================
    
    def hold_task(
        self,
        ticket_id: str,
        ticket_step_id: str,
        reason: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Put a task step on hold"""
        result = self.engine.handle_hold(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            reason=reason,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def resume_task(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Resume a task step from hold"""
        result = self.engine.handle_resume(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def request_handover(
        self,
        ticket_id: str,
        ticket_step_id: str,
        reason: str,
        suggested_agent_email: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Request handover of a task"""
        result = self.engine.handle_handover_request(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            reason=reason,
            suggested_agent_email=suggested_agent_email,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def decide_handover(
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
        """Decide on a handover request"""
        result = self.engine.handle_handover_decision(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            handover_request_id=handover_request_id,
            approved=approved,
            new_agent_email=new_agent_email,
            new_agent_aad_id=new_agent_aad_id,
            new_agent_display_name=new_agent_display_name,
            comment=comment,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def cancel_handover(
        self,
        ticket_id: str,
        ticket_step_id: str,
        handover_request_id: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Cancel a pending handover request"""
        result = self.engine.handle_cancel_handover(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            handover_request_id=handover_request_id,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def skip_step(
        self,
        ticket_id: str,
        ticket_step_id: str,
        reason: str,
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Skip a step (manager/admin only)"""
        result = self.engine.handle_skip_step(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            reason=reason,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def acknowledge_sla(
        self,
        ticket_id: str,
        ticket_step_id: str,
        notes: Optional[str],
        actor: ActorContext,
        correlation_id: str
    ) -> Dict[str, Any]:
        """Acknowledge SLA breach"""
        result = self.engine.handle_acknowledge_sla(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            notes=notes,
            actor=actor,
            correlation_id=correlation_id
        )
        return result
    
    def get_pending_handovers(
        self,
        manager_email: str,
        manager_aad_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get pending handover requests for manager.
        
        Includes handovers where user is:
        1. The AD manager of the requester
        2. The approver who was responsible for the task
        """
        handover_requests = self.ticket_repo.get_pending_handovers_for_manager(
            manager_email=manager_email,
            skip=skip,
            limit=limit
        )
        
        result = []
        for request in handover_requests:
            ticket = self.ticket_repo.get_ticket(request.ticket_id)
            if not ticket:
                continue
                
            # Check if user is AD manager
            is_manager = ticket.manager_snapshot and (
                ticket.manager_snapshot.email.lower() == manager_email.lower() or
                (manager_aad_id and ticket.manager_snapshot.aad_id == manager_aad_id)
            )
            
            # Check if user was the approver responsible for task assignment
            # For parallel approvals: only the PRIMARY approver handles handovers
            # For single approvals: the assigned_to approver handles handovers
            is_approver = False
            all_steps = self.ticket_repo.get_steps_for_ticket(ticket.ticket_id)
            for step in all_steps:
                if step.step_type == StepType.APPROVAL_STEP and (step.state.value if hasattr(step.state, "value") else str(step.state)) == "COMPLETED":
                    step_raw = self.ticket_repo.get_step_raw(step.ticket_step_id)
                    
                    # Check if this was a parallel approval
                    primary_email = step_raw.get("primary_approver_email") if step_raw else None
                    
                    if primary_email:
                        # Parallel approval: ONLY the primary approver is responsible
                        if primary_email.lower() == manager_email.lower():
                            is_approver = True
                            break
                        
                        # Also check by AAD ID in parallel_approvers_info
                        if manager_aad_id:
                            parallel_info = step_raw.get("parallel_approvers_info", [])
                            for info in parallel_info:
                                if info.get("email", "").lower() == primary_email.lower() and info.get("aad_id") == manager_aad_id:
                                    is_approver = True
                                    break
                            if is_approver:
                                break
                    else:
                        # Single approver: check assigned_to
                        if step.assigned_to and (
                            step.assigned_to.email.lower() == manager_email.lower() or
                            (manager_aad_id and step.assigned_to.aad_id == manager_aad_id)
                        ):
                            is_approver = True
                            break
            
            if is_manager or is_approver:
                step = self.ticket_repo.get_step(request.ticket_step_id)
                result.append({
                    "handover_request": request.model_dump(mode="json"),
                    "ticket": ticket.model_dump(mode="json"),
                    "step": step.model_dump(mode="json") if step else None
                })
        
        return result
    
    def get_team_dashboard(
        self,
        manager_email: str,
        manager_aad_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get team dashboard for manager"""
        workload = self.ticket_repo.get_team_workload(manager_email, manager_aad_id)
        
        # Get agent workload breakdown
        agent_workload = self.ticket_repo.get_agent_workload(manager_email)
        
        # Get recent team tickets (where user is AD manager OR has acted on)
        tickets = self.ticket_repo.list_tickets(skip=0, limit=50)
        
        # Build query conditions for approver lookup
        approver_conditions = [{"approver.email": {"$regex": f"^{manager_email}$", "$options": "i"}}]
        if manager_aad_id:
            approver_conditions.append({"approver.aad_id": manager_aad_id})
        
        # Get ticket IDs where user has acted as approver
        approved_tickets = set()
        for task in self.ticket_repo._approval_tasks.find({
            "$or": approver_conditions,
            "decision": {"$in": ["APPROVED", "REJECTED"]}
        }):
            approved_tickets.add(task.get("ticket_id"))
        
        # Build query conditions for assigner lookup
        assigner_conditions = [{"assigned_by.email": {"$regex": f"^{manager_email}$", "$options": "i"}}]
        if manager_aad_id:
            assigner_conditions.append({"assigned_by.aad_id": manager_aad_id})
        
        # Get ticket IDs where user has assigned agents
        assigned_tickets = set()
        for assignment in self.ticket_repo._assignments.find({
            "$or": assigner_conditions
        }):
            assigned_tickets.add(assignment.get("ticket_id"))
        
        team_tickets = [
            t for t in tickets if 
            (t.manager_snapshot and (
                t.manager_snapshot.email.lower() == manager_email.lower() or
                (manager_aad_id and t.manager_snapshot.aad_id == manager_aad_id)
            )) or
            t.ticket_id in approved_tickets or
            t.ticket_id in assigned_tickets
        ]
        
        # Get overdue steps
        overdue_steps = self.ticket_repo.get_overdue_steps(skip=0, limit=10)
        
        # Get on-hold steps
        on_hold_steps = self.ticket_repo.get_steps_on_hold(skip=0, limit=10)
        
        return {
            "workload": workload,
            "agent_workload": agent_workload,
            "recent_tickets": [t.model_dump(mode="json") for t in team_tickets[:5]],
            "overdue_steps": [s.model_dump(mode="json") for s in overdue_steps],
            "on_hold_steps": [s.model_dump(mode="json") for s in on_hold_steps]
        }
    
    def get_agent_history(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None,
        date_filter: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get completed tasks history for an agent"""
        steps = self.ticket_repo.get_completed_steps_by_agent(
            agent_email=agent_email,
            agent_aad_id=agent_aad_id,
            date_filter=date_filter,
            skip=skip,
            limit=limit
        )
        
        result = []
        for step in steps:
            ticket = self.ticket_repo.get_ticket(step.ticket_id)
            if ticket:
                result.append({
                    "step": step.model_dump(mode="json"),
                    "ticket": ticket.model_dump(mode="json")
                })
        
        return result
    
    def get_manager_approval_history(
        self,
        manager_email: str,
        manager_aad_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get approval history for a manager - tickets they approved/rejected."""
        items, total = self.ticket_repo.get_completed_approvals_by_manager(
            manager_email=manager_email,
            manager_aad_id=manager_aad_id,
            status_filter=status_filter,
            search=search,
            skip=skip,
            limit=limit
        )
        return items, total
    
    def get_previous_agents(
        self,
        ticket_id: str,
        actor: ActorContext
    ) -> List[Dict[str, Any]]:
        """Get list of previous agents who worked on this ticket.
        
        Deduplicates by person (AAD ID or email), keeping the most recent step info.
        This ensures each person appears only once in the dropdown, even if they
        worked on multiple steps.
        """
        from ..domain.enums import StepType, StepState, ApprovalDecision
        from ..domain.errors import TicketNotFoundError
        
        ticket = self.ticket_repo.get_ticket(ticket_id)
        if not ticket:
            raise TicketNotFoundError(f"Ticket {ticket_id} not found")
        
        # Get all task and approval steps for this ticket
        # Include both TASK_STEP and APPROVAL_STEP to show agents who worked on tasks or approvals in branches
        all_steps = self.ticket_repo.get_steps_for_ticket(ticket_id)
        
        def _get_type_str(val) -> str:
            """Convert enum or string to string"""
            return val.value if hasattr(val, 'value') else str(val)
        relevant_steps = [
            s for s in all_steps 
            if _get_type_str(s.step_type) in ["TASK_STEP", "APPROVAL_STEP"]
            # Include steps that have work done, regardless of final state
            # This includes: completed, rejected, active (if assigned), waiting_for_approval (if has approval tasks)
        ]
        
        def get_person_key(aad_id: Optional[str], email: str) -> str:
            """Get unique key for a person - prefer AAD ID, fallback to lowercase email"""
            if aad_id:
                return f"aad:{aad_id}"
            return f"email:{email.lower()}"
        
        # Collect unique person-step combinations
        # Key: (person_key, step_name), Value: agent info for that step
        # This allows same person to appear multiple times for different steps
        agents_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
        
        def add_or_update_agent(aad_id: Optional[str], email: str, display_name: str, 
                                  step_name: str, step_type: str, completed_at: str):
            """Add or update an agent entry, deduplicating by person + step"""
            person_key = get_person_key(aad_id, email)
            key = (person_key, step_name)
            
            # Determine role based on step type
            role = "Approver" if step_type == "APPROVAL_STEP" else "Agent"
            
            if key in agents_map:
                # Same person, same step - update if this is more recent
                existing = agents_map[key]
                if completed_at > (existing.get("completed_at") or ""):
                    existing["completed_at"] = completed_at
                    # Update AAD ID if we have one now but didn't before
                    if aad_id and not existing.get("aad_id"):
                        existing["aad_id"] = aad_id
            else:
                # New person-step combination
                agents_map[key] = {
                    "email": email,
                    "aad_id": aad_id,
                    "display_name": display_name,
                    "step_name": step_name,
                    "step_type": step_type,
                    "role": role,
                    "completed_at": completed_at
                }
        
        for step in relevant_steps:
            step_type_str = _get_type_str(step.step_type)
            if step_type_str == "TASK_STEP":
                # For task steps, use assigned_to if present
                # Include if step has assigned_to (someone worked on it) and is not NOT_STARTED
                if step.assigned_to and _get_type_str(step.state) != "NOT_STARTED":
                    # Use completed_at if available, otherwise started_at, otherwise empty string
                    completed_at = (
                        step.completed_at.isoformat() if step.completed_at 
                        else (step.started_at.isoformat() if step.started_at else "")
                    )
                    add_or_update_agent(
                        step.assigned_to.aad_id,
                        step.assigned_to.email,
                        step.assigned_to.display_name,
                        step.step_name,
                        "TASK_STEP",
                        completed_at
                    )
            
            elif step_type_str == "APPROVAL_STEP":
                # For approval steps, include the assigned approver if step is completed
                # This handles simple approval flows where assigned_to is the approver
                if step.assigned_to and _get_type_str(step.state) == "COMPLETED":
                    completed_at = (
                        step.completed_at.isoformat() if step.completed_at 
                        else (step.started_at.isoformat() if step.started_at else "")
                    )
                    add_or_update_agent(
                        step.assigned_to.aad_id,
                        step.assigned_to.email,
                        step.assigned_to.display_name,
                        step.step_name,
                        "APPROVAL_STEP",
                        completed_at
                    )
                
                # Also check approval tasks for multi-approver scenarios
                approval_tasks = self.ticket_repo.get_approval_tasks_for_step(step.ticket_step_id)
                for task in approval_tasks:
                    # Include approvers who have made a decision (approved or rejected)
                    if task.decision in [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED] and task.approver:
                        # Use decided_at if available, otherwise step completed_at, otherwise started_at
                        decided_at = (
                            task.decided_at.isoformat() if task.decided_at 
                            else (step.completed_at.isoformat() if step.completed_at 
                                  else (step.started_at.isoformat() if step.started_at else ""))
                        )
                        add_or_update_agent(
                            task.approver.aad_id,
                            task.approver.email,
                            task.approver.display_name,
                            step.step_name,
                            "APPROVAL_STEP",
                            decided_at
                        )
        
        # Convert to list and sort by completed_at (most recent first)
        agents = list(agents_map.values())
        agents.sort(key=lambda x: x.get("completed_at") or "", reverse=True)
        
        # Log for debugging
        logger.debug(
            f"get_previous_agents: ticket_id={ticket_id}, "
            f"total_steps={len(relevant_steps)}, "
            f"unique_agents={len(agents)}, "
            f"agents={[a['email'] for a in agents]}"
        )
        
        return agents
    
    def get_agent_dashboard(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get comprehensive agent dashboard data."""
        # Get accurate counts from database - only count OPEN states (not completed/cancelled)
        # This filters to only count currently assigned/active TASK_STEP (not approval steps)
        # to be consistent with what's shown in My Tasks page
        task_counts = self.ticket_repo.count_assigned_steps_by_user(
            user_email=agent_email,
            user_aad_id=agent_aad_id,
            states=[StepState.ACTIVE, StepState.ON_HOLD, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT],
            step_type=StepType.TASK_STEP  # Only count actual task steps, not approval steps
        )
        
        info_requests = self.get_agent_info_requests(agent_email, agent_aad_id)
        pending_handovers = self.get_agent_pending_handovers(agent_email, agent_aad_id)
        
        # Get overdue tasks (with details for display)
        active_tasks = self.ticket_repo.get_assigned_steps_by_user(
            user_email=agent_email,
            user_aad_id=agent_aad_id,
            states=[StepState.ACTIVE, StepState.ON_HOLD],
            skip=0,
            limit=200
        )
        
        overdue_tasks = []
        overdue_count = 0
        for task in active_tasks:
            if task.due_at and task.due_at < utc_now():
                overdue_count += 1
                if len(overdue_tasks) < 10:
                    ticket = self.ticket_repo.get_ticket(task.ticket_id)
                    overdue_tasks.append({
                        "step": task.model_dump(mode="json"),
                        "ticket": ticket.model_dump(mode="json") if ticket else None
                    })
        
        completed_history = self.ticket_repo.get_completed_tasks_by_agent(
            agent_email=agent_email,
            agent_aad_id=agent_aad_id,
            skip=0,
            limit=20
        )
        
        recent_completed = []
        for task in completed_history:
            ticket = self.ticket_repo.get_ticket(task.ticket_id)
            recent_completed.append({
                "step": task.model_dump(mode="json"),
                "ticket": ticket.model_dump(mode="json") if ticket else None
            })
        
        return {
            "summary": {
                "total_tasks": task_counts["total"],
                "active_tasks": task_counts["active"],
                "on_hold_tasks": task_counts["on_hold"],
                "waiting_for_info_tasks": task_counts["waiting"],
                "info_requests": len(info_requests),
                "pending_handovers": len(pending_handovers),
                "overdue_tasks": overdue_count
            },
            "overdue_tasks": overdue_tasks,
            "recent_completed": recent_completed,
            "pending_handovers": pending_handovers
        }
    
    def get_agent_info_requests(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get info requests directed to this agent (only from TASK_STEP context)."""
        info_requests = self.ticket_repo.get_info_requests_for_user(
            user_email=agent_email,
            user_aad_id=agent_aad_id
        )
        
        result = []
        for ir in info_requests:
            ticket = self.ticket_repo.get_ticket(ir.ticket_id)
            step = self.ticket_repo.get_step(ir.ticket_step_id)
            
            if not ticket or not step:
                continue
            
            step_type_str = step.step_type.value if hasattr(step.step_type, 'value') else str(step.step_type)
            
            # Only include requests where the RECIPIENT was on a TASK_STEP
            # Use the requested_from_step_type field which tracks recipient's context
            recipient_step_type = ir.requested_from_step_type or "REQUESTER"
            if recipient_step_type != "TASK_STEP":
                continue
            
            result.append({
                "info_request_id": ir.info_request_id,
                "ticket_id": ir.ticket_id,
                "ticket_title": ticket.title,
                "ticket_step_id": ir.ticket_step_id,
                "step_name": step.step_name,
                "step_type": step_type_str,
                "subject": ir.subject,
                "question_text": ir.question_text,
                "requested_by": ir.requested_by.model_dump(mode="json") if ir.requested_by else None,
                "requested_from": ir.requested_from.model_dump(mode="json") if ir.requested_from else None,
                "requested_at": ir.requested_at.isoformat() if ir.requested_at else None,
                "status": ir.status.value if hasattr(ir.status, 'value') else str(ir.status),
                "request_attachment_ids": ir.request_attachment_ids or [],
                "workflow_name": ticket.workflow_name
            })
        
        return result
    
    def get_agent_pending_handovers(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get handover requests submitted by this agent."""
        handovers = self.ticket_repo.get_handovers_by_agent(
            agent_email=agent_email,
            agent_aad_id=agent_aad_id
        )
        
        result = []
        for hr in handovers:
            ticket = self.ticket_repo.get_ticket(hr.ticket_id)
            step = self.ticket_repo.get_step(hr.ticket_step_id)
            
            if not ticket:
                continue
            
            result.append({
                "handover_request": hr.model_dump(mode="json"),
                "ticket": ticket.model_dump(mode="json"),
                "step": step.model_dump(mode="json") if step else None
            })
        
        return result
