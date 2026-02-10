"""
API Middleware Module

This module contains middleware for request/response processing and error handling.

Modules:
    - correlation: Request correlation ID middleware
    - error_handlers: Exception handlers for domain and validation errors
"""

from .correlation import CorrelationIdMiddleware
from .error_handlers import register_error_handlers

__all__ = ["CorrelationIdMiddleware", "register_error_handlers"]

