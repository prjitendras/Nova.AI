"""JWT Token Validation for Azure AD (Entra)"""
import jwt
from jwt import PyJWKClient
from typing import Any, Dict, Optional
from functools import lru_cache
from datetime import datetime, timedelta

from ..config.settings import settings
from ..domain.errors import AuthenticationError
from ..domain.models import ActorContext
from .logger import get_logger

logger = get_logger(__name__)


class JWTValidator:
    """Azure AD JWT Token Validator"""
    
    def __init__(self):
        self._jwks_client: Optional[PyJWKClient] = None
        self._jwks_cache_time: Optional[datetime] = None
        self._cache_duration = timedelta(hours=24)
    
    @property
    def jwks_uri(self) -> str:
        """Get JWKS URI for Azure AD - use common endpoint for multi-tenant"""
        return f"https://login.microsoftonline.com/{settings.aad_tenant_id}/discovery/v2.0/keys"
    
    @property
    def issuer(self) -> str:
        """Get expected token issuer"""
        return f"https://login.microsoftonline.com/{settings.aad_tenant_id}/v2.0"
    
    @property
    def jwks_client(self) -> PyJWKClient:
        """Get or create JWKS client with caching"""
        now = datetime.utcnow()
        
        if (self._jwks_client is None or 
            self._jwks_cache_time is None or 
            now - self._jwks_cache_time > self._cache_duration):
            self._jwks_client = PyJWKClient(self.jwks_uri)
            self._jwks_cache_time = now
            logger.info(f"Refreshed JWKS client cache from {self.jwks_uri}")
        
        return self._jwks_client
    
    def validate_token(self, token: str) -> Dict[str, Any]:
        """
        Validate JWT token from Azure AD
        
        In DEVELOPMENT mode, we decode without full signature verification
        to work with Microsoft Graph tokens (User.Read scope).
        
        Args:
            token: Bearer token (without 'Bearer ' prefix)
            
        Returns:
            Decoded token claims
            
        Raises:
            AuthenticationError: If token is invalid
        """
        if not token:
            raise AuthenticationError("Token is missing")
        
        # Remove 'Bearer ' prefix if present
        if token.startswith("Bearer "):
            token = token[7:]
        
        try:
            # In development mode, decode without verification to allow Graph tokens
            if settings.environment.lower() in ["development", "dev", "local"]:
                # First decode without verification to get claims
                unverified_claims = jwt.decode(
                    token,
                    options={
                        "verify_signature": False,
                        "verify_exp": True,  # Still check expiration
                        "verify_aud": False,
                        "verify_iss": False,
                    }
                )
                
                # Log token info for debugging
                logger.info(f"Dev mode - Token audience: {unverified_claims.get('aud')}")
                logger.info(f"Dev mode - Token issuer: {unverified_claims.get('iss')}")
                logger.info(f"Dev mode - User: {unverified_claims.get('preferred_username', unverified_claims.get('upn', 'unknown'))}")
                
                return unverified_claims
            
            # Production mode - full verification
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            
            valid_audiences = [
                settings.aad_client_id,
                "https://graph.microsoft.com",
                "00000003-0000-0000-c000-000000000000",
            ]
            
            if settings.aad_audience and settings.aad_audience not in valid_audiences:
                valid_audiences.append(settings.aad_audience)
            
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=valid_audiences,
                issuer=self.issuer,
                options={
                    "verify_exp": True,
                    "verify_aud": True,
                    "verify_iss": True,
                }
            )
            
            return claims
            
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            raise AuthenticationError("Token has expired")
        except jwt.InvalidAudienceError as e:
            logger.warning(f"Invalid token audience: {e}")
            raise AuthenticationError("Invalid token audience")
        except jwt.InvalidIssuerError:
            logger.warning("Invalid token issuer")
            raise AuthenticationError("Invalid token issuer")
        except jwt.PyJWTError as e:
            logger.error(f"JWT validation error: {e}")
            raise AuthenticationError(f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error validating token: {e}")
            raise AuthenticationError("Token validation failed")
    
    def get_actor_context(self, token: str) -> ActorContext:
        """
        Extract actor context from validated token
        
        Args:
            token: Bearer token
            
        Returns:
            ActorContext with user information
        """
        claims = self.validate_token(token)
        
        # Extract user info from claims
        aad_id = claims.get("oid", "")
        
        # Log aad_id for debugging
        logger.info(f"Token aad_id (oid): {aad_id}")
        
        # Try multiple claim names for email (Graph tokens use different claims)
        email = (
            claims.get("email") or 
            claims.get("preferred_username") or 
            claims.get("upn") or 
            claims.get("unique_name") or
            ""
        )
        
        display_name = claims.get("name", email)
        roles = claims.get("roles", [])
        
        if not email:
            logger.warning(f"No email found in token claims. Available claims: {list(claims.keys())}")
            raise AuthenticationError("Unable to determine user email from token")
        
        logger.info(f"Authenticated user: {email} (display: {display_name})")
        
        return ActorContext(
            aad_id=aad_id,
            email=email,
            display_name=display_name,
            roles=roles
        )


# Global validator instance
_jwt_validator: Optional[JWTValidator] = None


def get_jwt_validator() -> JWTValidator:
    """Get global JWT validator instance"""
    global _jwt_validator
    if _jwt_validator is None:
        _jwt_validator = JWTValidator()
    return _jwt_validator


def get_current_user(authorization: str) -> ActorContext:
    """
    Get current user from authorization header
    
    Args:
        authorization: Authorization header value
        
    Returns:
        ActorContext
    """
    if not authorization:
        raise AuthenticationError("Authorization header is missing")
    
    validator = get_jwt_validator()
    return validator.get_actor_context(authorization)
