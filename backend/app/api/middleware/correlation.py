"""
Correlation ID Middleware

Adds a unique correlation ID to each request for distributed tracing and logging.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from ...utils.logger import set_correlation_id
from ...utils.idgen import generate_correlation_id


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adds correlation ID to all requests.
    
    - Checks for existing X-Correlation-Id header
    - Generates new ID if not present
    - Sets correlation ID in logging context
    - Adds correlation ID to response headers
    """
    
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Get existing correlation ID or generate new one
        correlation_id = (
            request.headers.get("X-Correlation-Id") or generate_correlation_id()
        )
        
        # Set correlation ID in logging context
        set_correlation_id(correlation_id)
        
        # Process request
        response = await call_next(request)
        
        # Add correlation ID to response headers
        response.headers["X-Correlation-Id"] = correlation_id
        
        return response

