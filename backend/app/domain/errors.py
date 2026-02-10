"""Domain Errors - Centralized Exception Hierarchy"""
from typing import Any, Dict, Optional


class DomainError(Exception):
    """Base domain error - all errors extend this"""
    
    error_code: str = "DOMAIN_ERROR"
    http_status: int = 400
    
    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None
    ):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if error_code:
            self.error_code = error_code
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert error to API response dict"""
        return {
            "error": {
                "code": self.error_code,
                "message": self.message,
                "details": self.details
            }
        }


# Authentication & Authorization Errors
class AuthenticationError(DomainError):
    """Token missing, invalid, or expired"""
    error_code = "AUTHENTICATION_ERROR"
    http_status = 401


class AuthorizationError(DomainError):
    """User lacks permission for action"""
    error_code = "AUTHORIZATION_ERROR"
    http_status = 403


class PermissionDeniedError(AuthorizationError):
    """Specific permission denied"""
    error_code = "PERMISSION_DENIED"


# Validation Errors
class ValidationError(DomainError):
    """Input validation failed"""
    error_code = "VALIDATION_ERROR"
    http_status = 400


class WorkflowValidationError(ValidationError):
    """Workflow definition validation failed"""
    error_code = "WORKFLOW_VALIDATION_ERROR"


# Not Found Errors
class NotFoundError(DomainError):
    """Resource not found"""
    error_code = "NOT_FOUND"
    http_status = 404


class WorkflowNotFoundError(NotFoundError):
    """Workflow not found"""
    error_code = "WORKFLOW_NOT_FOUND"


class TicketNotFoundError(NotFoundError):
    """Ticket not found"""
    error_code = "TICKET_NOT_FOUND"


class StepNotFoundError(NotFoundError):
    """Ticket step not found"""
    error_code = "STEP_NOT_FOUND"


class AttachmentNotFoundError(NotFoundError):
    """Attachment not found"""
    error_code = "ATTACHMENT_NOT_FOUND"


# Conflict Errors
class ConflictError(DomainError):
    """Resource conflict (e.g., concurrent modification)"""
    error_code = "CONFLICT"
    http_status = 409


class ConcurrencyError(ConflictError):
    """Optimistic concurrency conflict"""
    error_code = "CONCURRENCY_CONFLICT"


class InvalidStateError(ConflictError):
    """Action not valid for current state"""
    error_code = "INVALID_STATE"


class AlreadyExistsError(ConflictError):
    """Resource already exists"""
    error_code = "ALREADY_EXISTS"


class InfoRequestOpenError(ConflictError):
    """Info request already open for this step"""
    error_code = "INFO_REQUEST_OPEN"


# Engine Errors
class EngineError(DomainError):
    """Workflow engine error"""
    error_code = "ENGINE_ERROR"
    http_status = 500


class TransitionNotFoundError(EngineError):
    """No valid transition found for event"""
    error_code = "TRANSITION_NOT_FOUND"
    http_status = 400


class ApproverResolutionError(EngineError):
    """Could not resolve approver"""
    error_code = "APPROVER_RESOLUTION_ERROR"
    http_status = 400


class ManagerNotFoundError(ApproverResolutionError):
    """Manager not found in Azure AD"""
    error_code = "MANAGER_NOT_FOUND"


# External Service Errors
class ExternalServiceError(DomainError):
    """External service failure"""
    error_code = "EXTERNAL_SERVICE_ERROR"
    http_status = 502


class GraphApiError(ExternalServiceError):
    """Microsoft Graph API error"""
    error_code = "GRAPH_API_ERROR"


class EmailSendError(ExternalServiceError):
    """Email sending failed"""
    error_code = "EMAIL_SEND_ERROR"


class OpenAIError(ExternalServiceError):
    """Azure OpenAI API error"""
    error_code = "OPENAI_ERROR"


# Attachment Errors
class AttachmentError(DomainError):
    """Attachment related error"""
    error_code = "ATTACHMENT_ERROR"


class AttachmentTooLargeError(AttachmentError):
    """Attachment exceeds max size"""
    error_code = "ATTACHMENT_TOO_LARGE"
    http_status = 413


class InvalidMimeTypeError(AttachmentError):
    """File type not allowed"""
    error_code = "INVALID_MIME_TYPE"
    http_status = 400


# Rate Limiting
class RateLimitError(DomainError):
    """Rate limit exceeded"""
    error_code = "RATE_LIMIT_EXCEEDED"
    http_status = 429

