"""Workflow Lookup Repository - Data access for workflow lookup tables"""
from typing import Any, Dict, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo import DESCENDING

from .mongo_client import get_collection
from ..domain.models import WorkflowLookup, LookupEntry, LookupUser
from ..domain.errors import NotFoundError, ConcurrencyError, AlreadyExistsError
from ..utils.logger import get_logger

logger = get_logger(__name__)


class LookupRepository:
    """Repository for workflow lookup operations"""
    
    def __init__(self):
        self._lookups: Collection = get_collection("workflow_lookups")
        # Ensure indexes
        self._lookups.create_index("lookup_id", unique=True)
        self._lookups.create_index("workflow_id")
    
    # =========================================================================
    # Lookup CRUD
    # =========================================================================
    
    def create_lookup(self, lookup: WorkflowLookup) -> WorkflowLookup:
        """Create a new lookup table"""
        doc = lookup.model_dump(mode="json")
        doc["_id"] = lookup.lookup_id
        
        try:
            self._lookups.insert_one(doc)
            logger.info(f"Created lookup: {lookup.lookup_id} for workflow: {lookup.workflow_id}")
            return lookup
        except Exception as e:
            if "duplicate key" in str(e).lower():
                raise AlreadyExistsError(f"Lookup {lookup.lookup_id} already exists")
            raise
    
    def get_lookup(self, lookup_id: str) -> Optional[WorkflowLookup]:
        """Get lookup by ID"""
        doc = self._lookups.find_one({"lookup_id": lookup_id})
        if doc:
            doc.pop("_id", None)
            return WorkflowLookup.model_validate(doc)
        return None
    
    def get_lookup_or_raise(self, lookup_id: str) -> WorkflowLookup:
        """Get lookup by ID or raise error"""
        lookup = self.get_lookup(lookup_id)
        if not lookup:
            raise NotFoundError(f"Lookup {lookup_id} not found")
        return lookup
    
    def get_lookups_by_workflow(
        self, 
        workflow_id: str, 
        include_inactive: bool = False
    ) -> List[WorkflowLookup]:
        """Get all lookups for a workflow"""
        query = {"workflow_id": workflow_id}
        if not include_inactive:
            query["is_active"] = True
        
        docs = self._lookups.find(query).sort("created_at", DESCENDING)
        return [WorkflowLookup.model_validate({k: v for k, v in doc.items() if k != "_id"}) for doc in docs]
    
    def update_lookup(
        self, 
        lookup_id: str, 
        updates: Dict[str, Any],
        expected_version: Optional[int] = None
    ) -> WorkflowLookup:
        """
        Update lookup with optimistic concurrency
        
        Args:
            lookup_id: Lookup ID
            updates: Fields to update
            expected_version: Expected version for optimistic lock
        """
        updates["updated_at"] = datetime.utcnow()
        
        filter_query = {"lookup_id": lookup_id}
        if expected_version is not None:
            filter_query["version"] = expected_version
            updates["version"] = expected_version + 1
        
        result = self._lookups.find_one_and_update(
            filter_query,
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            if expected_version is not None:
                exists = self._lookups.find_one({"lookup_id": lookup_id})
                if exists:
                    raise ConcurrencyError(
                        f"Lookup {lookup_id} was modified. Please refresh and try again.",
                        details={"expected_version": expected_version}
                    )
            raise NotFoundError(f"Lookup {lookup_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Updated lookup: {lookup_id}")
        return WorkflowLookup.model_validate(result)
    
    def delete_lookup(self, lookup_id: str) -> bool:
        """Delete a lookup (soft delete by setting is_active=False)"""
        result = self._lookups.update_one(
            {"lookup_id": lookup_id},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        if result.modified_count > 0:
            logger.info(f"Deleted lookup: {lookup_id}")
            return True
        return False
    
    def hard_delete_lookup(self, lookup_id: str) -> bool:
        """Permanently delete a lookup"""
        result = self._lookups.delete_one({"lookup_id": lookup_id})
        if result.deleted_count > 0:
            logger.info(f"Hard deleted lookup: {lookup_id}")
            return True
        return False
    
    # =========================================================================
    # Entry Operations
    # =========================================================================
    
    def add_entry(self, lookup_id: str, entry: LookupEntry) -> WorkflowLookup:
        """Add an entry to a lookup table"""
        lookup = self.get_lookup_or_raise(lookup_id)
        
        # Check for duplicate key
        existing_keys = [e.key for e in lookup.entries]
        if entry.key in existing_keys:
            raise AlreadyExistsError(f"Entry with key '{entry.key}' already exists")
        
        result = self._lookups.find_one_and_update(
            {"lookup_id": lookup_id},
            {
                "$push": {"entries": entry.model_dump(mode="json")},
                "$set": {"updated_at": datetime.utcnow()},
                "$inc": {"version": 1}
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Lookup {lookup_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Added entry to lookup: {lookup_id}, key: {entry.key}")
        return WorkflowLookup.model_validate(result)
    
    def update_entry(self, lookup_id: str, entry_id: str, updates: Dict[str, Any]) -> WorkflowLookup:
        """Update an entry within a lookup table"""
        # Build the update for the specific array element
        set_updates = {f"entries.$.{k}": v for k, v in updates.items()}
        set_updates["updated_at"] = datetime.utcnow()
        
        result = self._lookups.find_one_and_update(
            {"lookup_id": lookup_id, "entries.entry_id": entry_id},
            {
                "$set": set_updates,
                "$inc": {"version": 1}
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Entry {entry_id} not found in lookup {lookup_id}")
        
        result.pop("_id", None)
        logger.info(f"Updated entry in lookup: {lookup_id}, entry: {entry_id}")
        return WorkflowLookup.model_validate(result)
    
    def remove_entry(self, lookup_id: str, entry_id: str) -> WorkflowLookup:
        """Remove an entry from a lookup table"""
        result = self._lookups.find_one_and_update(
            {"lookup_id": lookup_id},
            {
                "$pull": {"entries": {"entry_id": entry_id}},
                "$set": {"updated_at": datetime.utcnow()},
                "$inc": {"version": 1}
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Lookup {lookup_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Removed entry from lookup: {lookup_id}, entry: {entry_id}")
        return WorkflowLookup.model_validate(result)
    
    # =========================================================================
    # User Operations
    # =========================================================================
    
    def set_entry_users(
        self, 
        lookup_id: str, 
        entry_id: str, 
        users: List[LookupUser]
    ) -> WorkflowLookup:
        """Replace all users for an entry"""
        result = self._lookups.find_one_and_update(
            {"lookup_id": lookup_id, "entries.entry_id": entry_id},
            {
                "$set": {
                    "entries.$.users": [u.model_dump(mode="json") for u in users],
                    "updated_at": datetime.utcnow()
                },
                "$inc": {"version": 1}
            },
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Entry {entry_id} not found in lookup {lookup_id}")
        
        result.pop("_id", None)
        logger.info(f"Updated users for entry: {lookup_id}/{entry_id}")
        return WorkflowLookup.model_validate(result)
    
    # =========================================================================
    # Lookup Resolution
    # =========================================================================
    
    def resolve_lookup_users(
        self, 
        workflow_id: str, 
        lookup_id: str, 
        key: str
    ) -> Optional[List[LookupUser]]:
        """
        Resolve users for a given lookup key.
        Returns list of LookupUser objects or None if not found.
        """
        lookup = self.get_lookup(lookup_id)
        if not lookup or lookup.workflow_id != workflow_id:
            return None
        
        for entry in lookup.entries:
            if entry.key == key and entry.is_active:
                return entry.users
        
        return None
    
    def get_primary_user(
        self, 
        workflow_id: str, 
        lookup_id: str, 
        key: str
    ) -> Optional[LookupUser]:
        """
        Get the primary user for a given lookup key.
        Used for approval routing.
        """
        users = self.resolve_lookup_users(workflow_id, lookup_id, key)
        if not users:
            return None
        
        # Find primary user
        for user in users:
            if user.is_primary:
                return user
        
        # If no primary designated, return first user
        return users[0] if users else None
    
    def get_lookup_by_source_field(
        self,
        workflow_id: str,
        step_id: str,
        field_key: str
    ) -> Optional[WorkflowLookup]:
        """
        Find a lookup table linked to a specific form field.
        Used at runtime to auto-populate users based on dropdown selection.
        """
        query = {
            "workflow_id": workflow_id,
            "source_step_id": step_id,
            "source_field_key": field_key,
            "is_active": True
        }
        logger.info(f"[LOOKUP REPO] Searching for lookup with: {query}")
        
        doc = self._lookups.find_one(query)
        
        if doc:
            doc.pop("_id", None)
            logger.info(f"[LOOKUP REPO] Found lookup: {doc.get('name')} (id={doc.get('lookup_id')})")
            return WorkflowLookup.model_validate(doc)
        
        # Debug: Log what lookups exist for this workflow
        all_lookups = list(self._lookups.find({"workflow_id": workflow_id}))
        logger.warning(f"[LOOKUP REPO] No match. Available lookups for workflow: {[(l.get('name'), l.get('source_step_id'), l.get('source_field_key')) for l in all_lookups]}")
        
        return None
