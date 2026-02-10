"""Audit Writer - Append-only audit events"""
from typing import Any, Dict, List, Optional

from ..domain.models import AuditEvent, UserSnapshot, ActorContext
from ..domain.enums import AuditEventType
from ..repositories.audit_repo import AuditRepository
from ..utils.idgen import generate_audit_event_id
from ..utils.time import utc_now
from ..utils.logger import get_logger

logger = get_logger(__name__)


class AuditWriter:
    """
    Write audit events (append-only)
    
    All state changes and significant actions produce audit events.
    """
    
    def __init__(self):
        self.repo = AuditRepository()
    
    def write_event(
        self,
        ticket_id: str,
        event_type: AuditEventType,
        actor: ActorContext,
        ticket_step_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write a single audit event"""
        event = AuditEvent(
            audit_event_id=generate_audit_event_id(),
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=event_type,
            actor=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            details=details or {},
            timestamp=utc_now(),
            correlation_id=correlation_id
        )
        
        return self.repo.create_event(event)
    
    def write_create_ticket(
        self,
        ticket_id: str,
        actor: ActorContext,
        workflow_name: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write ticket creation event"""
        return self.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.CREATE_TICKET,
            actor=actor,
            details={"workflow_name": workflow_name},
            correlation_id=correlation_id
        )
    
    def write_submit_form(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        form_values: Dict[str, Any],
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write form submission event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.SUBMIT_FORM,
            actor=actor,
            details={"form_values_summary": self._summarize_form(form_values)},
            correlation_id=correlation_id
        )
    
    def write_approve(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        comment: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write approval event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.APPROVE,
            actor=actor,
            details={"comment": comment},
            correlation_id=correlation_id
        )
    
    def write_reject(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        comment: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write rejection event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.REJECT,
            actor=actor,
            details={"comment": comment},
            correlation_id=correlation_id
        )
    
    def write_request_info(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        question: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write info request event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.REQUEST_INFO,
            actor=actor,
            details={"question": question},
            correlation_id=correlation_id
        )
    
    def write_respond_info(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        response_summary: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write info response event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.RESPOND_INFO,
            actor=actor,
            details={"response_summary": response_summary[:200]},
            correlation_id=correlation_id
        )
    
    def write_assign(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        agent_email: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write agent assignment event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.ASSIGN_AGENT,
            actor=actor,
            details={"agent_email": agent_email},
            correlation_id=correlation_id
        )
    
    def write_reassign(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        old_agent_email: str,
        new_agent_email: str,
        reason: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write agent reassignment event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.REASSIGN_AGENT,
            actor=actor,
            details={
                "old_agent_email": old_agent_email,
                "new_agent_email": new_agent_email,
                "reason": reason
            },
            correlation_id=correlation_id
        )
    
    def write_complete_task(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write task completion event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.COMPLETE_TASK,
            actor=actor,
            correlation_id=correlation_id
        )
    
    def write_note_added(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        note_preview: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write note added event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.NOTE_ADDED,
            actor=actor,
            details={"note_preview": note_preview},
            correlation_id=correlation_id
        )
    
    def write_requester_note_added(
        self,
        ticket_id: str,
        actor: ActorContext,
        note_preview: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write requester note added event (ticket-level note from requester)"""
        return self.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.REQUESTER_NOTE_ADDED,
            actor=actor,
            details={
                "note_preview": note_preview,
                "note_type": "requester_note"
            },
            correlation_id=correlation_id
        )
    
    def write_cancel_ticket(
        self,
        ticket_id: str,
        actor: ActorContext,
        reason: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write ticket cancellation event"""
        return self.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.CANCEL_TICKET,
            actor=actor,
            details={"reason": reason},
            correlation_id=correlation_id
        )
    
    def write_ticket_rejected(
        self,
        ticket_id: str,
        actor: ActorContext,
        reason: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write ticket rejection event"""
        return self.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.REJECT,
            actor=actor,
            details={"reason": reason, "ticket_rejected": True},
            correlation_id=correlation_id
        )
    
    def write_ticket_completed(
        self,
        ticket_id: str,
        actor: ActorContext,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write ticket completion event"""
        return self.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.TICKET_COMPLETED,
            actor=actor,
            correlation_id=correlation_id
        )
    
    def write_step_activated(
        self,
        ticket_id: str,
        ticket_step_id: str,
        step_name: str,
        actor: ActorContext,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write step activation event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.STEP_ACTIVATED,
            actor=actor,
            details={"step_name": step_name},
            correlation_id=correlation_id
        )
    
    def write_engine_error(
        self,
        ticket_id: str,
        actor: ActorContext,
        error_message: str,
        error_details: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write engine error event"""
        return self.write_event(
            ticket_id=ticket_id,
            event_type=AuditEventType.ENGINE_ERROR,
            actor=actor,
            details={
                "error_message": error_message,
                "error_details": error_details or {}
            },
            correlation_id=correlation_id
        )
    
    def write_hold(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        reason: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write step put on hold event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.PUT_ON_HOLD,
            actor=actor,
            details={"reason": reason},
            correlation_id=correlation_id
        )
    
    def write_resume(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write step resumed event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.RESUMED,
            actor=actor,
            correlation_id=correlation_id
        )
    
    def write_handover_requested(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        reason: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write handover request event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.HANDOVER_REQUESTED,
            actor=actor,
            details={"reason": reason},
            correlation_id=correlation_id
        )
    
    def write_handover_approved(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        old_agent_email: Optional[str],
        new_agent_email: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write handover approved event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.HANDOVER_APPROVED,
            actor=actor,
            details={
                "old_agent_email": old_agent_email,
                "new_agent_email": new_agent_email
            },
            correlation_id=correlation_id
        )
    
    def write_handover_rejected(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write handover rejected event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.HANDOVER_REJECTED,
            actor=actor,
            correlation_id=correlation_id
        )
    
    def write_step_skipped(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        reason: str,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write step skipped event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.STEP_SKIPPED,
            actor=actor,
            details={"reason": reason},
            correlation_id=correlation_id
        )
    
    def write_sla_acknowledged(
        self,
        ticket_id: str,
        ticket_step_id: str,
        actor: ActorContext,
        correlation_id: Optional[str] = None
    ) -> AuditEvent:
        """Write SLA acknowledged event"""
        return self.write_event(
            ticket_id=ticket_id,
            ticket_step_id=ticket_step_id,
            event_type=AuditEventType.SLA_ACKNOWLEDGED,
            actor=actor,
            correlation_id=correlation_id
        )
    
    def _summarize_form(self, form_values: Dict[str, Any]) -> Dict[str, str]:
        """Summarize form values for audit (avoid storing sensitive data)"""
        summary = {}
        for key, value in form_values.items():
            if isinstance(value, str) and len(value) > 100:
                summary[key] = f"{value[:100]}..."
            else:
                summary[key] = str(value)[:100]
        return summary

