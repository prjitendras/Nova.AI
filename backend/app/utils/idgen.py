"""ID Generation Utilities"""
import uuid
from datetime import datetime
from typing import Optional


def generate_id(prefix: Optional[str] = None) -> str:
    """
    Generate a unique ID with optional prefix
    
    Args:
        prefix: Optional prefix for the ID (e.g., 'TKT', 'WF', 'STEP')
        
    Returns:
        Unique ID string
        
    Examples:
        >>> generate_id('TKT')
        'TKT-a1b2c3d4'
        >>> generate_id()
        'a1b2c3d4e5f6'
    """
    # Generate short unique ID from UUID4
    unique_part = uuid.uuid4().hex[:12]
    
    if prefix:
        return f"{prefix}-{unique_part}"
    return unique_part


def generate_workflow_id() -> str:
    """Generate workflow ID"""
    return generate_id("WF")


def generate_workflow_version_id() -> str:
    """Generate workflow version ID"""
    return generate_id("WFV")


def generate_ticket_id() -> str:
    """Generate ticket ID"""
    return generate_id("TKT")


def generate_ticket_step_id() -> str:
    """Generate ticket step ID"""
    return generate_id("STEP")


def generate_approval_task_id() -> str:
    """Generate approval task ID"""
    return generate_id("APR")


def generate_assignment_id() -> str:
    """Generate assignment ID"""
    return generate_id("ASGN")


def generate_info_request_id() -> str:
    """Generate info request ID"""
    return generate_id("INFO")


def generate_attachment_id() -> str:
    """Generate attachment ID"""
    return generate_id("ATT")


def generate_notification_id() -> str:
    """Generate notification ID"""
    return generate_id("NTF")


def generate_audit_event_id() -> str:
    """Generate audit event ID"""
    return generate_id("AUD")


def generate_handover_request_id() -> str:
    """Generate handover request ID"""
    return generate_id("HND")


def generate_sla_acknowledgment_id() -> str:
    """Generate SLA acknowledgment ID"""
    return generate_id("SLA")


def generate_correlation_id() -> str:
    """
    Generate a correlation ID for request tracing
    
    Returns:
        Correlation ID string with timestamp prefix
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    unique_part = uuid.uuid4().hex[:8]
    return f"COR-{timestamp}-{unique_part}"


def generate_lookup_id() -> str:
    """Generate workflow lookup table ID"""
    return generate_id("LKP")


def generate_lookup_entry_id() -> str:
    """Generate lookup entry ID"""
    return generate_id("LKPE")

