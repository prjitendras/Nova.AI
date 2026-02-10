"""Time Utilities - UTC timestamps and formatting"""
from datetime import datetime, timezone, timedelta
from typing import Optional
from dateutil import parser as date_parser


def utc_now() -> datetime:
    """Get current UTC datetime"""
    return datetime.now(timezone.utc)


def format_iso(dt: datetime) -> str:
    """
    Format datetime to ISO 8601 string
    
    Args:
        dt: Datetime object
        
    Returns:
        ISO formatted string with Z suffix for UTC
    """
    if dt.tzinfo is None:
        # Assume UTC if no timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def parse_iso(iso_string: str) -> datetime:
    """
    Parse ISO 8601 string to datetime
    
    Args:
        iso_string: ISO formatted datetime string
        
    Returns:
        Datetime object in UTC
    """
    dt = date_parser.isoparse(iso_string)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def add_minutes(dt: datetime, minutes: int) -> datetime:
    """Add minutes to datetime"""
    return dt + timedelta(minutes=minutes)


def minutes_until(dt: datetime) -> int:
    """
    Calculate minutes until the given datetime
    
    Returns:
        Positive if in future, negative if in past
    """
    now = utc_now()
    delta = dt - now
    return int(delta.total_seconds() / 60)


def minutes_since(dt: datetime) -> int:
    """
    Calculate minutes since the given datetime
    
    Returns:
        Positive if in past, negative if in future
    """
    return -minutes_until(dt)


def is_overdue(due_at: Optional[datetime]) -> bool:
    """
    Check if due datetime has passed
    
    Args:
        due_at: Due datetime or None
        
    Returns:
        True if overdue, False otherwise
    """
    if due_at is None:
        return False
    return utc_now() > due_at


def calculate_due_at(start_time: datetime, due_minutes: int) -> datetime:
    """
    Calculate due datetime from start time and duration
    
    Args:
        start_time: Start datetime
        due_minutes: Minutes until due
        
    Returns:
        Due datetime
    """
    return add_minutes(start_time, due_minutes)


def format_duration(minutes: int) -> str:
    """
    Format duration in minutes to human readable string
    
    Args:
        minutes: Duration in minutes
        
    Returns:
        Human readable string (e.g., "2h 30m", "1d 4h")
    """
    if minutes < 0:
        return f"-{format_duration(-minutes)}"
    
    if minutes < 60:
        return f"{minutes}m"
    
    hours = minutes // 60
    remaining_minutes = minutes % 60
    
    if hours < 24:
        if remaining_minutes > 0:
            return f"{hours}h {remaining_minutes}m"
        return f"{hours}h"
    
    days = hours // 24
    remaining_hours = hours % 24
    
    if remaining_hours > 0:
        return f"{days}d {remaining_hours}h"
    return f"{days}d"

