"""Admin Repository - Manage admin users, audit events, and email templates"""
import re
from typing import Any, Dict, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError

from .mongo_client import get_collection
from ..domain.models import AdminUser, AdminAuditEvent, EmailTemplateOverride, UserAccess
from ..domain.enums import AdminRole, AdminAuditAction
from ..utils.logger import get_logger
from ..utils.time import utc_now
from ..utils.idgen import generate_id

logger = get_logger(__name__)


class AdminRepository:
    """Repository for admin operations"""
    
    def __init__(self):
        self._admin_users: Collection = get_collection("admin_users")
        self._admin_audit: Collection = get_collection("admin_audit")
        self._email_templates: Collection = get_collection("email_template_overrides")
        self._user_access: Collection = get_collection("user_access")
        self._bootstrap_tokens: Collection = get_collection("bootstrap_tokens")
        
        # Ensure indexes
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            # Admin users - unique email
            self._admin_users.create_index("email", unique=True)
            self._admin_users.create_index("aad_id", sparse=True)
            self._admin_users.create_index("role")
            self._admin_users.create_index("is_active")
            
            # Admin audit - timestamp desc for recent queries
            self._admin_audit.create_index([("timestamp", DESCENDING)])
            self._admin_audit.create_index("actor_email")
            self._admin_audit.create_index("action")
            
            # Email templates
            self._email_templates.create_index("template_key")
            self._email_templates.create_index("workflow_id", sparse=True)
            
            # User access - unique email
            self._user_access.create_index("email", unique=True)
            self._user_access.create_index("aad_id", sparse=True)
            self._user_access.create_index("is_active")
            
            # Bootstrap tokens - TTL index for auto-expiry
            self._bootstrap_tokens.create_index("token", unique=True)
            self._bootstrap_tokens.create_index("expires_at", expireAfterSeconds=0)  # MongoDB TTL
        except Exception as e:
            logger.warning(f"Failed to create admin indexes: {e}")
    
    # =========================================================================
    # Admin Users
    # =========================================================================
    
    def get_admin_user_by_email(self, email: str) -> Optional[AdminUser]:
        """Get admin user by email"""
        escaped_email = re.escape(email)
        doc = self._admin_users.find_one({
            "email": {"$regex": f"^{escaped_email}$", "$options": "i"},
            "is_active": True
        })
        if doc:
            doc.pop("_id", None)
            return AdminUser(**doc)
        return None
    
    def get_admin_user_by_aad_id(self, aad_id: str) -> Optional[AdminUser]:
        """Get admin user by Azure AD ID"""
        doc = self._admin_users.find_one({
            "aad_id": aad_id,
            "is_active": True
        })
        if doc:
            doc.pop("_id", None)
            return AdminUser(**doc)
        return None
    
    def is_super_admin(self, email: str) -> bool:
        """Check if user is a super admin"""
        admin = self.get_admin_user_by_email(email)
        return admin is not None and admin.role == AdminRole.SUPER_ADMIN
    
    def is_admin(self, email: str) -> bool:
        """Check if user is an admin (includes super admin)"""
        admin = self.get_admin_user_by_email(email)
        return admin is not None and admin.role in [AdminRole.ADMIN, AdminRole.SUPER_ADMIN]
    
    def is_designer(self, email: str) -> bool:
        """Check if user has designer access"""
        admin = self.get_admin_user_by_email(email)
        return admin is not None and admin.role in [AdminRole.DESIGNER, AdminRole.ADMIN, AdminRole.SUPER_ADMIN]
    
    def get_user_role(self, email: str) -> Optional[AdminRole]:
        """Get user's admin role by email only"""
        admin = self.get_admin_user_by_email(email)
        return admin.role if admin else None
    
    def get_user_role_by_email_or_aad_id(
        self, 
        email: str, 
        aad_id: Optional[str] = None
    ) -> tuple[Optional[AdminRole], Optional[AdminUser]]:
        """
        Get user's admin role by email OR AAD ID.
        
        This handles the case where the user's email in the JWT token
        might differ from the email stored when granting access.
        The AAD ID (Object ID) is stable across all Azure AD claims.
        
        Returns: (role, admin_user) tuple
        """
        # First try by email (case-insensitive)
        admin = self.get_admin_user_by_email(email)
        if admin:
            return admin.role, admin
        
        # Fallback: try by AAD ID if provided
        if aad_id:
            admin = self.get_admin_user_by_aad_id(aad_id)
            if admin:
                logger.info(
                    f"User found by AAD ID fallback: {aad_id} -> {admin.email}",
                    extra={"token_email": email, "stored_email": admin.email}
                )
                return admin.role, admin
        
        return None, None
    
    def update_user_profile(
        self, 
        email: str, 
        display_name: Optional[str] = None, 
        aad_id: Optional[str] = None
    ) -> bool:
        """
        Update user profile from Azure AD.
        Called when user logs in to sync their display name and aad_id.
        """
        update_fields = {}
        if display_name:
            update_fields["display_name"] = display_name
        if aad_id:
            update_fields["aad_id"] = aad_id
        
        if not update_fields:
            return False
        
        escaped_email = re.escape(email)
        result = self._admin_users.update_one(
            {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}, "is_active": True},
            {"$set": update_fields}
        )
        
        return result.modified_count > 0
    
    def create_admin_user(self, admin_user: AdminUser) -> AdminUser:
        """Create a new admin user"""
        doc = admin_user.model_dump(mode="json")
        doc["_id"] = admin_user.admin_user_id
        
        self._admin_users.insert_one(doc)
        logger.info(
            f"Created admin user: {admin_user.email}",
            extra={"role": admin_user.role.value}
        )
        return admin_user
    
    def grant_access(
        self,
        email: str,
        display_name: str,
        role: AdminRole,
        granted_by: str,
        aad_id: Optional[str] = None
    ) -> AdminUser:
        """Grant admin access to a user"""
        # Check if user already has access (including inactive)
        escaped_email = re.escape(email)
        existing = self._admin_users.find_one({
            "email": {"$regex": f"^{escaped_email}$", "$options": "i"}
        })
        
        if existing:
            # Reactivate or update role
            self._admin_users.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "role": role.value,
                        "is_active": True,
                        "granted_by": granted_by,
                        "granted_at": utc_now().isoformat(),
                        "deactivated_at": None,
                        "deactivated_by": None,
                        "display_name": display_name,
                        "aad_id": aad_id or existing.get("aad_id")
                    }
                }
            )
            existing.pop("_id", None)
            existing["role"] = role.value
            existing["is_active"] = True
            existing["granted_by"] = granted_by
            existing["granted_at"] = utc_now()
            return AdminUser(**existing)
        
        # Create new admin user (with race condition handling)
        admin_user = AdminUser(
            admin_user_id=generate_id("ADM"),
            aad_id=aad_id,
            email=email,
            display_name=display_name,
            role=role,
            granted_by=granted_by,
            granted_at=utc_now(),
            is_active=True
        )
        
        try:
            return self.create_admin_user(admin_user)
        except DuplicateKeyError:
            # Handle race condition - user may have been created by another request
            logger.info(
                f"Grant access: Admin user {email} already exists (race condition), updating instead",
                extra={"granted_by": granted_by}
            )
            # Fetch the existing record and update it
            existing = self._admin_users.find_one({
                "email": {"$regex": f"^{escaped_email}$", "$options": "i"}
            })
            if existing:
                self._admin_users.update_one(
                    {"_id": existing["_id"]},
                    {
                        "$set": {
                            "role": role.value,
                            "is_active": True,
                            "granted_by": granted_by,
                            "granted_at": utc_now().isoformat(),
                            "deactivated_at": None,
                            "deactivated_by": None,
                            "display_name": display_name,
                            "aad_id": aad_id or existing.get("aad_id")
                        }
                    }
                )
                existing.pop("_id", None)
                existing["role"] = role.value
                existing["is_active"] = True
                return AdminUser(**existing)
            # Fallback - this shouldn't happen but return the created user anyway
            return admin_user
    
    def revoke_access(self, email: str, revoked_by: str) -> bool:
        """Revoke admin access"""
        escaped_email = re.escape(email)
        result = self._admin_users.update_one(
            {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}, "is_active": True},
            {
                "$set": {
                    "is_active": False,
                    "deactivated_at": utc_now().isoformat(),
                    "deactivated_by": revoked_by
                }
            }
        )
        
        if result.modified_count > 0:
            logger.info(f"Revoked admin access: {email}", extra={"revoked_by": revoked_by})
            return True
        return False
    
    def list_admin_users(
        self,
        role: Optional[AdminRole] = None,
        include_inactive: bool = False,
        skip: int = 0,
        limit: int = 50
    ) -> List[AdminUser]:
        """List admin users"""
        query: Dict[str, Any] = {}
        
        if not include_inactive:
            query["is_active"] = True
        
        if role:
            query["role"] = role.value
        
        users = []
        for doc in self._admin_users.find(query).sort("granted_at", DESCENDING).skip(skip).limit(limit):
            doc.pop("_id", None)
            users.append(AdminUser(**doc))
        
        return users
    
    def count_admin_users(
        self,
        role: Optional[AdminRole] = None,
        include_inactive: bool = False
    ) -> int:
        """Count admin users"""
        query: Dict[str, Any] = {}
        
        if not include_inactive:
            query["is_active"] = True
        
        if role:
            query["role"] = role.value
        
        return self._admin_users.count_documents(query)
    
    def has_any_super_admin(self) -> bool:
        """Check if any super admin exists"""
        return self._admin_users.count_documents({
            "role": AdminRole.SUPER_ADMIN.value,
            "is_active": True
        }) > 0
    
    # =========================================================================
    # Admin Audit Log
    # =========================================================================
    
    def log_admin_action(
        self,
        action: AdminAuditAction,
        actor_email: str,
        actor_display_name: str,
        target_email: Optional[str] = None,
        target_display_name: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None
    ) -> AdminAuditEvent:
        """Log an admin action"""
        event = AdminAuditEvent(
            audit_id=generate_id("AAE"),
            action=action,
            actor_email=actor_email,
            actor_display_name=actor_display_name,
            target_email=target_email,
            target_display_name=target_display_name,
            details=details or {},
            timestamp=utc_now(),
            ip_address=ip_address
        )
        
        doc = event.model_dump(mode="json")
        doc["_id"] = event.audit_id
        
        self._admin_audit.insert_one(doc)
        
        logger.info(
            f"Admin action: {action.value}",
            extra={
                "actor": actor_email,
                "target": target_email,
                "audit_id": event.audit_id
            }
        )
        
        return event
    
    def get_admin_audit_log(
        self,
        action: Optional[AdminAuditAction] = None,
        actor_email: Optional[str] = None,
        target_email: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[AdminAuditEvent]:
        """Get admin audit log with filters"""
        query = self._build_audit_query(action, actor_email, target_email, from_date, to_date)
        
        events = []
        for doc in self._admin_audit.find(query).sort("timestamp", DESCENDING).skip(skip).limit(limit):
            doc.pop("_id", None)
            events.append(AdminAuditEvent(**doc))
        
        return events
    
    def count_admin_audit_log(
        self,
        action: Optional[AdminAuditAction] = None,
        actor_email: Optional[str] = None,
        target_email: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None
    ) -> int:
        """Count admin audit events with same filters as get"""
        query = self._build_audit_query(action, actor_email, target_email, from_date, to_date)
        return self._admin_audit.count_documents(query)
    
    def _build_audit_query(
        self,
        action: Optional[AdminAuditAction] = None,
        actor_email: Optional[str] = None,
        target_email: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Build MongoDB query for audit log filtering"""
        import re
        query: Dict[str, Any] = {}
        
        if action:
            query["action"] = action.value
        
        # Use partial matching (contains) with escaped special regex chars
        if actor_email:
            escaped = re.escape(actor_email)
            query["$or"] = [
                {"actor_email": {"$regex": escaped, "$options": "i"}},
                {"actor_display_name": {"$regex": escaped, "$options": "i"}}
            ]
        
        if target_email:
            escaped = re.escape(target_email)
            target_query = {
                "$or": [
                    {"target_email": {"$regex": escaped, "$options": "i"}},
                    {"target_display_name": {"$regex": escaped, "$options": "i"}}
                ]
            }
            # Combine with existing $or if present
            if "$or" in query:
                query["$and"] = [{"$or": query.pop("$or")}, target_query]
            else:
                query.update(target_query)
        
        if from_date or to_date:
            query["timestamp"] = {}
            if from_date:
                query["timestamp"]["$gte"] = from_date.isoformat()
            if to_date:
                query["timestamp"]["$lte"] = to_date.isoformat()
        
        return query
    
    # =========================================================================
    # Email Template Overrides
    # =========================================================================
    
    def get_email_template_override(
        self,
        template_key: str,
        workflow_id: Optional[str] = None
    ) -> Optional[EmailTemplateOverride]:
        """Get email template override"""
        query = {
            "template_key": template_key,
            "is_active": True
        }
        
        # First try workflow-specific
        if workflow_id:
            query["workflow_id"] = workflow_id
            doc = self._email_templates.find_one(query)
            if doc:
                doc.pop("_id", None)
                return EmailTemplateOverride(**doc)
        
        # Fall back to global
        query["workflow_id"] = None
        doc = self._email_templates.find_one(query)
        if doc:
            doc.pop("_id", None)
            return EmailTemplateOverride(**doc)
        
        return None
    
    def save_email_template_override(
        self,
        template_key: str,
        custom_subject: Optional[str],
        custom_body: Optional[str],
        created_by: str,
        workflow_id: Optional[str] = None
    ) -> EmailTemplateOverride:
        """Save or update email template override"""
        # Check for existing
        query = {
            "template_key": template_key,
            "workflow_id": workflow_id
        }
        existing = self._email_templates.find_one(query)
        
        now = utc_now()
        
        if existing:
            # Update existing
            self._email_templates.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "custom_subject": custom_subject,
                        "custom_body": custom_body,
                        "updated_at": now.isoformat(),
                        "updated_by": created_by,
                        "is_active": True
                    }
                }
            )
            existing.pop("_id", None)
            existing["custom_subject"] = custom_subject
            existing["custom_body"] = custom_body
            existing["updated_at"] = now
            existing["updated_by"] = created_by
            return EmailTemplateOverride(**existing)
        
        # Create new
        template = EmailTemplateOverride(
            template_id=generate_id("ETM"),
            template_key=template_key,
            workflow_id=workflow_id,
            custom_subject=custom_subject,
            custom_body=custom_body,
            is_active=True,
            created_at=now,
            created_by=created_by
        )
        
        doc = template.model_dump(mode="json")
        doc["_id"] = template.template_id
        
        self._email_templates.insert_one(doc)
        
        logger.info(
            f"Saved email template override: {template_key}",
            extra={"workflow_id": workflow_id}
        )
        
        return template
    
    def list_email_template_overrides(
        self,
        workflow_id: Optional[str] = None,
        include_inactive: bool = False
    ) -> List[EmailTemplateOverride]:
        """List all email template overrides"""
        query: Dict[str, Any] = {}
        
        if not include_inactive:
            query["is_active"] = True
        
        if workflow_id is not None:
            query["workflow_id"] = workflow_id
        
        templates = []
        for doc in self._email_templates.find(query).sort("template_key", 1):
            doc.pop("_id", None)
            templates.append(EmailTemplateOverride(**doc))
        
        return templates
    
    def delete_email_template_override(self, template_id: str) -> bool:
        """Soft delete email template override"""
        result = self._email_templates.update_one(
            {"template_id": template_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0

    # =========================================================================
    # User Access (Persona-based access control)
    # =========================================================================
    
    def get_user_access_by_email(self, email: str, include_inactive: bool = False) -> Optional[UserAccess]:
        """Get user access record by email (case-insensitive)"""
        # Escape special regex characters in email
        escaped_email = re.escape(email)
        query = {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}}
        if not include_inactive:
            query["is_active"] = True
        
        doc = self._user_access.find_one(query)
        if doc:
            doc.pop("_id", None)
            return UserAccess(**doc)
        return None
    
    def get_user_access_by_aad_id(self, aad_id: str) -> Optional[UserAccess]:
        """Get user access by Azure AD ID"""
        doc = self._user_access.find_one({
            "aad_id": aad_id,
            "is_active": True
        })
        if doc:
            doc.pop("_id", None)
            return UserAccess(**doc)
        return None
    
    def get_user_access(self, email: str, aad_id: Optional[str] = None) -> Optional[UserAccess]:
        """Get user access by email or AAD ID (handles email format mismatches)"""
        # Try email first
        access = self.get_user_access_by_email(email)
        if access:
            return access
        
        # Fallback to AAD ID
        if aad_id:
            access = self.get_user_access_by_aad_id(aad_id)
            if access:
                logger.info(
                    f"User access found by AAD ID fallback: {aad_id} -> {access.email}",
                    extra={"token_email": email, "stored_email": access.email}
                )
                return access
        
        return None
    
    def create_user_access(
        self,
        email: str,
        display_name: str,
        granted_by: str,
        has_designer_access: bool = False,
        has_manager_access: bool = False,
        has_agent_access: bool = False,
        aad_id: Optional[str] = None,
        onboard_source: str = "MANUAL",
        onboarded_by: Optional[str] = None,
        onboarded_by_display_name: Optional[str] = None
    ) -> UserAccess:
        """Create a new user access record with per-persona source tracking"""
        now = utc_now()
        
        # Set per-persona sources based on what's being granted
        designer_source = onboard_source if has_designer_access else None
        designer_granted_by = granted_by if has_designer_access else None
        designer_granted_at = now if has_designer_access else None
        
        manager_source = onboard_source if has_manager_access else None
        manager_granted_by = granted_by if has_manager_access else None
        manager_granted_at = now if has_manager_access else None
        
        agent_source = onboard_source if has_agent_access else None
        agent_granted_by = granted_by if has_agent_access else None
        agent_granted_at = now if has_agent_access else None
        
        access = UserAccess(
            user_access_id=generate_id("ua"),
            email=email,
            display_name=display_name,
            aad_id=aad_id,
            has_designer_access=has_designer_access,
            has_manager_access=has_manager_access,
            has_agent_access=has_agent_access,
            # Per-persona tracking
            designer_source=designer_source,
            designer_granted_by=designer_granted_by,
            designer_granted_at=designer_granted_at,
            manager_source=manager_source,
            manager_granted_by=manager_granted_by,
            manager_granted_at=manager_granted_at,
            agent_source=agent_source,
            agent_granted_by=agent_granted_by,
            agent_granted_at=agent_granted_at,
            # Legacy fields
            onboard_source=onboard_source,
            onboarded_by=onboarded_by,
            onboarded_by_display_name=onboarded_by_display_name,
            granted_by=granted_by,
            granted_at=now,
            is_active=True
        )
        
        self._user_access.insert_one(access.model_dump(mode="json"))
        logger.info(
            f"Created user access: {email} (source: {onboard_source})",
            extra={
                "designer": has_designer_access,
                "manager": has_manager_access,
                "agent": has_agent_access,
                "onboard_source": onboard_source,
                "designer_source": designer_source,
                "manager_source": manager_source,
                "agent_source": agent_source
            }
        )
        
        return access
    
    def auto_onboard_user(
        self,
        email: str,
        display_name: str,
        triggered_by_email: str,
        triggered_by_display_name: str,
        as_manager: bool = False,
        as_agent: bool = False,
        aad_id: Optional[str] = None,
        onboard_source: Optional[str] = None
    ) -> tuple[Optional[UserAccess], bool, bool, bool]:
        """
        Auto-onboard a user when they are assigned a task or approval.
        
        Args:
            email: User's email
            display_name: User's display name
            triggered_by_email: Email of the person triggering the onboard
            triggered_by_display_name: Display name of the person triggering the onboard
            as_manager: Grant manager access (for approvers)
            as_agent: Grant agent access (for task assignees)
            aad_id: Azure AD ID if available
            onboard_source: Source of onboarding (defaults based on as_manager/as_agent)
        
        Returns:
            tuple[UserAccess, was_created, added_manager, added_agent]:
            - was_created: True if new user was created
            - added_manager: True if manager persona was added (new user or existing user updated)
            - added_agent: True if agent persona was added (new user or existing user updated)
        """
        # Determine onboard source FIRST (needed for both new creation and reactivation)
        if onboard_source is None:
            if as_manager:
                onboard_source = "APPROVAL_ASSIGNMENT"
            elif as_agent:
                onboard_source = "TASK_ASSIGNMENT"  # Default for agent is first-time assignment
            else:
                onboard_source = "MANUAL"
        
        existing = self.get_user_access_by_email(email)
        
        if existing:
            # User exists - check if we need to add persona
            adding_manager = as_manager and not existing.has_manager_access
            adding_agent = as_agent and not existing.has_agent_access
            needs_update = adding_manager or adding_agent
            
            if needs_update:
                # Determine per-persona sources for the NEW personas being added
                add_manager_source = onboard_source if adding_manager else None
                add_agent_source = onboard_source if adding_agent else None
                
                updated = self.update_user_access(
                    email=email,
                    has_manager_access=existing.has_manager_access or as_manager,
                    has_agent_access=existing.has_agent_access or as_agent,
                    updated_by=triggered_by_email,
                    # Track per-persona sources for newly added personas
                    add_manager_source=add_manager_source,
                    add_agent_source=add_agent_source
                )
                logger.info(
                    f"Auto-onboard: Updated existing user {email} with new persona",
                    extra={
                        "triggered_by": triggered_by_email,
                        "added_manager": adding_manager,
                        "added_agent": adding_agent,
                        "manager_source": add_manager_source,
                        "agent_source": add_agent_source
                    }
                )
                return updated or existing, False, adding_manager, adding_agent
            return existing, False, False, False  # No changes made
        
        # Create new user (with race condition handling)
        try:
            access = self.create_user_access(
                email=email,
                display_name=display_name,
                granted_by=triggered_by_email,
                has_manager_access=as_manager,
                has_agent_access=as_agent,
                aad_id=aad_id,
                onboard_source=onboard_source,
                onboarded_by=triggered_by_email,
                onboarded_by_display_name=triggered_by_display_name
            )
            
            logger.info(
                f"Auto-onboard: Created new user {email}",
                extra={
                    "triggered_by": triggered_by_email,
                    "as_manager": as_manager,
                    "as_agent": as_agent,
                    "onboard_source": onboard_source
                }
            )
            
            return access, True, as_manager, as_agent  # New user with requested personas
        except DuplicateKeyError:
            # Handle race condition - user may have been created by another request
            logger.info(
                f"Auto-onboard: User {email} already exists (race condition), fetching existing",
                extra={"triggered_by": triggered_by_email}
            )
            # Include inactive users when handling duplicate key error
            existing = self.get_user_access_by_email(email, include_inactive=True)
            if existing:
                # Reactivate if needed
                if not existing.is_active:
                    # Re-onboarding: update timestamp and source info
                    # Also track per-persona sources for reactivation
                    add_manager_source = onboard_source if as_manager else None
                    add_agent_source = onboard_source if as_agent else None
                    
                    logger.info(
                        f"Auto-onboard: Reactivating revoked user {email}",
                        extra={
                            "triggered_by": triggered_by_email,
                            "old_granted_at": str(existing.granted_at) if hasattr(existing, 'granted_at') else "N/A"
                        }
                    )
                    self.update_user_access(
                        email=email,
                        has_manager_access=existing.has_manager_access or as_manager,
                        has_agent_access=existing.has_agent_access or as_agent,
                        updated_by=triggered_by_email,
                        reactivate=True,
                        reset_granted_at=True,  # Reset "granted_at" to now
                        onboard_source=onboard_source,  # Update legacy source
                        onboarded_by=triggered_by_email,
                        onboarded_by_display_name=triggered_by_display_name,
                        # Per-persona sources for reactivation
                        add_manager_source=add_manager_source,
                        add_agent_source=add_agent_source
                    )
                    existing = self.get_user_access_by_email(email, include_inactive=True)
                    logger.info(
                        f"Auto-onboard: Reactivated previously revoked user {email}",
                        extra={
                            "triggered_by": triggered_by_email,
                            "onboard_source": onboard_source,
                            "manager_source": add_manager_source,
                            "agent_source": add_agent_source,
                            "new_granted_at": str(existing.granted_at) if existing and hasattr(existing, 'granted_at') else "N/A"
                        }
                    )
                    return existing, False, as_manager, as_agent  # Reactivated with requested personas
                return existing, False, False, False  # Already active, no changes
            # If we still can't find them, just log and return None to avoid blocking ticket creation
            logger.warning(
                f"Auto-onboard: User {email} duplicate key but not found, continuing anyway",
                extra={"triggered_by": triggered_by_email}
            )
            # Return a minimal response to avoid crashing the ticket creation
            return None, False, False, False
    
    def update_user_access(
        self,
        email: str,
        has_designer_access: Optional[bool] = None,
        has_manager_access: Optional[bool] = None,
        has_agent_access: Optional[bool] = None,
        updated_by: str = "",
        reactivate: bool = False,
        # Fields for reactivation/re-onboarding (legacy)
        onboard_source: Optional[str] = None,
        onboarded_by: Optional[str] = None,
        onboarded_by_display_name: Optional[str] = None,
        reset_granted_at: bool = False,
        # Per-persona source tracking (NEW)
        add_designer_source: Optional[str] = None,
        add_manager_source: Optional[str] = None,
        add_agent_source: Optional[str] = None
    ) -> Optional[UserAccess]:
        """
        Update user access flags with per-persona source tracking.
        
        Args:
            add_designer_source: Source when adding designer access (sets designer_source, designer_granted_by, designer_granted_at)
            add_manager_source: Source when adding manager access (sets manager_source, manager_granted_by, manager_granted_at)
            add_agent_source: Source when adding agent access (sets agent_source, agent_granted_by, agent_granted_at)
        """
        now = utc_now()
        # Use ISO format for consistency with create_user_access (which uses model_dump(mode="json"))
        now_iso = now.isoformat()
        update_fields: Dict[str, Any] = {
            "updated_at": now_iso,
            "updated_by": updated_by
        }
        
        if has_designer_access is not None:
            update_fields["has_designer_access"] = has_designer_access
            # Track per-persona source if adding designer access
            if has_designer_access and add_designer_source:
                update_fields["designer_source"] = add_designer_source
                update_fields["designer_granted_by"] = updated_by
                update_fields["designer_granted_at"] = now_iso
                
        if has_manager_access is not None:
            update_fields["has_manager_access"] = has_manager_access
            # Track per-persona source if adding manager access
            if has_manager_access and add_manager_source:
                update_fields["manager_source"] = add_manager_source
                update_fields["manager_granted_by"] = updated_by
                update_fields["manager_granted_at"] = now_iso
                
        if has_agent_access is not None:
            update_fields["has_agent_access"] = has_agent_access
            # Track per-persona source if adding agent access
            if has_agent_access and add_agent_source:
                update_fields["agent_source"] = add_agent_source
                update_fields["agent_granted_by"] = updated_by
                update_fields["agent_granted_at"] = now_iso
        
        # Build query - include inactive users if reactivating
        escaped_email = re.escape(email)
        query = {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}}
        if not reactivate:
            query["is_active"] = True
        else:
            # When reactivating, set is_active to True and update onboard info
            update_fields["is_active"] = True
            if reset_granted_at:
                update_fields["granted_at"] = now_iso  # Use ISO format for consistency
            if onboard_source:
                update_fields["onboard_source"] = onboard_source
            if onboarded_by:
                update_fields["onboarded_by"] = onboarded_by
            if onboarded_by_display_name:
                update_fields["onboarded_by_display_name"] = onboarded_by_display_name
        
        logger.info(
            f"update_user_access: About to update {email}",
            extra={
                "reactivate": reactivate,
                "reset_granted_at": reset_granted_at,
                "update_fields_keys": list(update_fields.keys()),
                "granted_at_in_update": "granted_at" in update_fields,
                "per_persona_sources": {
                    "designer": add_designer_source,
                    "manager": add_manager_source,
                    "agent": add_agent_source
                }
            }
        )
        
        result = self._user_access.update_one(
            query,
            {"$set": update_fields}
        )
        
        if result.modified_count > 0:
            logger.info(
                f"Updated user access: {email}",
                extra={
                    "modified_count": result.modified_count,
                    "fields_updated": list(update_fields.keys())
                }
            )
            return self.get_user_access_by_email(email)
        else:
            logger.warning(
                f"update_user_access: No documents modified for {email}",
                extra={"query": str(query)}
            )
        
        return None
    
    def revoke_user_access(self, email: str, revoked_by: str) -> bool:
        """Revoke all user access (soft delete)"""
        escaped_email = re.escape(email)
        now_iso = utc_now().isoformat()  # Use ISO format for consistency
        result = self._user_access.update_one(
            {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}, "is_active": True},
            {
                "$set": {
                    "is_active": False,
                    "has_designer_access": False,
                    "has_manager_access": False,
                    "has_agent_access": False,
                    "updated_at": now_iso,
                    "updated_by": revoked_by
                }
            }
        )
        if result.modified_count > 0:
            logger.info(f"Revoked user access: {email} by {revoked_by}")
        return result.modified_count > 0
    
    def list_user_access(
        self,
        skip: int = 0,
        limit: int = 100,
        include_inactive: bool = False
    ) -> tuple[List[UserAccess], int]:
        """List all user access records with pagination"""
        query: Dict[str, Any] = {}
        if not include_inactive:
            query["is_active"] = True
        
        total = self._user_access.count_documents(query)
        
        users = []
        for doc in self._user_access.find(query).sort("email", 1).skip(skip).limit(limit):
            doc.pop("_id", None)
            users.append(UserAccess(**doc))
        
        return users, total
    
    def update_user_access_profile(
        self, 
        email: str, 
        display_name: str, 
        aad_id: Optional[str] = None
    ) -> None:
        """Update user access profile (display name, AAD ID) from Azure AD token"""
        update_fields: Dict[str, Any] = {"display_name": display_name}
        if aad_id:
            update_fields["aad_id"] = aad_id
        
        escaped_email = re.escape(email)
        self._user_access.update_one(
            {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}},
            {"$set": update_fields}
        )
    
    # =========================================================================
    # Bootstrap Tokens (stored in MongoDB for multi-instance support)
    # =========================================================================
    
    def store_bootstrap_token(self, token: str, expires_at: datetime) -> bool:
        """
        Store a bootstrap token in MongoDB with expiration.
        
        Uses MongoDB TTL index for automatic cleanup.
        Returns True if stored successfully, False if token already exists.
        """
        try:
            self._bootstrap_tokens.insert_one({
                "token": token,
                "expires_at": expires_at,
                "created_at": utc_now()
            })
            logger.info("Bootstrap token stored in MongoDB")
            return True
        except DuplicateKeyError:
            logger.warning("Bootstrap token already exists")
            return False
        except Exception as e:
            logger.error(f"Failed to store bootstrap token: {e}")
            return False
    
    def validate_bootstrap_token(self, token: str) -> bool:
        """
        Validate a bootstrap token from MongoDB.
        
        Returns True if token exists and is not expired.
        Expired tokens are automatically removed by MongoDB TTL index.
        """
        try:
            doc = self._bootstrap_tokens.find_one({
                "token": token,
                "expires_at": {"$gt": utc_now()}
            })
            
            if doc:
                logger.debug("Bootstrap token validated successfully")
                return True
            else:
                logger.debug("Bootstrap token not found or expired")
                return False
        except Exception as e:
            logger.error(f"Failed to validate bootstrap token: {e}")
            return False
    
    def delete_bootstrap_token(self, token: str) -> bool:
        """
        Delete a bootstrap token from MongoDB.
        
        Called after successful super admin setup or logout.
        """
        try:
            result = self._bootstrap_tokens.delete_one({"token": token})
            if result.deleted_count > 0:
                logger.info("Bootstrap token deleted from MongoDB")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete bootstrap token: {e}")
            return False
    
    def cleanup_expired_bootstrap_tokens(self) -> int:
        """
        Manually cleanup expired bootstrap tokens.
        
        Note: MongoDB TTL index handles this automatically, but this
        can be called for immediate cleanup if needed.
        """
        try:
            result = self._bootstrap_tokens.delete_many({
                "expires_at": {"$lt": utc_now()}
            })
            if result.deleted_count > 0:
                logger.info(f"Cleaned up {result.deleted_count} expired bootstrap tokens")
            return result.deleted_count
        except Exception as e:
            logger.error(f"Failed to cleanup bootstrap tokens: {e}")
            return 0