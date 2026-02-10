"""Structured JSON Logging with Correlation ID Support"""
import json
import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from typing import Any, Dict, Optional
from contextvars import ContextVar

from ..config.settings import settings


# Context variable for correlation ID
correlation_id_var: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)


class JsonFormatter(logging.Formatter):
    """JSON formatter for structured logging"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_obj: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add correlation ID if present
        correlation_id = correlation_id_var.get()
        if correlation_id:
            log_obj["correlation_id"] = correlation_id
        
        # Add extra fields from record
        extra_fields = ["ticket_id", "step_id", "actor_email", "action", "status", "workflow_id", "user_id"]
        for field in extra_fields:
            if hasattr(record, field):
                log_obj[field] = getattr(record, field)
        
        # Add exception info if present
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_obj)


def setup_logging() -> None:
    """Setup logging configuration"""
    # Create logs directory if it doesn't exist
    logs_path = settings.logs_path
    os.makedirs(logs_path, exist_ok=True)
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper()))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # JSON formatter
    json_formatter = JsonFormatter()
    
    # Console handler (for development)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(json_formatter)
    root_logger.addHandler(console_handler)
    
    # File handler with rotation
    log_file = os.path.join(logs_path, "app.log")
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding="utf-8"
    )
    file_handler.setFormatter(json_formatter)
    root_logger.addHandler(file_handler)
    
    # Error log file
    error_file = os.path.join(logs_path, "error.log")
    error_handler = RotatingFileHandler(
        error_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(json_formatter)
    root_logger.addHandler(error_handler)
    
    # Reduce verbosity of third-party loggers
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name"""
    return logging.getLogger(name)


class LoggerAdapter(logging.LoggerAdapter):
    """Logger adapter with context support"""
    
    def process(self, msg: str, kwargs: Dict[str, Any]) -> tuple:
        extra = kwargs.get("extra", {})
        # Add correlation ID from context
        correlation_id = correlation_id_var.get()
        if correlation_id:
            extra["correlation_id"] = correlation_id
        kwargs["extra"] = extra
        return msg, kwargs


def get_context_logger(name: str, **context: Any) -> LoggerAdapter:
    """Get a logger adapter with additional context"""
    logger = logging.getLogger(name)
    return LoggerAdapter(logger, context)


def set_correlation_id(correlation_id: str) -> None:
    """Set correlation ID in context"""
    correlation_id_var.set(correlation_id)


def get_correlation_id() -> Optional[str]:
    """Get correlation ID from context"""
    return correlation_id_var.get()

