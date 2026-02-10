"""
Email Templates Package

Beautiful, professional email templates for all notification types.
"""
from .email_templates import (
    get_email_template,
    get_base_template,
    get_info_card,
    EmailTemplateKey,
    TEMPLATE_REGISTRY
)

__all__ = [
    "get_email_template",
    "get_base_template", 
    "get_info_card",
    "EmailTemplateKey",
    "TEMPLATE_REGISTRY"
]
