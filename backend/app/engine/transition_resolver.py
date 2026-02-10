"""Transition Resolver - Determine next step based on events and conditions"""
from typing import Any, Dict, List, Optional

from ..domain.models import WorkflowVersion, TransitionTemplate
from ..domain.enums import TransitionEvent
from ..domain.errors import TransitionNotFoundError
from .condition_evaluator import ConditionEvaluator
from ..utils.logger import get_logger

logger = get_logger(__name__)


class TransitionResolver:
    """
    Resolve transitions based on current step, event, and conditions
    
    Given current step S and event E:
    1. Find candidate transitions where from_step_id=S and on_event=E
    2. Evaluate conditions (simple DSL)
    3. Choose highest priority if multiple
    4. If none found -> raise TransitionNotFoundError
    """
    
    def __init__(self):
        self.condition_evaluator = ConditionEvaluator()
    
    def resolve_next_step(
        self,
        current_step_id: str,
        event: TransitionEvent,
        ticket_context: Dict[str, Any],
        workflow_version: WorkflowVersion
    ) -> Optional[str]:
        """
        Resolve the next step ID based on event and conditions
        
        Args:
            current_step_id: Current step ID
            event: Event that triggered the transition
            ticket_context: Context for condition evaluation
            workflow_version: Workflow definition
            
        Returns:
            Next step ID or None if terminal
            
        Raises:
            TransitionNotFoundError: If no valid transition found
        """
        # Get transitions from workflow definition
        transitions = workflow_version.definition.transitions
        
        # Find candidate transitions
        candidates = [
            t for t in transitions
            if t.from_step_id == current_step_id and t.on_event == event
        ]
        
        if not candidates:
            # Check if current step is terminal
            current_step_def = self._find_step_definition(
                current_step_id, 
                workflow_version
            )
            if current_step_def and current_step_def.get("is_terminal"):
                return None  # Terminal step, no next step
            
            raise TransitionNotFoundError(
                f"No transition found from step {current_step_id} on event {event.value}",
                details={
                    "current_step_id": current_step_id,
                    "event": event.value
                }
            )
        
        # Evaluate conditions and filter
        valid_transitions = []
        for t in candidates:
            if t.condition is None:
                valid_transitions.append((t, 0))  # No condition, priority 0
            else:
                # Evaluate condition
                if self.condition_evaluator.evaluate(t.condition, ticket_context):
                    valid_transitions.append((t, t.priority))
        
        if not valid_transitions:
            raise TransitionNotFoundError(
                f"No valid transition (conditions not met) from step {current_step_id}",
                details={
                    "current_step_id": current_step_id,
                    "event": event.value,
                    "candidates_count": len(candidates)
                }
            )
        
        # Sort by priority (higher first) and pick first
        valid_transitions.sort(key=lambda x: x[1], reverse=True)
        selected_transition = valid_transitions[0][0]
        
        logger.info(
            f"Resolved transition: {current_step_id} -> {selected_transition.to_step_id}",
            extra={
                "from_step": current_step_id,
                "to_step": selected_transition.to_step_id,
                "event": event.value
            }
        )
        
        return selected_transition.to_step_id
    
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
    
    def get_outgoing_transitions(
        self,
        step_id: str,
        workflow_version: WorkflowVersion
    ) -> List[TransitionTemplate]:
        """Get all outgoing transitions from a step"""
        return [
            t for t in workflow_version.definition.transitions
            if t.from_step_id == step_id
        ]
    
    def get_events_for_step(
        self,
        step_id: str,
        workflow_version: WorkflowVersion
    ) -> List[TransitionEvent]:
        """Get all possible events for a step"""
        transitions = self.get_outgoing_transitions(step_id, workflow_version)
        return list(set(t.on_event for t in transitions))

