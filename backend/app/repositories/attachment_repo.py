"""Attachment Repository - Data access for attachments"""
from typing import Any, Dict, List, Optional
from pymongo.collection import Collection
from pymongo import DESCENDING

from .mongo_client import get_collection
from ..domain.models import Attachment
from ..domain.errors import AttachmentNotFoundError
from ..utils.logger import get_logger

logger = get_logger(__name__)


class AttachmentRepository:
    """Repository for attachment metadata operations"""
    
    def __init__(self):
        self._attachments: Collection = get_collection("attachments")
    
    def create_attachment(self, attachment: Attachment) -> Attachment:
        """Create attachment record"""
        doc = attachment.model_dump(mode="json")
        doc["_id"] = attachment.attachment_id
        
        self._attachments.insert_one(doc)
        logger.info(
            f"Created attachment: {attachment.attachment_id}",
            extra={
                "attachment_id": attachment.attachment_id,
                "ticket_id": attachment.ticket_id
            }
        )
        return attachment
    
    def get_attachment(self, attachment_id: str) -> Optional[Attachment]:
        """Get attachment by ID"""
        doc = self._attachments.find_one({"attachment_id": attachment_id})
        if doc:
            doc.pop("_id", None)
            return Attachment.model_validate(doc)
        return None
    
    def get_attachment_or_raise(self, attachment_id: str) -> Attachment:
        """Get attachment by ID or raise error"""
        attachment = self.get_attachment(attachment_id)
        if not attachment:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        return attachment
    
    def get_attachments_for_ticket(self, ticket_id: str) -> List[Attachment]:
        """Get all attachments for a ticket"""
        cursor = self._attachments.find({"ticket_id": ticket_id}).sort("uploaded_at", DESCENDING)
        
        attachments = []
        for doc in cursor:
            doc.pop("_id", None)
            attachments.append(Attachment.model_validate(doc))
        
        return attachments
    
    def get_attachments_for_step(self, ticket_step_id: str) -> List[Attachment]:
        """Get attachments for a specific step"""
        cursor = self._attachments.find({"ticket_step_id": ticket_step_id}).sort("uploaded_at", DESCENDING)
        
        attachments = []
        for doc in cursor:
            doc.pop("_id", None)
            attachments.append(Attachment.model_validate(doc))
        
        return attachments
    
    def get_attachments_by_ids(self, attachment_ids: List[str]) -> List[Attachment]:
        """Get multiple attachments by IDs"""
        cursor = self._attachments.find({"attachment_id": {"$in": attachment_ids}})
        
        attachments = []
        for doc in cursor:
            doc.pop("_id", None)
            attachments.append(Attachment.model_validate(doc))
        
        return attachments
    
    def delete_attachment(self, attachment_id: str) -> bool:
        """Delete attachment record"""
        result = self._attachments.delete_one({"attachment_id": attachment_id})
        if result.deleted_count > 0:
            logger.info(f"Deleted attachment: {attachment_id}")
            return True
        return False
    
    def update_attachment(
        self,
        attachment_id: str,
        updates: Dict[str, Any]
    ) -> Attachment:
        """Update attachment record"""
        result = self._attachments.find_one_and_update(
            {"attachment_id": attachment_id},
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        
        result.pop("_id", None)
        return Attachment.model_validate(result)
    
    def count_attachments_for_ticket(self, ticket_id: str) -> int:
        """Count attachments for a ticket"""
        return self._attachments.count_documents({"ticket_id": ticket_id})
    
    def get_total_size_for_ticket(self, ticket_id: str) -> int:
        """Get total attachment size for a ticket in bytes"""
        pipeline = [
            {"$match": {"ticket_id": ticket_id}},
            {"$group": {"_id": None, "total_size": {"$sum": "$size_bytes"}}}
        ]
        
        result = list(self._attachments.aggregate(pipeline))
        if result:
            return result[0].get("total_size", 0)
        return 0

