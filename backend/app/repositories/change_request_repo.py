"""Change Request Repository - Data access for change requests"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pymongo.database import Database

from app.domain.change_request_models import (
    ChangeRequest,
    ChangeRequestStatus,
    FormVersion,
)


class ChangeRequestRepository:
    """Repository for change request operations"""
    
    def __init__(self, db: Database):
        self.db = db
        self.collection = db["change_requests"]
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        self.collection.create_index("change_request_id", unique=True)
        self.collection.create_index("ticket_id")
        self.collection.create_index("status")
        self.collection.create_index("assigned_to.email")
        self.collection.create_index("assigned_to.aad_id")  # For faster AAD ID lookups
        self.collection.create_index([("created_at", -1)])
    
    def generate_id(self) -> str:
        """Generate a unique change request ID"""
        return f"CR-{uuid.uuid4().hex[:12]}"
    
    def create(self, cr: ChangeRequest) -> str:
        """Create a new change request"""
        # Don't use mode="json" - it converts datetime to strings, breaking MongoDB sorting
        doc = cr.model_dump()
        self.collection.insert_one(doc)
        return cr.change_request_id
    
    def get_by_id(self, cr_id: str) -> Optional[Dict[str, Any]]:
        """Get change request by ID"""
        doc = self.collection.find_one({"change_request_id": cr_id})
        if doc:
            doc.pop("_id", None)
        return doc
    
    def get_by_ticket_id(self, ticket_id: str) -> List[Dict[str, Any]]:
        """Get all change requests for a ticket"""
        docs = list(self.collection.find(
            {"ticket_id": ticket_id}
        ).sort("created_at", -1))
        for doc in docs:
            doc.pop("_id", None)
        return docs
    
    def get_pending_for_ticket(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        """Get pending change request for a ticket (if any)"""
        doc = self.collection.find_one({
            "ticket_id": ticket_id,
            "status": ChangeRequestStatus.PENDING.value
        })
        if doc:
            doc.pop("_id", None)
        return doc
    
    def get_pending_for_approver(
        self,
        approver_email: str,
        skip: int = 0,
        limit: int = 50,
        approver_aad_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get pending change requests assigned to an approver.
        
        Uses case-insensitive email matching and also matches by aad_id
        to handle cases where user has multiple email aliases (UPN vs primary email).
        """
        import re
        
        # Build query with case-insensitive email match OR aad_id match
        email_pattern = re.compile(f"^{re.escape(approver_email)}$", re.IGNORECASE)
        
        or_conditions = [
            {"assigned_to.email": {"$regex": email_pattern}}
        ]
        
        if approver_aad_id:
            or_conditions.append({"assigned_to.aad_id": approver_aad_id})
        
        docs = list(self.collection.find({
            "$or": or_conditions,
            "status": ChangeRequestStatus.PENDING.value
        }).sort("created_at", -1).skip(skip).limit(limit))
        
        for doc in docs:
            doc.pop("_id", None)
        return docs
    
    def count_pending_for_approver(self, approver_email: str, approver_aad_id: Optional[str] = None) -> int:
        """Count pending CRs for an approver.
        
        Uses case-insensitive email matching and also matches by aad_id.
        """
        import re
        
        email_pattern = re.compile(f"^{re.escape(approver_email)}$", re.IGNORECASE)
        
        or_conditions = [
            {"assigned_to.email": {"$regex": email_pattern}}
        ]
        
        if approver_aad_id:
            or_conditions.append({"assigned_to.aad_id": approver_aad_id})
        
        return self.collection.count_documents({
            "$or": or_conditions,
            "status": ChangeRequestStatus.PENDING.value
        })
    
    def update(self, cr_id: str, updates: Dict[str, Any]) -> bool:
        """Update a change request"""
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = self.collection.update_one(
            {"change_request_id": cr_id},
            {"$set": updates}
        )
        return result.modified_count > 0
    
    def approve(
        self,
        cr_id: str,
        reviewed_by: Dict[str, Any],
        review_notes: Optional[str],
        to_version: int
    ) -> bool:
        """Mark CR as approved"""
        return self.update(cr_id, {
            "status": ChangeRequestStatus.APPROVED.value,
            "reviewed_by": reviewed_by,
            "reviewed_at": datetime.utcnow().isoformat(),
            "review_notes": review_notes,
            "to_version": to_version
        })
    
    def reject(
        self,
        cr_id: str,
        reviewed_by: Dict[str, Any],
        review_notes: Optional[str]
    ) -> bool:
        """Mark CR as rejected"""
        return self.update(cr_id, {
            "status": ChangeRequestStatus.REJECTED.value,
            "reviewed_by": reviewed_by,
            "reviewed_at": datetime.utcnow().isoformat(),
            "review_notes": review_notes
        })
    
    def cancel(self, cr_id: str) -> bool:
        """Mark CR as cancelled"""
        return self.update(cr_id, {
            "status": ChangeRequestStatus.CANCELLED.value
        })
    
    def get_history_for_ticket(
        self,
        ticket_id: str,
        include_pending: bool = False
    ) -> List[Dict[str, Any]]:
        """Get CR history for a ticket (for audit/display)"""
        query = {"ticket_id": ticket_id}
        if not include_pending:
            query["status"] = {"$ne": ChangeRequestStatus.PENDING.value}
        
        docs = list(self.collection.find(query).sort("created_at", -1))
        for doc in docs:
            doc.pop("_id", None)
        return docs
