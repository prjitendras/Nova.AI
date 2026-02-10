"""Admin API Routes - System configuration, user management, and monitoring"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import secrets
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from pydantic import BaseModel, Field, EmailStr

from ..deps import get_current_user_dep, get_correlation_id_dep
from ...domain.models import ActorContext
from ...domain.enums import AdminRole, AdminAuditAction
from ...domain.errors import DomainError, PermissionDeniedError, ValidationError
from ...repositories.notification_repo import NotificationRepository
from ...repositories.admin_repo import AdminRepository
from ...repositories.mongo_client import health_check
from ...services.admin_service import AdminService
from ...templates import get_email_template, EmailTemplateKey
from ...utils.logger import get_logger
from ...config.settings import settings

logger = get_logger(__name__)
router = APIRouter()

# ============================================================================
# Bootstrap Authentication
# ============================================================================
# Bootstrap credentials for initial setup (configurable via environment)
# These are only valid when NO super admin exists yet
# Tokens are stored in MongoDB for multi-instance and restart resilience


def _generate_bootstrap_token() -> str:
    """Generate a secure bootstrap token"""
    return secrets.token_urlsafe(32)


def _validate_bootstrap_token(token: str) -> bool:
    """Validate a bootstrap token from MongoDB"""
    repo = AdminRepository()
    return repo.validate_bootstrap_token(token)


def _store_bootstrap_token(token: str, expires_at: datetime) -> bool:
    """Store a bootstrap token in MongoDB"""
    repo = AdminRepository()
    return repo.store_bootstrap_token(token, expires_at)


def _delete_bootstrap_token(token: str) -> bool:
    """Delete a bootstrap token from MongoDB"""
    repo = AdminRepository()
    return repo.delete_bootstrap_token(token)


def _verify_bootstrap_credentials(username: str, password: str) -> bool:
    """Verify bootstrap credentials from settings (configurable via env vars)"""
    # Use constant-time comparison to prevent timing attacks
    correct_user = secrets.compare_digest(username, settings.bootstrap_username)
    correct_pass = secrets.compare_digest(password, settings.bootstrap_password)
    return correct_user and correct_pass


def get_bootstrap_token_dep(
    x_bootstrap_token: Optional[str] = Header(None, alias="X-Bootstrap-Token")
) -> str:
    """Dependency to validate bootstrap token"""
    if not x_bootstrap_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bootstrap token required"
        )
    
    if not _validate_bootstrap_token(x_bootstrap_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bootstrap token"
        )
    
    return x_bootstrap_token


# ============================================================================
# Request/Response Models
# ============================================================================

class BootstrapLoginRequest(BaseModel):
    """Request for bootstrap login"""
    username: str
    password: str


class BootstrapLoginResponse(BaseModel):
    """Response for bootstrap login"""
    success: bool
    token: Optional[str] = None
    expires_in_minutes: int = 15
    message: str


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    mongo: Dict[str, Any]
    scheduler: Dict[str, Any]
    email: Dict[str, Any]


class SystemConfigResponse(BaseModel):
    """System configuration"""
    default_sla_minutes: Dict[str, int]
    allowed_mime_types: List[str]
    max_attachment_size_mb: int
    notification_retry_max: int


class UpdateConfigRequest(BaseModel):
    """Request to update config"""
    default_sla_minutes: Optional[Dict[str, int]] = None
    allowed_mime_types: Optional[List[str]] = None
    max_attachment_size_mb: Optional[int] = None
    notification_retry_max: Optional[int] = None


class GrantAccessRequest(BaseModel):
    """Request to grant admin/super admin access"""
    email: EmailStr
    display_name: str
    aad_id: Optional[str] = None
    role: Optional[str] = "ADMIN"  # ADMIN or SUPER_ADMIN, defaults to ADMIN


class GrantUserAccessRequest(BaseModel):
    """Request to grant persona-based access to a user"""
    email: EmailStr
    display_name: str
    aad_id: Optional[str] = None
    has_designer_access: bool = False
    has_manager_access: bool = False
    has_agent_access: bool = False


class UpdateUserAccessRequest(BaseModel):
    """Request to update user access"""
    has_designer_access: Optional[bool] = None
    has_manager_access: Optional[bool] = None
    has_agent_access: Optional[bool] = None


class SetupSuperAdminRequest(BaseModel):
    """Request to set up initial super admin"""
    email: EmailStr
    display_name: str
    aad_id: Optional[str] = None
    setup_key: Optional[str] = None


class EmailTemplatePreviewRequest(BaseModel):
    """Request to preview an email template"""
    template_key: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class EmailTemplateUpdateRequest(BaseModel):
    """Request to update email template"""
    template_key: str
    workflow_id: Optional[str] = None
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None


# ============================================================================
# Bootstrap Authentication (Public - Only when no super admin exists)
# ============================================================================

@router.post("/bootstrap/login", response_model=BootstrapLoginResponse)
async def bootstrap_login(
    request: BootstrapLoginRequest,
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Bootstrap login for initial super admin setup.
    
    Uses credentials from environment (default: admin / Admin@123exl)
    Only works when NO super admin has been configured yet.
    Returns a temporary token valid for 15 minutes.
    
    Configure via: BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD env vars
    """
    repo = AdminRepository()
    
    # Check if super admin already exists
    if repo.has_any_super_admin():
        logger.warning("Bootstrap login attempted after super admin already exists")
        return BootstrapLoginResponse(
            success=False,
            token=None,
            message="Bootstrap login is disabled. Super admin already configured. Use Azure AD to login."
        )
    
    # Verify credentials
    if not _verify_bootstrap_credentials(request.username, request.password):
        logger.warning("Invalid bootstrap credentials")
        return BootstrapLoginResponse(
            success=False,
            token=None,
            message="Invalid username or password"
        )
    
    # Generate token and store in MongoDB
    token = _generate_bootstrap_token()
    expiry = datetime.utcnow() + timedelta(minutes=15)
    if not _store_bootstrap_token(token, expiry):
        logger.error("Failed to store bootstrap token in MongoDB")
        return BootstrapLoginResponse(
            success=False,
            token=None,
            message="Failed to generate token. Please try again."
        )
    
    logger.info("Bootstrap login successful - token stored in MongoDB")
    
    return BootstrapLoginResponse(
        success=True,
        token=token,
        expires_in_minutes=15,
        message="Login successful. Use this token to set up the super admin."
    )


