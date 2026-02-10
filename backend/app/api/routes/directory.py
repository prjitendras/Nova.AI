"""Directory API Routes - User search and manager lookup"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, EmailStr

from ..deps import get_current_user_dep, get_correlation_id_dep
from ...domain.models import ActorContext
from ...domain.errors import DomainError
from ...services.directory_service import DirectoryService
from ...utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ============================================================================
# Response Models
# ============================================================================

class UserInfo(BaseModel):
    """User information"""
    aad_id: Optional[str] = None
    email: str
    display_name: str
    job_title: Optional[str] = None
    department: Optional[str] = None


class ManagerInfo(BaseModel):
    """Manager information"""
    aad_id: Optional[str] = None
    email: str
    display_name: str


class UserSearchResponse(BaseModel):
    """User search response"""
    items: list[UserInfo]


def get_access_token_from_request(request: Request) -> Optional[str]:
    """Extract access token from Authorization header"""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]  # Remove "Bearer " prefix
    return None


# ============================================================================
# Routes
# ============================================================================

@router.get("/me", response_model=UserInfo)
async def get_me(
    request: Request,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get current user info
    
    Returns information about the logged-in user.
    """
    try:
        service = DirectoryService()
        user_info = service.get_current_user_info(actor)
        
        return UserInfo(**user_info)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/me/manager", response_model=Optional[ManagerInfo])
async def get_my_manager(
    request: Request,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get current user's manager
    
    Returns manager information. May return null if manager not found.
    """
    try:
        access_token = get_access_token_from_request(request)
        service = DirectoryService()
        manager_info = service.get_user_manager(actor.email, actor, access_token)
        
        if manager_info:
            return ManagerInfo(**manager_info)
        return None
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/users/search", response_model=UserSearchResponse)
async def search_users(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(10, ge=1, le=50),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Search users
    
    Search for users by name or email.
    Used for assigning agents.
    """
    try:
        access_token = get_access_token_from_request(request)
        logger.info(f"Searching users with query: {q}, token present: {bool(access_token)}")
        
        service = DirectoryService()
        users = service.search_users(query=q, limit=limit, actor=actor, access_token=access_token)
        
        logger.info(f"Found {len(users)} users for query: {q}")
        return UserSearchResponse(items=[UserInfo(**u) for u in users])
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/users/{email}", response_model=UserInfo)
async def get_user(
    request: Request,
    email: EmailStr,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get user by email
    
    Returns user information by email address.
    """
    try:
        access_token = get_access_token_from_request(request)
        service = DirectoryService()
        user_info = service.get_user_by_email(email, actor, access_token)
        
        return UserInfo(**user_info)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
