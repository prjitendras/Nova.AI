"""Workflow Lookup Service - Business logic for lookup tables"""
from typing import Any, Dict, List, Optional
from datetime import datetime

from ..domain.models import (
    WorkflowLookup, LookupEntry, LookupUser, UserSnapshot, ActorContext
)
from ..domain.errors import (
    NotFoundError, ValidationError, AlreadyExistsError
)
from ..repositories.lookup_repo import LookupRepository
from ..repositories.workflow_repo import WorkflowRepository
from ..utils.idgen import generate_lookup_id, generate_lookup_entry_id
from ..utils.time import utc_now
from ..utils.logger import get_logger

logger = get_logger(__name__)


class LookupService:
    """Service for workflow lookup operations"""
    
    def __init__(self):
        self.repo = LookupRepository()
        self.workflow_repo = WorkflowRepository()
    
    # =========================================================================
    # Lookup CRUD
    # =========================================================================
    
    def create_lookup(
        self,
        workflow_id: str,
        name: str,
        description: Optional[str],
        source_step_id: Optional[str],
        source_field_key: Optional[str],
        actor: ActorContext
    ) -> WorkflowLookup:
        """Create a new lookup table for a workflow"""
        # Verify workflow exists
        workflow = self.workflow_repo.get_workflow(workflow_id)
        if not workflow:
            raise NotFoundError(f"Workflow {workflow_id} not found")
        
        now = utc_now()
        
        lookup = WorkflowLookup(
            lookup_id=generate_lookup_id(),
            workflow_id=workflow_id,
            name=name,
            description=description,
            source_step_id=source_step_id,
            source_field_key=source_field_key,
            entries=[],
            created_by=UserSnapshot(
                aad_id=actor.aad_id,
                email=actor.email,
                display_name=actor.display_name
            ),
            created_at=now,
            is_active=True,
            version=1
        )
        
        return self.repo.create_lookup(lookup)
    
    def get_lookup(self, lookup_id: str) -> WorkflowLookup:
        """Get lookup by ID"""
        return self.repo.get_lookup_or_raise(lookup_id)
    
    def get_lookups_for_workflow(
        self, 
        workflow_id: str, 
        include_inactive: bool = False
    ) -> List[WorkflowLookup]:
        """Get all lookups for a workflow"""
        return self.repo.get_lookups_by_workflow(workflow_id, include_inactive)
    
    def update_lookup(
        self,
        lookup_id: str,
        name: Optional[str],
        description: Optional[str],
        source_step_id: Optional[str],
        source_field_key: Optional[str],
        actor: ActorContext,
        expected_version: Optional[int] = None
    ) -> WorkflowLookup:
        """Update lookup metadata"""
        updates = {}
        
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if source_step_id is not None:
            updates["source_step_id"] = source_step_id
        if source_field_key is not None:
            updates["source_field_key"] = source_field_key
        
        if not updates:
            return self.repo.get_lookup_or_raise(lookup_id)
        
        updates["updated_by"] = {
            "aad_id": actor.aad_id,
            "email": actor.email,
            "display_name": actor.display_name
        }
        
        return self.repo.update_lookup(lookup_id, updates, expected_version)
    
    def delete_lookup(self, lookup_id: str) -> bool:
        """Delete a lookup (soft delete)"""
        return self.repo.delete_lookup(lookup_id)
    
    # =========================================================================
    # Entry Management
    # =========================================================================
    
    def add_entry(
        self,
        lookup_id: str,
        key: str,
        display_label: Optional[str],
        users: List[Dict[str, Any]],
        actor: ActorContext
    ) -> WorkflowLookup:
        """Add a new entry to a lookup table"""
        # Validate users
        lookup_users = []
        primary_count = 0
        
        for idx, user_data in enumerate(users):
            is_primary = user_data.get("is_primary", False)
            if is_primary:
                primary_count += 1
            
            lookup_users.append(LookupUser(
                aad_id=user_data.get("aad_id"),
                email=user_data["email"],
                display_name=user_data["display_name"],
                is_primary=is_primary,
                order=user_data.get("order", idx)
            ))
        
        # Ensure at least one primary if users exist
        if lookup_users and primary_count == 0:
            lookup_users[0].is_primary = True
        elif primary_count > 1:
            # Only allow one primary - keep the first
            seen_primary = False
            for user in lookup_users:
                if user.is_primary:
                    if seen_primary:
                        user.is_primary = False
                    else:
                        seen_primary = True
        
        entry = LookupEntry(
            entry_id=generate_lookup_entry_id(),
            key=key,
            display_label=display_label,
            users=lookup_users,
            is_active=True
        )
        
        return self.repo.add_entry(lookup_id, entry)
    
    def update_entry(
        self,
        lookup_id: str,
        entry_id: str,
        key: Optional[str] = None,
        display_label: Optional[str] = None,
        is_active: Optional[bool] = None,
        actor: Optional[ActorContext] = None
    ) -> WorkflowLookup:
        """Update an entry's metadata"""
        updates = {}
        if key is not None:
            updates["key"] = key
        if display_label is not None:
            updates["display_label"] = display_label
        if is_active is not None:
            updates["is_active"] = is_active
        
        if not updates:
            return self.repo.get_lookup_or_raise(lookup_id)
        
        return self.repo.update_entry(lookup_id, entry_id, updates)
    
    def remove_entry(self, lookup_id: str, entry_id: str) -> WorkflowLookup:
        """Remove an entry from a lookup table"""
        return self.repo.remove_entry(lookup_id, entry_id)
    
    def set_entry_users(
        self,
        lookup_id: str,
        entry_id: str,
        users: List[Dict[str, Any]],
        actor: ActorContext
    ) -> WorkflowLookup:
        """Replace all users for an entry"""
        lookup_users = []
        primary_count = 0
        
        for idx, user_data in enumerate(users):
            is_primary = user_data.get("is_primary", False)
            if is_primary:
                primary_count += 1
            
            lookup_users.append(LookupUser(
                aad_id=user_data.get("aad_id"),
                email=user_data["email"],
                display_name=user_data["display_name"],
                is_primary=is_primary,
                order=user_data.get("order", idx)
            ))
        
        # Ensure exactly one primary if users exist
        if lookup_users and primary_count == 0:
            lookup_users[0].is_primary = True
        elif primary_count > 1:
            seen_primary = False
            for user in lookup_users:
                if user.is_primary:
                    if seen_primary:
                        user.is_primary = False
                    else:
                        seen_primary = True
        
        return self.repo.set_entry_users(lookup_id, entry_id, lookup_users)
    
    # =========================================================================
    # Bulk Operations
    # =========================================================================
    
    def save_lookup_with_entries(
        self,
        lookup_id: str,
        entries: List[Dict[str, Any]],
        actor: ActorContext
    ) -> WorkflowLookup:
        """
        Save all entries for a lookup in one operation.
        Used by the frontend to save the complete lookup configuration.
        """
        lookup = self.repo.get_lookup_or_raise(lookup_id)
        
        # Build the entries list
        lookup_entries = []
        for entry_data in entries:
            users = []
            primary_count = 0
            
            for idx, user_data in enumerate(entry_data.get("users", [])):
                is_primary = user_data.get("is_primary", False)
                if is_primary:
                    primary_count += 1
                
                users.append(LookupUser(
                    aad_id=user_data.get("aad_id"),
                    email=user_data["email"],
                    display_name=user_data["display_name"],
                    is_primary=is_primary,
                    order=user_data.get("order", idx)
                ))
            
            # Ensure exactly one primary
            if users and primary_count == 0:
                users[0].is_primary = True
            elif primary_count > 1:
                seen_primary = False
                for user in users:
                    if user.is_primary:
                        if seen_primary:
                            user.is_primary = False
                        else:
                            seen_primary = True
            
            lookup_entries.append(LookupEntry(
                entry_id=entry_data.get("entry_id") or generate_lookup_entry_id(),
                key=entry_data["key"],
                display_label=entry_data.get("display_label"),
                users=users,
                is_active=entry_data.get("is_active", True)
            ))
        
        # Update the lookup with all entries
        updates = {
            "entries": [e.model_dump(mode="json") for e in lookup_entries],
            "updated_by": {
                "aad_id": actor.aad_id,
                "email": actor.email,
                "display_name": actor.display_name
            }
        }
        
        return self.repo.update_lookup(lookup_id, updates)
    
    # =========================================================================
    # Runtime Resolution
    # =========================================================================
    
    def resolve_users_for_form_value(
        self,
        workflow_id: str,
        step_id: str,
        field_key: str,
        field_value: str
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Resolve users based on a form field selection.
        Used at runtime to display users in LOOKUP_USER_SELECT fields.
        
        Returns list of user dicts with {email, display_name, is_primary} or None if no lookup.
        """
        logger.info(f"[LOOKUP SERVICE] resolve_users_for_form_value called: workflow_id={workflow_id}, step_id={step_id}, field_key={field_key}, field_value={field_value}")
        
        lookup = self.repo.get_lookup_by_source_field(workflow_id, step_id, field_key)
        if not lookup:
            logger.warning(f"[LOOKUP SERVICE] No lookup found for step_id={step_id}, field_key={field_key}")
            return None
        
        logger.info(f"[LOOKUP SERVICE] Found lookup: {lookup.name} (id={lookup.lookup_id}), entries={len(lookup.entries)}")
        
        for entry in lookup.entries:
            logger.info(f"[LOOKUP SERVICE] Checking entry: key='{entry.key}' vs field_value='{field_value}', is_active={entry.is_active}")
            if entry.key == field_value and entry.is_active:
                users = [
                    {
                        "aad_id": u.aad_id,
                        "email": u.email,
                        "display_name": u.display_name,
                        "is_primary": u.is_primary
                    }
                    for u in sorted(entry.users, key=lambda x: (not x.is_primary, x.order))
                ]
                logger.info(f"[LOOKUP SERVICE] Found {len(users)} users for '{field_value}': {[u['display_name'] for u in users]}")
                return users
        
        logger.warning(f"[LOOKUP SERVICE] No matching entry found for field_value='{field_value}'")
        return None
    
    def get_primary_approver_from_lookup(
        self,
        workflow_id: str,
        lookup_id: str,
        key: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get the primary user from a lookup to use as approver.
        
        Returns dict with {email, display_name, aad_id} or None.
        """
        user = self.repo.get_primary_user(workflow_id, lookup_id, key)
        if user:
            return {
                "aad_id": user.aad_id,
                "email": user.email,
                "display_name": user.display_name
            }
        return None
