"""
Error Handlers

Centralized exception handlers for the FastAPI application.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from ...domain.errors import DomainError
from ...utils.logger import get_logger, get_correlation_id

logger = get_logger(__name__)


async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    """
    Handle domain-specific errors (business logic errors).
    
    These are expected errors that occur during normal operation,
    such as validation failures, not found errors, permission denied, etc.
    """
    logger.warning(
        f"Domain error: {exc.error_code} - {exc.message}",
        extra={"error_code": exc.error_code, "details": exc.details}
    )
    return JSONResponse(
        status_code=exc.http_status,
        content=exc.to_dict(),
        headers={"X-Correlation-Id": get_correlation_id() or ""}
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Handle request validation errors.
    
    These occur when request data doesn't match expected schema.
    Logs request details for debugging.
    """
    # Log detailed validation error with request info
    try:
        body = await request.body()
        body_str = body.decode('utf-8')[:500] if body else 'empty'
    except Exception:
        body_str = 'could not read body'
    
    logger.warning(
        f"Validation error: {exc.errors()}, "
        f"path={request.url.path}, "
        f"method={request.method}, "
        f"body={body_str}"
    )
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": {"errors": exc.errors()}
            }
        },
        headers={"X-Correlation-Id": get_correlation_id() or ""}
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle unexpected errors.
    
    These are unhandled exceptions that should not occur during normal operation.
    Logs full stack trace for debugging.
    """
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "details": {"hint": "Check server logs for details"}
            }
        },
        headers={"X-Correlation-Id": get_correlation_id() or ""}
    )


def register_error_handlers(app: FastAPI) -> None:
    """
    Register all exception handlers with the FastAPI application.
    
    Args:
        app: The FastAPI application instance
    """
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, general_exception_handler)

