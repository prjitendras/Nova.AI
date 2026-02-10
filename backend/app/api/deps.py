"""API Dependencies - Common dependencies for routes"""
from typing import Optional
from fastapi import Depends, Header, HTTPException, status

from ..domain.models import ActorContext
from ..domain.errors import AuthenticationError
from ..utils.jwt import get_current_user as _jwt_get_current_user  # Internal use only
from ..utils.logger import set_correlation_id, get_correlation_id
from ..utils.idgen import generate_correlation_id


async def get_correlation_id_dep(
    x_correlation_id: Optional[str] = Header(None, alias="X-Correlation-Id")
) -> str:
    """
    Get or generate correlation ID for request tracing
    
    If client provides X-Correlation-Id, use it.
    Otherwise generate a new one.
    """
    correlation_id = x_correlation_id or generate_correlation_id()
    set_correlation_id(correlation_id)
    return correlation_id


async def get_current_user_dep(
    authorization: Optional[str] = Header(None)
) -> ActorContext:
    """
    Dependency to get current user from Authorization header
    
    Validates JWT token and extracts user information.
    
    Raises:
        HTTPException: 401 if token is invalid or missing
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "AUTHENTICATION_ERROR", "message": "Authorization header is missing"}},
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    try:
        return _jwt_get_current_user(authorization)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.to_dict(),
            headers={"WWW-Authenticate": "Bearer"}
        )


async def get_optional_user_dep(
    authorization: Optional[str] = Header(None)
) -> Optional[ActorContext]:
    """
    Dependency to optionally get current user
    
    Returns None if no token provided.
    Raises error if token is provided but invalid.
    """
    if not authorization:
        return None
    
    try:
        return _jwt_get_current_user(authorization)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.to_dict(),
            headers={"WWW-Authenticate": "Bearer"}
        )


async def get_access_token_dep(
    authorization: Optional[str] = Header(None)
) -> Optional[str]:
    """
    Dependency to extract raw access token from Authorization header
    
    Returns the token without 'Bearer ' prefix for use with Graph API calls.
    """
    if not authorization:
        return None
    
    # Remove "Bearer " prefix if present
    if authorization.startswith("Bearer "):
        return authorization[7:]
    return authorization

