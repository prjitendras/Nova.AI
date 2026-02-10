"""API Routes module"""
from fastapi import APIRouter

from .workflows import router as workflows_router
from .tickets import router as tickets_router
from .directory import router as directory_router
from .attachments import router as attachments_router
from .genai import router as genai_router
from .admin import router as admin_router
from .notifications import router as notifications_router
from .lookups import router as lookups_router
from .ai_chat import router as ai_chat_router
from .change_requests import router as change_requests_router

# Main API router
api_router = APIRouter()

# Include all route modules
api_router.include_router(workflows_router, prefix="/workflows", tags=["Workflows"])
api_router.include_router(tickets_router, prefix="/tickets", tags=["Tickets"])
api_router.include_router(directory_router, prefix="/directory", tags=["Directory"])
api_router.include_router(attachments_router, prefix="/attachments", tags=["Attachments"])
api_router.include_router(genai_router, prefix="/genai", tags=["GenAI"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(lookups_router, prefix="/lookups", tags=["Lookups"])
api_router.include_router(ai_chat_router, tags=["AI Chat"])
api_router.include_router(change_requests_router, tags=["Change Requests"])

__all__ = ["api_router"]