@router.post("/bootstrap/logout")
async def bootstrap_logout(
    token: str = Depends(get_bootstrap_token_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Invalidate bootstrap token"""
    _delete_bootstrap_token(token)
    
    return {"message": "Logged out successfully"}


# ============================================================================
# Health Check (Public)
# ============================================================================

@router.get("/health", response_model=HealthResponse)
async def get_health(
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get system health - Public endpoint"""
    mongo_health = health_check()
    
    scheduler_health = {"status": "healthy", "running": True}
    email_health = {"status": "healthy", "last_send": None}
    
    overall_status = "healthy"
    if mongo_health.get("status") != "healthy":
        overall_status = "unhealthy"
    
    return HealthResponse(
        status=overall_status,
        mongo=mongo_health,
        scheduler=scheduler_health,
        email=email_health
    )


# ============================================================================
# Access Check
# ============================================================================

@router.get("/access")
async def check_access(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Check current user's admin access level"""
    service = AdminService()
    return service.check_admin_access(actor)


@router.get("/setup-status")
async def get_setup_status(
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Check if super admin has been set up"""
    repo = AdminRepository()
    return {
        "super_admin_exists": repo.has_any_super_admin(),
        "requires_setup": not repo.has_any_super_admin()
    }


# ============================================================================
# Super Admin Setup
# ============================================================================

@router.post("/bootstrap/setup")
async def setup_super_admin(
    request: SetupSuperAdminRequest,
    token: str = Depends(get_bootstrap_token_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Set up the initial super admin.
    
    REQUIRES: Valid bootstrap token from /bootstrap/login
    Can only be done once - when no super admin exists.
    
    This endpoint assigns an Azure AD user as the Super Admin.
    After this, the bootstrap login is disabled and all access
    is controlled through Azure AD.
    """
    try:
        service = AdminService()
        admin = service.setup_initial_super_admin(
            email=request.email,
            display_name=request.display_name,
            aad_id=request.aad_id,
            setup_key=request.setup_key
        )
        
        # Invalidate the bootstrap token after successful setup
        _delete_bootstrap_token(token)
        
        logger.info(f"Super admin configured via bootstrap: {request.email}")
        
        return {
            "message": "Super admin created successfully. Bootstrap login is now disabled.",
            "admin": admin.model_dump(mode="json")
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# ============================================================================
# Dashboard & Stats
# ============================================================================

@router.get("/dashboard")
async def get_admin_dashboard(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get admin dashboard statistics"""
    try:
        service = AdminService()
        return service.get_admin_dashboard_stats(actor)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get admin dashboard: {e}", extra={"actor": actor.email})
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent-metrics")
async def get_agent_metrics(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get comprehensive metrics for Agent Command Center.
    Returns real-time data from all MongoDB collections.
    """
    from datetime import datetime, timedelta
    from app.repositories.mongo_client import get_database
    
    try:
        service = AdminService()
        # Verify admin access
        service.require_admin(actor)
        
        # Get database directly
        db = get_database()
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        collections = db.list_collection_names()
        
        logger.info(f"Agent metrics: Collections available: {collections}")
        
        # ============================================
        # NOTIFICATION METRICS (notification_outbox)
        # ============================================
        notif_pending = 0
        notif_sent = 0
        notif_failed = 0
        notif_retry = 0
        email_last_success_minutes_ago = None
        email_recent_failures = 0
        email_is_healthy = True
        if "notification_outbox" in collections:
            notif_pending = db.notification_outbox.count_documents({"status": "PENDING"})
            notif_sent = db.notification_outbox.count_documents({"status": "SENT"})
            notif_failed = db.notification_outbox.count_documents({"status": "FAILED"})
            notif_retry = db.notification_outbox.count_documents({
                "status": "PENDING",
                "retry_count": {"$gt": 0}
            })
            # Check email health - find last successful send
            last_success = db.notification_outbox.find_one(
                {"status": "SENT"},
                sort=[("sent_at", -1)]
            )
            if last_success and last_success.get("sent_at"):
                minutes_ago = (now - last_success["sent_at"]).total_seconds() / 60
                email_last_success_minutes_ago = round(minutes_ago)
            # Count failures in last hour
            email_recent_failures = db.notification_outbox.count_documents({
                "status": "FAILED",
                "created_at": {"$gte": now - timedelta(hours=1)}
            })
            # Email health logic:
            # - Healthy if: recent success OR (no pending emails AND no recent failures)
            # - Unhealthy if: more than 5 failures in last hour OR (pending > 10 AND no recent success)
            has_recent_success = email_last_success_minutes_ago is not None and email_last_success_minutes_ago < 1440
            has_many_pending = notif_pending > 10
            has_many_failures = email_recent_failures > 5
            
            if has_many_failures:
                email_is_healthy = False
            elif has_many_pending and not has_recent_success:
                email_is_healthy = False
            elif notif_sent > 0 and email_recent_failures == 0:
                # If we've sent emails before and no recent failures, we're healthy
                email_is_healthy = True
            elif notif_pending == 0 and email_recent_failures == 0:
                # No pending, no failures = healthy (just idle)
                email_is_healthy = True
        
        # ============================================
        # TICKET METRICS (tickets)
        # ============================================
        tickets_total = 0
        tickets_active = 0
        tickets_completed = 0
        tickets_in_progress = 0
        tickets_waiting = 0
        tickets_cancelled = 0
        if "tickets" in collections:
            tickets_total = db.tickets.count_documents({})
            tickets_active = db.tickets.count_documents({"status": {"$nin": ["COMPLETED", "CANCELLED"]}})
            tickets_completed = db.tickets.count_documents({"status": "COMPLETED"})
            tickets_in_progress = db.tickets.count_documents({"status": "IN_PROGRESS"})
            tickets_waiting = db.tickets.count_documents({"status": "WAITING_FOR_REQUESTER"})
            tickets_cancelled = db.tickets.count_documents({"status": "CANCELLED"})
        
        # ============================================
        # SLA METRICS (based on ticket age)
        # ============================================
        sla_overdue = 0
        sla_approaching = 0
        sla_on_track = 0
        if "tickets" in collections:
            sla_overdue = db.tickets.count_documents({
                "status": {"$nin": ["COMPLETED", "CANCELLED"]},
                "created_at": {"$lt": now - timedelta(days=7)}
            })
            sla_approaching = db.tickets.count_documents({
                "status": {"$nin": ["COMPLETED", "CANCELLED"]},
                "created_at": {"$lt": now - timedelta(days=5), "$gte": now - timedelta(days=7)}
            })
            sla_on_track = max(0, tickets_active - sla_overdue - sla_approaching)
        
        total_tracked = tickets_active + tickets_completed
        sla_compliance = ((total_tracked - sla_overdue) / max(1, total_tracked)) * 100 if total_tracked > 0 else 100
        
        # ============================================
        # STUCK TICKET METRICS (tickets with no activity)
        # ============================================
        stuck_3_to_7_days = 0
        stuck_7_to_14_days = 0
        stuck_over_14_days = 0
        if "tickets" in collections:
            # Tickets with no activity (updated_at) for 3-7 days
            stuck_3_to_7_days = db.tickets.count_documents({
                "status": {"$nin": ["COMPLETED", "CANCELLED"]},
                "updated_at": {
                    "$lt": now - timedelta(days=3),
                    "$gte": now - timedelta(days=7)
                }
            })
            # Tickets with no activity for 7-14 days
            stuck_7_to_14_days = db.tickets.count_documents({
                "status": {"$nin": ["COMPLETED", "CANCELLED"]},
                "updated_at": {
                    "$lt": now - timedelta(days=7),
                    "$gte": now - timedelta(days=14)
                }
            })
            # Tickets with no activity for 14+ days
            stuck_over_14_days = db.tickets.count_documents({
                "status": {"$nin": ["COMPLETED", "CANCELLED"]},
                "updated_at": {"$lt": now - timedelta(days=14)}
            })
        
        # ============================================
        # APPROVAL METRICS (approval_tasks)
        # ============================================
        approvals_pending = 0
        approvals_approved = 0
        approvals_rejected = 0
        if "approval_tasks" in collections:
            approvals_pending = db.approval_tasks.count_documents({"decision": None})
            approvals_approved = db.approval_tasks.count_documents({"decision": "APPROVED"})
            approvals_rejected = db.approval_tasks.count_documents({"decision": "REJECTED"})
        
        # ============================================
        # HANDOVER REQUEST METRICS (handover_requests)
        # ============================================
        handover_pending = 0
        handover_approved = 0
        handover_rejected = 0
        handover_total = 0
        if "handover_requests" in collections:
            handover_pending = db.handover_requests.count_documents({"status": "PENDING"})
            handover_approved = db.handover_requests.count_documents({"status": "APPROVED"})
            handover_rejected = db.handover_requests.count_documents({"status": "REJECTED"})
            handover_total = db.handover_requests.count_documents({})
        
        # ============================================
        # BOOTSTRAP TOKEN METRICS (bootstrap_tokens)
        # ============================================
        bootstrap_total = 0
        bootstrap_active = 0
        bootstrap_expired = 0
        if "bootstrap_tokens" in collections:
            bootstrap_total = db.bootstrap_tokens.count_documents({})
            bootstrap_active = db.bootstrap_tokens.count_documents({
                "expires_at": {"$gt": now}
            })
            bootstrap_expired = db.bootstrap_tokens.count_documents({
                "expires_at": {"$lte": now}
            })
        
        # ============================================
        # ASSIGNMENT METRICS (assignments + ticket_steps)
        # ============================================
        assignments_total = 0
        assignments_active = 0
        task_steps_total = 0
        task_steps_pending = 0
        task_steps_completed = 0
        if "assignments" in collections:
            assignments_total = db.assignments.count_documents({})
            assignments_active = db.assignments.count_documents({"status": "ACTIVE"})
        if "ticket_steps" in collections:
            task_steps_total = db.ticket_steps.count_documents({"step_type": "TASK_STEP"})
            task_steps_pending = db.ticket_steps.count_documents({"step_type": "TASK_STEP", "state": "PENDING"})
            task_steps_completed = db.ticket_steps.count_documents({"step_type": "TASK_STEP", "state": "COMPLETED"})
        
        # ============================================
        # ATTACHMENT METRICS (attachments)
        # ============================================
        attachments_total = 0
        attachments_today = 0
        if "attachments" in collections:
            attachments_total = db.attachments.count_documents({})
            attachments_today = db.attachments.count_documents({
                "created_at": {"$gte": today_start}
            })
        
        # ============================================
        # USER ACCESS METRICS (user_access + admin_users)
        # ============================================
        users_total = 0
        users_designers = 0
        users_managers = 0
        users_agents = 0
        admins_total = 0
        if "user_access" in collections:
            users_total = db.user_access.count_documents({})
            users_designers = db.user_access.count_documents({"has_designer_access": True})
            users_managers = db.user_access.count_documents({"has_manager_access": True})
            users_agents = db.user_access.count_documents({"has_agent_access": True})
        if "admin_users" in collections:
            admins_total = db.admin_users.count_documents({})
        
        # ============================================
        # AUDIT METRICS (audit_events)
        # ============================================
        audit_today = 0
        audit_total = 0
        if "audit_events" in collections:
            audit_today = db.audit_events.count_documents({
                "timestamp": {"$gte": today_start}
            })
            audit_total = db.audit_events.count_documents({})
        
        # ============================================
        # AI CONVERSATION METRICS (ai_conversations)
        # ============================================
        ai_sessions = 0
        ai_today = 0
        ai_messages_total = 0
        if "ai_conversations" in collections:
            ai_sessions = db.ai_conversations.count_documents({})
            ai_today = db.ai_conversations.count_documents({
                "updated_at": {"$gte": today_start}
            })
            # Count total messages across all conversations
            pipeline = [{"$project": {"msg_count": {"$size": {"$ifNull": ["$messages", []]}}}}]
            try:
                result = list(db.ai_conversations.aggregate(pipeline))
                ai_messages_total = sum(r.get("msg_count", 0) for r in result)
            except Exception as e:
                logger.warning(f"Failed to count AI messages: {e}")
        
        # ============================================
        # INFO REQUEST METRICS (info_requests)
        # ============================================
        info_pending = 0
        info_responded = 0
        if "info_requests" in collections:
            info_pending = db.info_requests.count_documents({"status": "PENDING"})
            info_responded = db.info_requests.count_documents({"status": "RESPONDED"})
        
        # ============================================
        # WORKFLOW METRICS (workflows + workflow_versions)
        # ============================================
        workflows_total = 0
        workflows_published = 0
        workflows_draft = 0
        workflow_versions_total = 0
        if "workflows" in collections:
            workflows_total = db.workflows.count_documents({})
            workflows_published = db.workflows.count_documents({"status": "PUBLISHED"})
            workflows_draft = db.workflows.count_documents({"status": "DRAFT"})
        if "workflow_versions" in collections:
            workflow_versions_total = db.workflow_versions.count_documents({})
        # Count total steps across all workflows (steps are in definition.steps)
        workflow_total_steps = 0
        if "workflows" in collections:
            try:
                pipeline = [
                    {"$project": {"step_count": {"$size": {"$ifNull": ["$definition.steps", []]}}}}
                ]
                result = list(db.workflows.aggregate(pipeline))
                workflow_total_steps = sum(r.get("step_count", 0) for r in result)
            except Exception as e:
                logger.warning(f"Failed to count workflow steps: {e}")
        
        # ============================================
        # FORM STEP METRICS (ticket_steps - form steps)
        # ============================================
        form_steps_total = 0
        form_steps_completed = 0
        form_steps_pending = 0
        if "ticket_steps" in collections:
            form_steps_total = db.ticket_steps.count_documents({"step_type": "FORM_STEP"})
            form_steps_completed = db.ticket_steps.count_documents({"step_type": "FORM_STEP", "state": "COMPLETED"})
            form_steps_pending = db.ticket_steps.count_documents({"step_type": "FORM_STEP", "state": "PENDING"})
        
        logger.info(f"Agent metrics computed: tickets={tickets_total}, workflows={workflows_total}, users={users_total}")
        
        return {
            "notifications": {
                "pending": notif_pending,
                "sent": notif_sent,
                "failed": notif_failed,
                "retry_queue": notif_retry,
                "email_healthy": email_is_healthy,
                "last_success_minutes_ago": email_last_success_minutes_ago,
                "recent_failures": email_recent_failures
            },
            "tickets": {
                "total": tickets_total,
                "active": tickets_active,
                "completed": tickets_completed,
                "in_progress": tickets_in_progress,
                "waiting_for_requester": tickets_waiting,
                "cancelled": tickets_cancelled
            },
            "sla": {
                "approaching": sla_approaching,
                "overdue": sla_overdue,
                "on_track": sla_on_track,
                "compliance_rate": round(sla_compliance, 1)
            },
            "stuck_tickets": {
                "idle_3_to_7_days": stuck_3_to_7_days,
                "idle_7_to_14_days": stuck_7_to_14_days,
                "idle_over_14_days": stuck_over_14_days,
                "total": stuck_3_to_7_days + stuck_7_to_14_days + stuck_over_14_days
            },
            "approvals": {
                "pending": approvals_pending,
                "approved": approvals_approved,
                "rejected": approvals_rejected,
                "total": approvals_pending + approvals_approved + approvals_rejected
            },
            "handover_requests": {
                "pending": handover_pending,
                "approved": handover_approved,
                "rejected": handover_rejected,
                "total": handover_total
            },
            "bootstrap_tokens": {
                "total": bootstrap_total,
                "active": bootstrap_active,
                "expired": bootstrap_expired
            },
            "assignments": {
                "total": assignments_total,
                "active": assignments_active
            },
            "task_steps": {
                "total": task_steps_total,
                "pending": task_steps_pending,
                "completed": task_steps_completed
            },
            "form_steps": {
                "total": form_steps_total,
                "pending": form_steps_pending,
                "completed": form_steps_completed
            },
            "attachments": {
                "total": attachments_total,
                "today_uploads": attachments_today
            },
            "users": {
                "total_access": users_total,
                "designers": users_designers,
                "managers": users_managers,
                "agents": users_agents,
                "admins": admins_total
            },
            "audit": {
                "today_events": audit_today,
                "total_events": audit_total
            },
            "ai_conversations": {
                "total_sessions": ai_sessions,
                "today_sessions": ai_today,
                "total_messages": ai_messages_total
            },
            "info_requests": {
                "pending": info_pending,
                "responded": info_responded,
                "total": info_pending + info_responded
            },
            "workflows": {
                "total": workflows_total,
                "published": workflows_published,
                "draft": workflows_draft,
                "versions": workflow_versions_total,
                "total_steps": workflow_total_steps
            },
            "generated_at": now.isoformat()
        }
        
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get agent metrics: {e}", extra={"actor": actor.email})
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Designer Management
# ============================================================================

@router.get("/designers")
async def list_designers(
    include_inactive: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """List all users with designer access"""
    try:
        service = AdminService()
        return service.list_designers(
            actor=actor,
            include_inactive=include_inactive,
            skip=skip,
            limit=limit
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/designers")
async def grant_designer_access(
    request: GrantAccessRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Grant designer access to a user"""
    try:
        service = AdminService()
        admin = service.grant_designer_access(
            actor=actor,
            target_email=request.email,
            target_display_name=request.display_name,
            target_aad_id=request.aad_id
        )
        
        return {
            "message": "Designer access granted",
            "admin": admin.model_dump(mode="json")
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.delete("/designers/{email}")
async def revoke_designer_access(
    email: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Revoke designer access from a user"""
    try:
        service = AdminService()
        success = service.revoke_designer_access(actor=actor, target_email=email)
        
        if success:
            return {"message": "Designer access revoked"}
        else:
            raise HTTPException(status_code=404, detail="User not found or already inactive")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# ============================================================================
# User Access Management (Persona-based access control)
# ============================================================================

@router.get("/user-access")
async def list_user_access(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    include_inactive: bool = False,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """List all users with persona access"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        users, total = repo.list_user_access(skip=skip, limit=limit, include_inactive=include_inactive)
        
        return {
            "items": [u.model_dump(mode="json") for u in users],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/user-access")
async def grant_user_access(
    request: GrantUserAccessRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Grant persona-based access to a user"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        
        # Check if at least one access is being granted
        if not any([request.has_designer_access, request.has_manager_access, request.has_agent_access]):
            raise HTTPException(
                status_code=400,
                detail="At least one access type must be selected"
            )
        
        # Check if user already has access (including inactive users)
        existing = repo.get_user_access_by_email(request.email, include_inactive=True)
        
        if existing:
            # Update existing access (also reactivates if inactive)
            access = repo.update_user_access(
                email=request.email,
                has_designer_access=request.has_designer_access,
                has_manager_access=request.has_manager_access,
                has_agent_access=request.has_agent_access,
                updated_by=actor.email,
                reactivate=True  # Reactivate if previously deactivated
            )
        else:
            # Create new access
            access = repo.create_user_access(
                email=request.email,
                display_name=request.display_name,
                aad_id=request.aad_id,
                has_designer_access=request.has_designer_access,
                has_manager_access=request.has_manager_access,
                has_agent_access=request.has_agent_access,
                granted_by=actor.email
            )
        
        # Log the action
        repo.log_admin_action(
            action=AdminAuditAction.UPDATE_USER_ACCESS,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            target_email=request.email,
            target_display_name=request.display_name,
            details={
                "designer": request.has_designer_access,
                "manager": request.has_manager_access,
                "agent": request.has_agent_access
            }
        )
        
        return {
            "message": "Access granted successfully",
            "user_access": access.model_dump(mode="json") if access else None
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.put("/user-access/{email}")
async def update_user_access(
    email: str,
    request: UpdateUserAccessRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Update user's persona access"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        
        access = repo.update_user_access(
            email=email,
            has_designer_access=request.has_designer_access,
            has_manager_access=request.has_manager_access,
            has_agent_access=request.has_agent_access,
            updated_by=actor.email
        )
        
        if not access:
            raise HTTPException(status_code=404, detail="User access not found")
        
        # Log the action
        repo.log_admin_action(
            action=AdminAuditAction.UPDATE_USER_ACCESS,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            target_email=email,
            details={
                "designer": request.has_designer_access,
                "manager": request.has_manager_access,
                "agent": request.has_agent_access
            }
        )
        
        return {
            "message": "Access updated successfully",
            "user_access": access.model_dump(mode="json")
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.delete("/user-access/{email}")
async def revoke_user_access(
    email: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Revoke all persona access from a user"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        success = repo.revoke_user_access(email=email, revoked_by=actor.email)
        
        if success:
            # Log the action
            repo.log_admin_action(
                action=AdminAuditAction.UPDATE_USER_ACCESS,
                actor_email=actor.email,
                actor_display_name=actor.display_name,
                target_email=email,
                details={"action": "revoked_all_access"}
            )
            return {"message": "User access revoked"}
        else:
            raise HTTPException(status_code=404, detail="User not found or already inactive")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/user-access/{email}")
async def get_user_access_details(
    email: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get user's persona access details"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        access = repo.get_user_access_by_email(email)
        
        if not access:
            return {
                "has_access": False,
                "user_access": None
            }
        
        return {
            "has_access": True,
            "user_access": access.model_dump(mode="json")
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/my-access")
async def get_my_access(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get current user's persona access (for sidebar visibility)"""
    try:
        repo = AdminRepository()
        
        # Check user access by email or AAD ID
        access = repo.get_user_access(email=actor.email, aad_id=actor.aad_id)
        
        # Also check admin status
        admin_role = None
        admin = repo.get_admin_user_by_email(actor.email)
        if not admin and actor.aad_id:
            admin = repo.get_admin_user_by_aad_id(actor.aad_id)
        if admin:
            admin_role = admin.role.value
        
        return {
            "email": actor.email,
            "has_designer_access": access.has_designer_access if access else False,
            "has_manager_access": access.has_manager_access if access else False,
            "has_agent_access": access.has_agent_access if access else False,
            "is_admin": admin is not None,
            "admin_role": admin_role
        }
    
    except Exception as e:
        logger.error(f"Error getting user access: {e}")
        return {
            "email": actor.email,
            "has_designer_access": False,
            "has_manager_access": False,
            "has_agent_access": False,
            "is_admin": False,
            "admin_role": None
        }


# ============================================================================
# Admin Management (Super Admin only)
# ============================================================================

@router.get("/admins")
async def list_admins(
    include_inactive: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """List all admin users"""
    try:
        service = AdminService()
        return service.list_all_admins(
            actor=actor,
            include_inactive=include_inactive,
            skip=skip,
            limit=limit
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to list admins: {e}", extra={"actor": actor.email})
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admins")
async def grant_admin_access(
    request: GrantAccessRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Grant admin access to a user (Super Admin only)"""
    try:
        # Validate role
        valid_roles = ["ADMIN", "SUPER_ADMIN"]
        role = (request.role or "ADMIN").upper()
        if role not in valid_roles:
            raise HTTPException(
                status_code=400, 
                detail={"message": f"Invalid role. Must be one of: {valid_roles}"}
            )
        
        service = AdminService()
        admin = service.grant_admin_access(
            actor=actor,
            target_email=request.email,
            target_display_name=request.display_name,
            target_aad_id=request.aad_id,
            role=AdminRole(role)
        )
        
        role_label = "Super Admin" if role == "SUPER_ADMIN" else "Admin"
        return {
            "message": f"{role_label} access granted",
            "admin": admin.model_dump(mode="json")
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.delete("/admins/{email}")
async def revoke_admin_access(
    email: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Revoke admin access from a user (Super Admin only)"""
    try:
        service = AdminService()
        success = service.revoke_admin_access(actor=actor, target_email=email)
        
        if success:
            return {"message": "Admin access revoked"}
        else:
            raise HTTPException(status_code=404, detail="User not found or already inactive")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# ============================================================================
# Audit Log
# ============================================================================

@router.get("/audit-log")
async def get_audit_log(
    action: Optional[str] = None,
    actor_email: Optional[str] = None,
    target_email: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get admin audit log"""
    try:
        service = AdminService()
        
        # Parse dates if provided
        from_dt = datetime.fromisoformat(from_date) if from_date else None
        to_dt = datetime.fromisoformat(to_date) if to_date else None
        
        return service.get_audit_log(
            actor=actor,
            action=action,
            actor_email_filter=actor_email,
            target_email_filter=target_email,
            from_date=from_dt,
            to_date=to_dt,
            skip=skip,
            limit=limit
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")


# ============================================================================
# Email Templates
# ============================================================================

@router.get("/email-templates")
async def list_email_templates(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """List all available email templates with their default content"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        # Get all template keys
        templates = []
        for key in EmailTemplateKey:
            # Generate sample preview
            sample_payload = {
                "ticket_id": "TKT-sample123",
                "ticket_title": "Sample Ticket Title",
                "workflow_name": "Sample Workflow",
                "requester_name": "John Doe",
                "approver_name": "Jane Manager",
                "assigned_by_name": "Jane Manager",
                "question": "Sample question text",
                "subject": "Sample subject"
            }
            
            try:
                content = get_email_template(key.value, sample_payload, settings.frontend_url)
                templates.append({
                    "key": key.value,
                    "name": key.value.replace("_", " ").title(),
                    "subject_preview": content["subject"][:100],
                    "has_override": False  # Will be set by frontend based on overrides list
                })
            except Exception:
                templates.append({
                    "key": key.value,
                    "name": key.value.replace("_", " ").title(),
                    "subject_preview": "Template unavailable",
                    "has_override": False
                })
        
        # Get overrides
        repo = AdminRepository()
        overrides = repo.list_email_template_overrides()
        override_keys = {o.template_key for o in overrides}
        
        for t in templates:
            t["has_override"] = t["key"] in override_keys
        
        return {
            "templates": templates,
            "overrides": [o.model_dump(mode="json") for o in overrides]
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/email-templates/preview")
async def preview_email_template(
    request: EmailTemplatePreviewRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Preview an email template with sample data"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        # Add default sample values
        payload = {
            "ticket_id": "TKT-SAMPLE123",
            "ticket_title": "Preview Ticket Title",
            "workflow_name": "Preview Workflow",
            "requester_name": "John Doe",
            "approver_name": "Jane Manager",
            "assigned_by_name": "Jane Manager",
            "question": "This is a sample question for preview.",
            "subject": "Preview Subject Line",
            "reason": "Sample rejection reason",
            "responder_name": "Bob Agent",
            "step_name": "Review Step",
            "due_date": "2026-01-15",
            **request.payload
        }
        
        content = get_email_template(
            template_key=request.template_key,
            payload=payload,
            app_url=settings.frontend_url
        )
        
        return {
            "template_key": request.template_key,
            "subject": content["subject"],
            "body": content["body"]
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Template error: {e}")


@router.put("/email-templates")
async def update_email_template(
    request: EmailTemplateUpdateRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Update/override an email template"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        template = repo.save_email_template_override(
            template_key=request.template_key,
            custom_subject=request.custom_subject,
            custom_body=request.custom_body,
            created_by=actor.email,
            workflow_id=request.workflow_id
        )
        
        # Log the action
        repo.log_admin_action(
            action=AdminAuditAction.UPDATE_EMAIL_TEMPLATE,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            details={
                "template_key": request.template_key,
                "workflow_id": request.workflow_id
            }
        )
        
        return {
            "message": "Template updated",
            "template": template.model_dump(mode="json")
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.delete("/email-templates/{template_id}")
async def delete_email_template_override(
    template_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Delete an email template override (revert to default)"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = AdminRepository()
        success = repo.delete_email_template_override(template_id)
        
        if success:
            return {"message": "Template override removed, reverted to default"}
        else:
            raise HTTPException(status_code=404, detail="Template override not found")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# ============================================================================
# System Configuration
# ============================================================================

@router.get("/config", response_model=SystemConfigResponse)
async def get_config(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get system configuration"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        from ...config.settings import settings
        
        return SystemConfigResponse(
            default_sla_minutes={
                "FORM_STEP": 1440,
                "APPROVAL_STEP": 2880,
                "TASK_STEP": 4320
            },
            allowed_mime_types=settings.allowed_mime_types_list,
            max_attachment_size_mb=settings.attachments_max_mb,
            notification_retry_max=settings.notification_max_retries
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.put("/config", response_model=SystemConfigResponse)
async def update_config(
    request: UpdateConfigRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Update system configuration"""
    try:
        service = AdminService()
        service.require_super_admin(actor)
        
        from ...config.settings import settings
        
        # Log the action
        repo = AdminRepository()
        repo.log_admin_action(
            action=AdminAuditAction.UPDATE_SYSTEM_CONFIG,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            details=request.model_dump(exclude_none=True)
        )
        
        logger.info(
            "Config update requested",
            extra={"actor_email": actor.email, "updates": request.model_dump(exclude_none=True)}
        )
        
        return SystemConfigResponse(
            default_sla_minutes=request.default_sla_minutes or {
                "FORM_STEP": 1440,
                "APPROVAL_STEP": 2880,
                "TASK_STEP": 4320
            },
            allowed_mime_types=request.allowed_mime_types or settings.allowed_mime_types_list,
            max_attachment_size_mb=request.max_attachment_size_mb or settings.attachments_max_mb,
            notification_retry_max=request.notification_retry_max or settings.notification_max_retries
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# ============================================================================
# Notifications - Comprehensive Dashboard API
# ============================================================================

class NotificationFilterRequest(BaseModel):
    """Request model for notification filtering"""
    status: Optional[str] = None
    ticket_id: Optional[str] = None
    template_key: Optional[str] = None
    recipient_email: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None


class BulkRetryRequest(BaseModel):
    """Request for bulk retry of notifications"""
    notification_ids: List[str]


@router.get("/notifications")
async def list_notifications(
    status: Optional[str] = Query(None, description="Filter by status: PENDING, SENT, FAILED"),
    ticket_id: Optional[str] = Query(None, description="Filter by ticket ID"),
    template_key: Optional[str] = Query(None, description="Filter by template key"),
    recipient: Optional[str] = Query(None, description="Filter by recipient email (partial match)"),
    from_date: Optional[str] = Query(None, description="Filter from date (ISO format)"),
    to_date: Optional[str] = Query(None, description="Filter to date (ISO format)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    List all notifications with comprehensive filtering.
    
    Use this endpoint for the admin notification dashboard to view all emails
    with full traceability - like a Gmail-style inbox view.
    """
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        skip = (page - 1) * page_size
        
        # Parse dates
        from_dt = datetime.fromisoformat(from_date) if from_date else None
        to_dt = datetime.fromisoformat(to_date) if to_date else None
        
        notifications, total = repo.list_notifications(
            status=status,
            ticket_id=ticket_id,
            template_key=template_key,
            recipient_email=recipient,
            from_date=from_dt,
            to_date=to_dt,
            skip=skip,
            limit=page_size,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        items = []
        for n in notifications:
            items.append({
                "notification_id": n.notification_id,
                "ticket_id": n.ticket_id,
                "template_key": n.template_key.value,
                "template_name": n.template_key.value.replace("_", " ").title(),
                "recipients": n.recipients,
                "status": n.status.value,
                "retry_count": n.retry_count,
                "last_error": n.last_error,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "sent_at": n.sent_at.isoformat() if n.sent_at else None,
                "next_retry_at": n.next_retry_at.isoformat() if n.next_retry_at else None,
                "locked_by": n.locked_by,
                "locked_until": n.locked_until.isoformat() if n.locked_until else None,
                # Preview info from payload
                "preview": {
                    "ticket_title": n.payload.get("ticket_title", ""),
                    "requester_name": n.payload.get("requester_name", ""),
                    "step_name": n.payload.get("step_name", ""),
                    "workflow_name": n.payload.get("workflow_name", ""),
                    "workflow_id": n.payload.get("workflow_id", ""),
                }
            })
        
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to list notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/dashboard")
async def get_notification_dashboard(
    from_date: Optional[str] = Query(None, description="Stats from date (ISO format)"),
    to_date: Optional[str] = Query(None, description="Stats to date (ISO format)"),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get comprehensive notification dashboard statistics.
    
    Returns detailed stats including:
    - Counts by status (pending, sent, failed)
    - Counts by template type
    - Retry distribution
    - Success/failure rates
    - Common errors
    - Last 24 hours activity
    """
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        
        # Parse dates
        from_dt = datetime.fromisoformat(from_date) if from_date else None
        to_dt = datetime.fromisoformat(to_date) if to_date else None
        
        stats = repo.get_comprehensive_stats(from_date=from_dt, to_date=to_dt)
        
        return stats
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get notification dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/{notification_id}")
async def get_notification_details(
    notification_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get full notification details including email content.
    
    Returns complete information about a notification including:
    - All metadata (status, timestamps, retry info)
    - Full payload data
    - Reconstructed email content (subject and body)
    - Lock information
    """
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        notification_doc = repo.get_notification_details(notification_id)
        
        if not notification_doc:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        # Reconstruct email content for preview
        from ...templates import get_email_template
        from ...config.settings import settings
        
        email_content = None
        try:
            email_content = get_email_template(
                template_key=notification_doc.get("template_key"),
                payload=notification_doc.get("payload", {}),
                app_url=settings.frontend_url
            )
        except Exception as e:
            logger.warning(f"Could not reconstruct email content: {e}")
            email_content = {"subject": "Could not reconstruct", "body": str(e)}
        
        return {
            "notification_id": notification_doc.get("notification_id"),
            "ticket_id": notification_doc.get("ticket_id"),
            "notification_type": notification_doc.get("notification_type"),
            "template_key": notification_doc.get("template_key"),
            "template_name": notification_doc.get("template_key", "").replace("_", " ").title(),
            "recipients": notification_doc.get("recipients", []),
            "status": notification_doc.get("status"),
            "retry_count": notification_doc.get("retry_count", 0),
            "last_error": notification_doc.get("last_error"),
            "next_retry_at": notification_doc.get("next_retry_at"),
            "locked_until": notification_doc.get("locked_until"),
            "locked_by": notification_doc.get("locked_by"),
            "created_at": notification_doc.get("created_at"),
            "sent_at": notification_doc.get("sent_at"),
            "payload": notification_doc.get("payload", {}),
            "email_content": email_content
        }
    
    except HTTPException:
        raise
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get notification details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/failed")
async def get_failed_notifications(
    page: int = 1,
    page_size: int = 20,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get failed notifications (legacy endpoint - use /notifications with status=FAILED instead)"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        skip = (page - 1) * page_size
        
        notifications = repo.get_failed_notifications(skip=skip, limit=page_size)
        
        return {
            "items": [
                {
                    "notification_id": n.notification_id,
                    "ticket_id": n.ticket_id,
                    "template_key": n.template_key.value,
                    "recipients": n.recipients,
                    "status": n.status.value,
                    "retry_count": n.retry_count,
                    "last_error": n.last_error,
                    "created_at": n.created_at.isoformat()
                }
                for n in notifications
            ],
            "page": page,
            "page_size": page_size
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notifications/{notification_id}/retry")
async def retry_notification(
    notification_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Retry a single failed notification"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        notification = repo.retry_notification(notification_id)
        
        # Log the action
        admin_repo = AdminRepository()
        admin_repo.log_admin_action(
            action=AdminAuditAction.RETRY_NOTIFICATION,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            details={"notification_id": notification_id}
        )
        
        logger.info(
            f"Notification queued for retry: {notification_id}",
            extra={"notification_id": notification_id, "actor_email": actor.email}
        )
        
        return {"message": "Notification queued for retry", "notification_id": notification_id}
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/notifications/bulk-retry")
async def bulk_retry_notifications(
    request: BulkRetryRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Bulk retry multiple failed notifications"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        if not request.notification_ids:
            raise HTTPException(status_code=400, detail="No notification IDs provided")
        
        if len(request.notification_ids) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 notifications per bulk retry")
        
        repo = NotificationRepository()
        retried_count = repo.bulk_retry_failed(request.notification_ids)
        
        # Log the action
        admin_repo = AdminRepository()
        admin_repo.log_admin_action(
            action=AdminAuditAction.RETRY_NOTIFICATION,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            details={
                "bulk_retry": True,
                "notification_count": len(request.notification_ids),
                "retried_count": retried_count
            }
        )
        
        logger.info(
            f"Bulk retry: {retried_count} notifications queued",
            extra={"retried_count": retried_count, "actor_email": actor.email}
        )
        
        return {
            "message": f"{retried_count} notifications queued for retry",
            "retried_count": retried_count,
            "requested_count": len(request.notification_ids)
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to bulk retry notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notifications/{notification_id}/cancel")
async def cancel_notification(
    notification_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Cancel a pending notification (won't be sent)"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        success = repo.cancel_notification(notification_id)
        
        if not success:
            raise HTTPException(
                status_code=400, 
                detail="Could not cancel notification. It may already be sent, failed, or currently being processed."
            )
        
        # Log the action
        admin_repo = AdminRepository()
        admin_repo.log_admin_action(
            action=AdminAuditAction.CANCEL_NOTIFICATION,
            actor_email=actor.email,
            actor_display_name=actor.display_name,
            details={"notification_id": notification_id}
        )
        
        logger.info(
            f"Notification cancelled: {notification_id}",
            extra={"notification_id": notification_id, "actor_email": actor.email}
        )
        
        return {"message": "Notification cancelled", "notification_id": notification_id}
    
    except HTTPException:
        raise
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to cancel notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/ticket/{ticket_id}")
async def get_ticket_notifications(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get all notifications for a specific ticket.
    
    Returns full notification history for traceability.
    """
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        notifications = repo.get_notifications_by_ticket_detailed(ticket_id)
        
        # Reconstruct email content for each notification
        from ...templates import get_email_template
        from ...config.settings import settings
        
        items = []
        for n in notifications:
            email_content = None
            try:
                email_content = get_email_template(
                    template_key=n.get("template_key"),
                    payload=n.get("payload", {}),
                    app_url=settings.frontend_url
                )
            except Exception:
                email_content = {"subject": "Could not reconstruct", "body": ""}
            
            items.append({
                "notification_id": n.get("notification_id"),
                "template_key": n.get("template_key"),
                "template_name": n.get("template_key", "").replace("_", " ").title(),
                "recipients": n.get("recipients", []),
                "status": n.get("status"),
                "retry_count": n.get("retry_count", 0),
                "last_error": n.get("last_error"),
                "created_at": n.get("created_at"),
                "sent_at": n.get("sent_at"),
                "email_subject": email_content.get("subject") if email_content else None,
                "email_body": email_content.get("body") if email_content else None
            })
        
        return {
            "ticket_id": ticket_id,
            "notifications": items,
            "total": len(items)
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get ticket notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/stats")
async def get_notification_stats(
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get basic notification statistics (legacy - use /notifications/dashboard for comprehensive stats)"""
    try:
        service = AdminService()
        service.require_admin(actor)
        
        repo = NotificationRepository()
        stats = repo.count_by_status()
        
        return {
            "pending": stats.get("PENDING", 0),
            "sent": stats.get("SENT", 0),
            "failed": stats.get("FAILED", 0),
            "total": sum(stats.values())
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except Exception as e:
        logger.error(f"Failed to get notification stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
