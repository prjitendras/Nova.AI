"""API module - Routes and dependencies"""
from .deps import get_current_user_dep, get_correlation_id_dep

__all__ = ["get_current_user_dep", "get_correlation_id_dep"]

