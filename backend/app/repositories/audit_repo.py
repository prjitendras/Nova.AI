"""Audit Repository - Data access for audit events"""
from typing import Any, Dict, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo import DESCENDING

from .mongo_client import get_collection
from ..domain.models import AuditEvent
from ..domain.enums import AuditEventType
from ..utils.logger import get_logger

logger = get_logger(__name__)


class AuditRepository:
    """Repository for audit event operations (append-only)"""
    
    def __init__(self):
        self._audit_events: Collection = get_collection("audit_events")
    
    def create_event(self, event: AuditEvent) -> AuditEvent:
        """Create an audit event (append-only)"""
        doc = event.model_dump(mode="json")
        doc["_id"] = event.audit_event_id
        
        self._audit_events.insert_one(doc)
        logger.info(
            f"Created audit event: {event.event_type.value}",
            extra={
                "ticket_id": event.ticket_id,
                "audit_event_id": event.audit_event_id,
                "actor_email": event.actor.email
            }
        )
        return event
    
    def create_events_bulk(self, events: List[AuditEvent]) -> List[AuditEvent]:
        """Create multiple audit events"""
        if not events:
            return []
        
        docs = []
        for event in events:
            doc = event.model_dump(mode="json")
            doc["_id"] = event.audit_event_id
            docs.append(doc)
        
        self._audit_events.insert_many(docs)
        logger.info(f"Created {len(events)} audit events")
        return events
    
    def get_events_for_ticket(
        self,
        ticket_id: str,
        event_types: Optional[List[AuditEventType]] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[AuditEvent]:
        """Get audit events for a ticket"""
        query: Dict[str, Any] = {"ticket_id": ticket_id}
        
        if event_types:
            query["event_type"] = {"$in": [et.value for et in event_types]}
        
        cursor = self._audit_events.find(query).sort("timestamp", DESCENDING).skip(skip).limit(limit)
        
        events = []
        for doc in cursor:
            doc.pop("_id", None)
            events.append(AuditEvent.model_validate(doc))
        
        return events
    
    def get_events_by_correlation_id(self, correlation_id: str) -> List[AuditEvent]:
        """Get audit events by correlation ID"""
        cursor = self._audit_events.find(
            {"correlation_id": correlation_id}
        ).sort("timestamp", DESCENDING)
        
        events = []
        for doc in cursor:
            doc.pop("_id", None)
            events.append(AuditEvent.model_validate(doc))
        
        return events
    
    def get_events_for_step(
        self,
        ticket_step_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[AuditEvent]:
        """Get audit events for a specific step"""
        cursor = self._audit_events.find(
            {"ticket_step_id": ticket_step_id}
        ).sort("timestamp", DESCENDING).skip(skip).limit(limit)
        
        events = []
        for doc in cursor:
            doc.pop("_id", None)
            events.append(AuditEvent.model_validate(doc))
        
        return events
    
    def get_recent_events(
        self,
        hours: int = 24,
        event_types: Optional[List[AuditEventType]] = None,
        limit: int = 100
    ) -> List[AuditEvent]:
        """Get recent audit events"""
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        query: Dict[str, Any] = {"timestamp": {"$gte": cutoff}}
        
        if event_types:
            query["event_type"] = {"$in": [et.value for et in event_types]}
        
        cursor = self._audit_events.find(query).sort("timestamp", DESCENDING).limit(limit)
        
        events = []
        for doc in cursor:
            doc.pop("_id", None)
            events.append(AuditEvent.model_validate(doc))
        
        return events
    
    def count_events_for_ticket(self, ticket_id: str) -> int:
        """Count audit events for a ticket"""
        return self._audit_events.count_documents({"ticket_id": ticket_id})

