"""Permission Guard - Authorization enforcement for all actions
Updated: Force reload for AAD ID matching fix
"""
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from ..domain.models import Ticket, TicketStep, ActorContext, UserSnapshot
from ..domain.enums import StepType, StepState, TicketStatus
from ..utils.logger import get_logger

if TYPE_CHECKING:
    from ..repositories.ticket_repo import TicketRepository

logger = get_logger(__name__)


class PermissionGuard:
    """
    Permission enforcement for ticket operations
    
    Rules:
    - Requester can only act on their own tickets
    - Approver can only act on approval tasks assigned to them
    - Agent can only act on tasks assigned to them
    - Manager can assign/reassign agents
    - Targeted recipients can respond to info requests
    """
    
    def __init__(self, ticket_repo: "TicketRepository" = None):
        """Initialize with optional ticket repository for info request checks"""
        self._ticket_repo = ticket_repo
    
    def _is_same_user(self, actor: ActorContext, user_snapshot: Optional[UserSnapshot]) -> bool:
        """
        Check if actor is the same user as the snapshot.
        
        Uses aad_id (Object ID) as primary match, falls back to email (case-insensitive).
        This handles UPN vs mail attribute differences in Azure AD.
        """
        if not user_snapshot:
            return False
        
        # Primary: match by aad_id (most reliable)
        if actor.aad_id and user_snapshot.aad_id:
            if actor.aad_id == user_snapshot.aad_id:
                return True
        
        # Fallback: match by email (case-insensitive)
        if actor.email.lower() == user_snapshot.email.lower():
            return True
        
        return False
    
    def _is_info_request_target(self, actor: ActorContext, ticket_step_id: str) -> bool:
        """
        Check if actor is the targeted recipient of an open info request for this step.
        
        This allows managers/agents who received info requests to respond to them.
        Uses AAD ID (primary) and email (fallback) for matching to handle email aliases.
        """
        if not self._ticket_repo:
            return False
        
        try:
            info_request = self._ticket_repo.get_open_info_request_for_step(ticket_step_id)
            if not info_request:
                return False
            
            if not info_request.requested_from:
                return False
            
            # Primary: match by AAD ID (handles email aliases)
            if actor.aad_id and info_request.requested_from.aad_id:
                if actor.aad_id == info_request.requested_from.aad_id:
                    return True
            
            # Fallback: match by email (case-insensitive)
            if info_request.requested_from.email:
                if actor.email.lower() == info_request.requested_from.email.lower():
                    return True
            
            return False
        except Exception as e:
            logger.warning(f"Error checking info request target: {e}")
            return False
    
    def can_view_ticket(self, actor: ActorContext, ticket: Ticket) -> bool:
        """Check if actor can view ticket"""
        # Requester can view their own tickets
        if self._is_same_user(actor, ticket.requester):
            return True
        
        # Manager can view
        if self._is_same_user(actor, ticket.manager_snapshot):
            return True
        
        # TODO: Check if actor is current approver or assigned agent
        # This requires additional context
        
        return True  # For now, allow viewing (will be restricted per step)
    
    def can_act_on_step(
        self,
        actor: ActorContext,
        ticket: Ticket,
        step: TicketStep,
        action: str,
        all_steps: list = None
    ) -> bool:
        """
        Check if actor can perform action on step
        
        Args:
            actor: Current user
            ticket: Ticket instance
            step: Ticket step
            action: Action to perform
            all_steps: All steps for the ticket (optional, for checking previous approvers)
            
        Returns:
            True if allowed
        """
        # Check ticket status allows action
        if ticket.status in [TicketStatus.COMPLETED, TicketStatus.REJECTED, TicketStatus.CANCELLED, TicketStatus.SKIPPED]:
            return False
        
        # WAITING_FOR_CR: Only allow notes, block all other actions
        if ticket.status == TicketStatus.WAITING_FOR_CR or step.state == StepState.WAITING_FOR_CR:
            if action == "add_note":
                # Allow notes from requester, assigned user, manager, or any participant
                if self._is_same_user(actor, ticket.requester):
                    return True
                if self._is_same_user(actor, ticket.manager_snapshot):
                    return True
                if step.assigned_to and self._is_same_user(actor, step.assigned_to):
                    return True
                # Also check if actor is a parallel approver
                if self._ticket_repo and step.step_type == StepType.APPROVAL_STEP:
                    step_raw = self._ticket_repo.get_step_raw(step.ticket_step_id)
                    if step_raw:
                        parallel_pending = step_raw.get('parallel_pending_approvers', [])
                        if any(email.lower() == actor.email.lower() for email in parallel_pending):
                            return True
                return False
            # Block all other actions during CR wait
            logger.info(
                f"Action {action} blocked: ticket/step is waiting for Change Request resolution",
                extra={"ticket_id": ticket.ticket_id, "step_id": step.step_id}
            )
            return False
        
        # Check step state allows action - cannot act on rejected/cancelled/completed/skipped steps
        if step.state in [StepState.REJECTED, StepState.CANCELLED, StepState.COMPLETED, StepState.SKIPPED]:
            return False
        
        # Handle by step type and action
        if step.step_type == StepType.FORM_STEP:
            return self._can_act_form_step(actor, ticket, step, action)
        
        elif step.step_type == StepType.APPROVAL_STEP:
            return self._can_act_approval_step(actor, ticket, step, action)
        
        elif step.step_type == StepType.TASK_STEP:
            return self._can_act_task_step(actor, ticket, step, action, all_steps)
        
        return False
    
    def _can_act_form_step(
        self,
        actor: ActorContext,
        ticket: Ticket,
        step: TicketStep,
        action: str
    ) -> bool:
        """Check permissions for form step"""
        if action == "submit_form":
            # Debug logging
            is_same_user = self._is_same_user(actor, ticket.requester)
            is_active = step.state == StepState.ACTIVE
            
            logger.info(
                f"Form permission check: action={action}, step_id={step.step_id}, "
                f"step_state={step.state}, is_active={is_active}, "
                f"actor_email={actor.email}, actor_aad_id={actor.aad_id}, "
                f"requester_email={ticket.requester.email}, requester_aad_id={ticket.requester.aad_id}, "
                f"is_same_user={is_same_user}, result={is_same_user and is_active}"
            )
            
            # Only requester can submit form
            return is_same_user and is_active
        return False
    
    def _can_act_approval_step(
        self,
        actor: ActorContext,
        ticket: Ticket,
        step: TicketStep,
        action: str
    ) -> bool:
        """Check permissions for approval step"""
        # For parallel approvals, check if actor is in the pending approvers list
        parallel_pending = getattr(step, 'parallel_pending_approvers', None) or []
        parallel_approvers_info = []
        step_raw = None
        
        # If step doesn't have parallel_pending_approvers, try fetching from repo
        if not parallel_pending and self._ticket_repo:
            step_raw = self._ticket_repo.get_step_raw(step.ticket_step_id)
            if step_raw:
                parallel_pending = step_raw.get('parallel_pending_approvers', [])
                parallel_approvers_info = step_raw.get('parallel_approvers_info', [])
        
        # Also get approvers info if not already fetched
        if parallel_pending and not parallel_approvers_info and self._ticket_repo and not step_raw:
            step_raw = self._ticket_repo.get_step_raw(step.ticket_step_id)
            if step_raw:
                parallel_approvers_info = step_raw.get('parallel_approvers_info', [])
        
        is_parallel_approver = False
        if parallel_pending and action in ["approve", "reject", "request_info", "add_note"]:
            actor_email_lower = actor.email.lower()
            
            # Check by email first
            is_parallel_approver = any(email.lower() == actor_email_lower for email in parallel_pending)
            
            # If not found by email and we have AAD ID, check by AAD ID in parallel_approvers_info
            if not is_parallel_approver and actor.aad_id and parallel_approvers_info:
                is_parallel_approver = any(
                    info.get('aad_id') == actor.aad_id 
                    for info in parallel_approvers_info 
                    if info.get('aad_id')
                )
            
            # If still not found and we have AAD ID, check approval_tasks as fallback
            # (for tickets created before parallel_approvers_info was stored)
            if not is_parallel_approver and actor.aad_id and self._ticket_repo:
                approval_tasks = self._ticket_repo.get_approval_tasks_for_step(step.ticket_step_id)
                for task in approval_tasks:
                    if task.approver and task.approver.aad_id == actor.aad_id:
                        # Check if this approver's email is in the pending list
                        if task.approver.email.lower() in [e.lower() for e in parallel_pending]:
                            is_parallel_approver = True
                            logger.info(
                                f"Matched parallel approver by AAD ID from approval_tasks: {actor.email} -> {task.approver.email}",
                                extra={"step_id": step.ticket_step_id, "aad_id": actor.aad_id}
                            )
                            break
            
            if is_parallel_approver:
                logger.info(
                    f"Parallel approver check passed for {actor.email} (action={action})",
                    extra={"step_id": step.ticket_step_id, "parallel_pending": parallel_pending}
                )
        
        # Check if actor is the assigned approver (using aad_id or email) OR a parallel approver
        is_assigned_approver = self._is_same_user(actor, step.assigned_to)
        
        logger.info(
            f"Approval permission check: action={action}, step_id={step.ticket_step_id}, "
            f"step_state={step.state}, is_assigned_approver={is_assigned_approver}, "
            f"is_parallel_approver={is_parallel_approver}, "
            f"actor_email={actor.email}, actor_aad_id={actor.aad_id}, "
            f"assigned_to_email={step.assigned_to.email if step.assigned_to else None}, "
            f"assigned_to_aad_id={step.assigned_to.aad_id if step.assigned_to else None}"
        )
        
        if is_assigned_approver or is_parallel_approver:
            if action in ["approve", "reject"]:
                # Allow approve/reject when waiting for approval OR when waiting for info response
                # Approver can still reject even while waiting for info
                allowed_states = [StepState.WAITING_FOR_APPROVAL, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT]
                result = step.state in allowed_states
                logger.info(
                    f"Approve/reject check: step.state={step.state}, allowed_states={allowed_states}, result={result}"
                )
                return result
            if action == "request_info":
                return step.state == StepState.WAITING_FOR_APPROVAL
            if action == "add_note":
                return step.state in [StepState.WAITING_FOR_APPROVAL, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT, StepState.WAITING_FOR_CR]
        
        # Manager can also add notes to approval steps
        if action == "add_note":
            if step.state not in [StepState.WAITING_FOR_APPROVAL, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT, StepState.WAITING_FOR_CR]:
                return False
            # Allow if actor is the AD manager
            if self._is_same_user(actor, ticket.manager_snapshot):
                return True
        
        # Requester or targeted recipient can respond to info requests
        if action == "respond_info":
            # Check for BOTH waiting states - WAITING_FOR_REQUESTER (when asking requester)
            # and WAITING_FOR_AGENT (when asking another agent/manager)
            if step.state not in [StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT]:
                return False
            # Check if actor is the targeted recipient of the info request
            if self._is_info_request_target(actor, step.ticket_step_id):
                return True
            # Requester can respond if the step is waiting for them
            if step.state == StepState.WAITING_FOR_REQUESTER and self._is_same_user(actor, ticket.requester):
                return True
            return False
        
        return False
    
    def _can_act_task_step(
        self,
        actor: ActorContext,
        ticket: Ticket,
        step: TicketStep,
        action: str,
        all_steps: list = None
    ) -> bool:
        """Check permissions for task step"""
        # Manager (or approver) can assign/reassign
        if action in ["assign", "reassign"]:
            if step.state not in [StepState.ACTIVE, StepState.WAITING_FOR_APPROVAL]:
                return False
            
            # Allow if actor is the AD manager
            if self._is_same_user(actor, ticket.manager_snapshot):
                return True
            
            # Also allow if actor is the approver responsible for this task
            # For parallel approvals: ONLY the primary approver can assign/reassign
            # For single approvals: the assigned_to approver can assign/reassign
            if all_steps:
                for prev_step in all_steps:
                    if prev_step.step_type == StepType.APPROVAL_STEP and prev_step.state == StepState.COMPLETED:
                        if self._ticket_repo:
                            step_raw = self._ticket_repo.get_step_raw(prev_step.ticket_step_id)
                            primary_email = step_raw.get("primary_approver_email") if step_raw else None
                            
                            if primary_email:
                                # Parallel approval: ONLY the primary approver can assign
                                if primary_email.lower() == actor.email.lower():
                                    logger.info(
                                        f"Actor {actor.email} is primary approver, allowing task assignment",
                                        extra={"prev_step_id": prev_step.ticket_step_id}
                                    )
                                    return True
                                
                                # Also check by AAD ID in parallel_approvers_info
                                if actor.aad_id:
                                    parallel_info = step_raw.get("parallel_approvers_info", [])
                                    for info in parallel_info:
                                        if info.get("email", "").lower() == primary_email.lower() and info.get("aad_id") == actor.aad_id:
                                            logger.info(
                                                f"Actor {actor.email} matched primary approver by AAD ID",
                                                extra={"prev_step_id": prev_step.ticket_step_id}
                                            )
                                            return True
                            else:
                                # Single approver: check assigned_to
                                if self._is_same_user(actor, prev_step.assigned_to):
                                    return True
            
            return False
        
        # Assigned agent can complete, add notes, and request info
        if step.assigned_to:
            is_same_user = self._is_same_user(actor, step.assigned_to)
            logger.info(
                f"Task step permission check: action={action}, step_id={step.step_id}, "
                f"step_state={step.state}, has_assigned_to={step.assigned_to is not None}, "
                f"actor_email={actor.email}, actor_aad_id={actor.aad_id}, "
                f"assigned_to_email={step.assigned_to.email if step.assigned_to else None}, "
                f"assigned_to_aad_id={step.assigned_to.aad_id if step.assigned_to else None}, "
                f"is_same_user={is_same_user}, result={is_same_user and step.state == StepState.ACTIVE if action == 'complete_task' else False}"
            )
            
            if is_same_user:
                if action == "complete_task":
                    return step.state == StepState.ACTIVE
                if action == "add_note":
                    # Allow adding notes in active, on hold, waiting for info, and waiting for CR states
                    return step.state in [StepState.ACTIVE, StepState.ON_HOLD, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT, StepState.WAITING_FOR_CR]
                if action == "request_info":
                    return step.state == StepState.ACTIVE
        else:
            logger.warning(
                f"Task step has no assigned_to: step_id={step.step_id}, step_state={step.state}, "
                f"action={action}, actor_email={actor.email}"
            )
        
        # Manager/Approver can also add notes (for oversight)
        if action == "add_note":
            # Allow adding notes in active, on hold, waiting for info, and waiting for CR states
            if step.state not in [StepState.ACTIVE, StepState.ON_HOLD, StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT, StepState.WAITING_FOR_CR]:
                return False
            
            # Allow if actor is the AD manager
            if self._is_same_user(actor, ticket.manager_snapshot):
                return True
            
            # Also allow if actor approved a previous approval step
            if all_steps:
                for prev_step in all_steps:
                    if prev_step.step_type == StepType.APPROVAL_STEP and prev_step.state == StepState.COMPLETED:
                        if self._is_same_user(actor, prev_step.assigned_to):
                            return True
        
        # Requester or targeted recipient can respond to info requests
        if action == "respond_info":
            # Check for BOTH waiting states - WAITING_FOR_REQUESTER (when asking requester)
            # and WAITING_FOR_AGENT (when asking another agent/manager)
            if step.state not in [StepState.WAITING_FOR_REQUESTER, StepState.WAITING_FOR_AGENT]:
                return False
            # Check if actor is the targeted recipient of the info request
            if self._is_info_request_target(actor, step.ticket_step_id):
                return True
            # Requester can respond if the step is waiting for them
            if step.state == StepState.WAITING_FOR_REQUESTER and self._is_same_user(actor, ticket.requester):
                return True
            return False
        
        return False
    
    def can_cancel_ticket(self, actor: ActorContext, ticket: Ticket) -> bool:
        """Check if actor can cancel ticket"""
        # Only requester can cancel
        if not self._is_same_user(actor, ticket.requester):
            return False
        
        # Can only cancel if not already in final state
        return ticket.status not in [
            TicketStatus.COMPLETED,
            TicketStatus.REJECTED,
            TicketStatus.CANCELLED
        ]
    
    def get_available_actions(
        self,
        actor: ActorContext,
        ticket: Ticket,
        step: TicketStep
    ) -> List[str]:
        """Get list of actions actor can perform on step"""
        actions = []
        
        if step.step_type == StepType.FORM_STEP:
            if self.can_act_on_step(actor, ticket, step, "submit_form"):
                actions.append("submit_form")
        
        elif step.step_type == StepType.APPROVAL_STEP:
            if self.can_act_on_step(actor, ticket, step, "approve"):
                actions.extend(["approve", "reject"])
            if self.can_act_on_step(actor, ticket, step, "request_info"):
                actions.append("request_info")
            if self.can_act_on_step(actor, ticket, step, "respond_info"):
                actions.append("respond_info")
        
        elif step.step_type == StepType.TASK_STEP:
            if self.can_act_on_step(actor, ticket, step, "complete_task"):
                actions.append("complete_task")
            if self.can_act_on_step(actor, ticket, step, "request_info"):
                actions.append("request_info")
            if self.can_act_on_step(actor, ticket, step, "respond_info"):
                actions.append("respond_info")
            if self.can_act_on_step(actor, ticket, step, "assign"):
                actions.append("assign")
            if self.can_act_on_step(actor, ticket, step, "reassign"):
                actions.append("reassign")
        
        return actions

