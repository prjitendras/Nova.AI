"""Admin Service - Business logic for admin operations"""
from typing import Any, Dict, List, Optional
from datetime import datetime

from ..domain.models import AdminUser, AdminAuditEvent, ActorContext
from ..domain.enums import AdminRole, AdminAuditAction
from ..domain.errors import PermissionDeniedError, ValidationError, NotFoundError
from ..repositories.admin_repo import AdminRepository
from ..config.settings import settings
from ..utils.logger import get_logger
from ..utils.time import utc_now

logger = get_logger(__name__)


class AdminService:
    """Service for admin operations"""
    
    def __init__(self):
        self.repo = AdminRepository()
    
    # =========================================================================
    # Access Checks
    # =========================================================================
    
    def require_super_admin(self, actor: ActorContext) -> None:
        """
        Require actor to be a super admin.
        
        Uses both email AND AAD ID to handle email format mismatches
        between JWT token and stored email.
        """
        role, _ = self.repo.get_user_role_by_email_or_aad_id(
            email=actor.email,
            aad_id=actor.aad_id
        )
        if role != AdminRole.SUPER_ADMIN:
            raise PermissionDeniedError(
                message="Super admin access required",
                actor_email=actor.email
            )
    
    def require_admin(self, actor: ActorContext) -> None:
        """
        Require actor to be an admin or super admin.
        
        Uses both email AND AAD ID to handle email format mismatches
        between JWT token and stored email.
        """
        role, _ = self.repo.get_user_role_by_email_or_aad_id(
            email=actor.email,
            aad_id=actor.aad_id
        )
        if role not in [AdminRole.ADMIN, AdminRole.SUPER_ADMIN]:
            raise PermissionDeniedError(
                message="Admin access required",
                actor_email=actor.email
            )
    
    def require_designer(self, actor: ActorContext) -> None:
        """
        Require actor to have designer access.
        
        Uses both email AND AAD ID to handle email format mismatches
        between JWT token and stored email.
        """
        role, _ = self.repo.get_user_role_by_email_or_aad_id(
            email=actor.email,
            aad_id=actor.aad_id
        )
        if role not in [AdminRole.DESIGNER, AdminRole.ADMIN, AdminRole.SUPER_ADMIN]:
            raise PermissionDeniedError(
                message="Designer access required",
                actor_email=actor.email
            )
    
    def check_admin_access(self, actor: ActorContext) -> Dict[str, Any]:
        """
        Check user's admin access level.
        
        Checks by both email AND AAD ID to handle cases where:
        - JWT token email differs from stored email (UPN vs mail attribute)
        - Email casing differences
        
        Also syncs display_name and aad_id from Azure AD token.
        """
        # Try to find user by email OR AAD ID (handles email format mismatches)
        role, admin_user = self.repo.get_user_role_by_email_or_aad_id(
            email=actor.email,
            aad_id=actor.aad_id
        )
        
        # If user has a role, update their profile from Azure AD token
        if role and admin_user and actor.display_name:
            # Use the stored email to update (in case token email differs)
            self.repo.update_user_profile(
                email=admin_user.email,
                display_name=actor.display_name,
                aad_id=actor.aad_id
            )
        
        return {
            "is_super_admin": role == AdminRole.SUPER_ADMIN if role else False,
            "is_admin": role in [AdminRole.SUPER_ADMIN, AdminRole.ADMIN] if role else False,
            "is_designer": role in [AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.DESIGNER] if role else False,
            "role": role.value if role else None
        }
    
    # =========================================================================
    # Super Admin Setup
    # =========================================================================
    
    def setup_initial_super_admin(
        self,
        email: str,
        display_name: str,
        aad_id: Optional[str] = None,
        setup_key: Optional[str] = None
    ) -> AdminUser:
        """
        Set up the initial super admin.
        
        Can only be done if no super admin exists yet.
        Optionally requires a setup key from environment for security.
        """
        # Check if super admin already exists
        if self.repo.has_any_super_admin():
            raise ValidationError(
                message="Super admin already exists",
                details={"field": "email"}
            )
        
        # Verify setup key if configured
        expected_key = getattr(settings, 'admin_setup_key', None)
        if expected_key and setup_key != expected_key:
            raise PermissionDeniedError(
                message="Invalid setup key",
                actor_email=email
            )
        
        # Create super admin
        admin = self.repo.grant_access(
            email=email,
            display_name=display_name,
            role=AdminRole.SUPER_ADMIN,
            granted_by="SYSTEM_SETUP",
            aad_id=aad_id
        )
        
        # Log the action
        self.repo.log_admin_action(
            action=AdminAuditAction.SUPER_ADMIN_CREATED,
            actor_email=email,
            actor_display_name=display_name,
            details={"setup_type": "initial_setup"}
        )
        
        logger.info(f"Initial super admin created: {email}")
        
        return admin
    
    # =========================================================================
    # Designer Access Management
    # =========================================================================
    
    def grant_designer_access(
        self,
        actor: ActorContext,
        target_email: str,
        target_display_name: str,
        target_aad_id: Optional[str] = None
    ) -> AdminUser:
        """Grant designer access to a user"""
        self.require_admin(actor)
        
        # Validate target
        if not target_email:
            raise ValidationError(message="Email is required", details={"field": "target_email"})
        
        # Check if trying to downgrade
        existing_role = self.repo.get_user_role(target_email)
        if existing_role and existing_role in [AdminRole.SUPER_ADMIN, AdminRole.ADMIN]:
            raise ValidationError(
                message=f"User already has {existing_role.value} access. Cannot downgrade to Designer.",
                details={"field": "target_email"}
            )
        
        # Grant access
        admin = self.repo.grant_access(
            email=target_email,
            display_name=target_display_name,
            role=AdminRole.DESIGNER,
            granted_by=actor.email,
            aad_id=target_aad_id
        )
        
        # Log the action
        self.repo.log_admin_action(
            action=AdminAuditAction.GRANT_DESIGNER_ACCESS,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            target_email=target_email,
            target_display_name=target_display_name
        )
        
        return admin
    
    def revoke_designer_access(
        self,
        actor: ActorContext,
        target_email: str
    ) -> bool:
        """Revoke designer access from a user"""
        self.require_admin(actor)
        
        # Check if trying to revoke admin/super admin
        existing_role = self.repo.get_user_role(target_email)
        if existing_role and existing_role in [AdminRole.SUPER_ADMIN, AdminRole.ADMIN]:
            if not self.repo.is_super_admin(actor.email):
                raise PermissionDeniedError(
                    message="Only super admin can revoke admin access",
                    actor_email=actor.email
                )
        
        success = self.repo.revoke_access(target_email, actor.email)
        
        if success:
            # Log the action
            self.repo.log_admin_action(
                action=AdminAuditAction.REVOKE_DESIGNER_ACCESS,
                actor_email=actor.email,
                actor_display_name=actor.display_name,
                target_email=target_email
            )
        
        return success
    
    def list_designers(
        self,
        actor: ActorContext,
        include_inactive: bool = False,
        skip: int = 0,
        limit: int = 50
    ) -> Dict[str, Any]:
        """List all users with designer access"""
        self.require_admin(actor)
        
        designers = self.repo.list_admin_users(
            role=AdminRole.DESIGNER,
            include_inactive=include_inactive,
            skip=skip,
            limit=limit
        )
        
        total = self.repo.count_admin_users(
            role=AdminRole.DESIGNER,
            include_inactive=include_inactive
        )
        
        return {
            "items": [d.model_dump(mode="json") for d in designers],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    # =========================================================================
    # Admin Management (Super Admin only)
    # =========================================================================
    
    def grant_admin_access(
        self,
        actor: ActorContext,
        target_email: str,
        target_display_name: str,
        target_aad_id: Optional[str] = None,
        role: AdminRole = AdminRole.ADMIN
    ) -> AdminUser:
        """Grant admin or super admin access to a user"""
        self.require_super_admin(actor)
        
        # Validate role - only allow ADMIN or SUPER_ADMIN
        if role not in [AdminRole.ADMIN, AdminRole.SUPER_ADMIN]:
            raise ValidationError(
                message="Invalid role for admin access",
                details={"field": "role", "allowed": ["ADMIN", "SUPER_ADMIN"]}
            )
        
        # Check if user already has higher or equal role
        existing_role = self.repo.get_user_role(target_email)
        if existing_role:
            if existing_role == AdminRole.SUPER_ADMIN:
                raise ValidationError(
                    message="User is already a Super Admin",
                    details={"field": "target_email"}
                )
            if existing_role == role:
                raise ValidationError(
                    message=f"User already has {role.value} access",
                    details={"field": "target_email"}
                )
        
        admin = self.repo.grant_access(
            email=target_email,
            display_name=target_display_name,
            role=role,
            granted_by=actor.email,
            aad_id=target_aad_id
        )
        
        # Log the action with appropriate audit action type
        audit_action = (
            AdminAuditAction.SUPER_ADMIN_CREATED 
            if role == AdminRole.SUPER_ADMIN 
            else AdminAuditAction.GRANT_ADMIN_ACCESS
        )
        self.repo.log_admin_action(
            action=audit_action,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            target_email=target_email,
            target_display_name=target_display_name,
            details={"role": role.value}
        )
        
        return admin
    
    def revoke_admin_access(
        self,
        actor: ActorContext,
        target_email: str
    ) -> bool:
        """Revoke admin access from a user"""
        self.require_super_admin(actor)
        
        # Cannot revoke own super admin
        if target_email.lower() == actor.email.lower():
            raise ValidationError(
                message="Cannot revoke your own access",
                details={"field": "target_email"}
            )
        
        success = self.repo.revoke_access(target_email, actor.email)
        
        if success:
            self.repo.log_admin_action(
                action=AdminAuditAction.REVOKE_ADMIN_ACCESS,
                actor_email=actor.email,
                actor_display_name=actor.display_name,
                target_email=target_email
            )
        
        return success
    
    def list_all_admins(
        self,
        actor: ActorContext,
        include_inactive: bool = False,
        skip: int = 0,
        limit: int = 50
    ) -> Dict[str, Any]:
        """List all admin users (all roles)"""
        self.require_admin(actor)
        
        admins = self.repo.list_admin_users(
            include_inactive=include_inactive,
            skip=skip,
            limit=limit
        )
        
        total = self.repo.count_admin_users(include_inactive=include_inactive)
        
        return {
            "items": [a.model_dump(mode="json") for a in admins],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    # =========================================================================
    # Audit Log
    # =========================================================================
    
    def get_audit_log(
        self,
        actor: ActorContext,
        action: Optional[str] = None,
        actor_email_filter: Optional[str] = None,
        target_email_filter: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Get admin audit log"""
        self.require_admin(actor)
        
        # Log the view action
        self.repo.log_admin_action(
            action=AdminAuditAction.VIEW_AUDIT_LOG,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            details={
                "filters": {
                    "action": action,
                    "actor_email": actor_email_filter,
                    "target_email": target_email_filter,
                    "from_date": from_date.isoformat() if from_date else None,
                    "to_date": to_date.isoformat() if to_date else None
                }
            }
        )
        
        action_enum = AdminAuditAction(action) if action else None
        
        events = self.repo.get_admin_audit_log(
            action=action_enum,
            actor_email=actor_email_filter,
            target_email=target_email_filter,
            from_date=from_date,
            to_date=to_date,
            skip=skip,
            limit=limit
        )
        
        total = self.repo.count_admin_audit_log(
            action=action_enum,
            actor_email=actor_email_filter,
            target_email=target_email_filter,
            from_date=from_date,
            to_date=to_date
        )
        
        return {
            "items": [e.model_dump(mode="json") for e in events],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    # =========================================================================
    # Admin Dashboard Stats
    # =========================================================================
    
    def get_admin_dashboard_stats(self, actor: ActorContext) -> Dict[str, Any]:
        """Get admin dashboard statistics"""
        self.require_admin(actor)
        
        # Count admins by role
        super_admins = self.repo.count_admin_users(role=AdminRole.SUPER_ADMIN)
        admins = self.repo.count_admin_users(role=AdminRole.ADMIN)
        designers = self.repo.count_admin_users(role=AdminRole.DESIGNER)
        
        # Recent audit events
        recent_events = self.repo.get_admin_audit_log(limit=10)
        
        return {
            "users": {
                "super_admins": super_admins,
                "admins": admins,
                "designers": designers,
                "total": super_admins + admins + designers
            },
            "recent_activity": [e.model_dump(mode="json") for e in recent_events]
        }
