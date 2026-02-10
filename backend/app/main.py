"""
AI OPS Workflow Platform - Main FastAPI Application

This is the entry point for the FastAPI application.
It configures middleware, routes, and lifecycle handlers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config.settings import settings
from .api.routes import api_router
from .api.middleware import CorrelationIdMiddleware, register_error_handlers
from .repositories.mongo_client import create_indexes, close_connection, health_check
from .scheduler.dev_scheduler import start_scheduler, stop_scheduler
from .utils.logger import setup_logging, get_logger

# Setup logging first
setup_logging()
logger = get_logger(__name__)


# =============================================================================
# Application Lifecycle
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    
    Startup:
        - Creates MongoDB indexes
        - Starts background scheduler (in dev mode)
    
    Shutdown:
        - Stops scheduler
        - Closes database connections
    """
    # Startup
    logger.info("Starting AI OPS Workflow Platform...")
    
    # Create MongoDB indexes
    try:
        create_indexes()
        logger.info("MongoDB indexes created")
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")
    
    # Start scheduler in dev mode
    if settings.environment == "development":
        try:
            start_scheduler()
            logger.info("Dev scheduler started")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
    
    logger.info("Application started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    stop_scheduler()
    close_connection()
    logger.info("Application shutdown complete")


# =============================================================================
# Application Factory
# =============================================================================

def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.
    
    Returns:
        Configured FastAPI application instance
    """
    application = FastAPI(
        title="AI OPS Workflow Platform",
        description="Enterprise workflow + ticketing platform with AI-assisted workflow generation",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
        openapi_url="/api/openapi.json" if settings.debug else None,
    )
    
    # Register middleware
    _configure_middleware(application)
    
    # Register error handlers
    register_error_handlers(application)
    
    # Register routes
    _configure_routes(application)
    
    return application


def _configure_middleware(app: FastAPI) -> None:
    """Configure application middleware."""
    # CORS middleware
    # If cors_origins is "*", allow all origins (simpler for VM/internal deployment)
    # Note: allow_credentials must be False when allowing all origins
    allow_all = settings.cors_origins.strip() == "*"
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else settings.cors_origins_list,
        allow_credentials=not allow_all,  # Must be False when allowing all origins
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Correlation-Id"],
    )
    
    # Correlation ID middleware
    app.add_middleware(CorrelationIdMiddleware)


def _configure_routes(app: FastAPI) -> None:
    """Configure application routes."""
    # API routes (versioned)
    app.include_router(api_router, prefix="/api/v1")
    
    # Health check endpoint (no auth required)
    @app.get("/health", tags=["Health"])
    async def health():
        """
        Health check endpoint.
        
        Returns application health status including database connectivity.
        """
        mongo_health = health_check()
        return {
            "status": "healthy" if mongo_health.get("status") == "healthy" else "degraded",
            "version": "1.0.0",
            "environment": settings.environment,
            "mongo": mongo_health
        }
    
    # Root endpoint
    @app.get("/", tags=["Health"])
    async def root():
        """Root endpoint with API information."""
        return {
            "name": "AI OPS Workflow Platform",
            "version": "1.0.0",
            "docs": "/api/docs" if settings.debug else None
        }


# =============================================================================
# Application Instance
# =============================================================================

# Create the application instance
app = create_app()
