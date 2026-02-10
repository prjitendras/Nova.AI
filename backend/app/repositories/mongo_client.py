"""MongoDB Client - Connection and Collection Management"""
from typing import Any, Dict, List, Optional
from pymongo import MongoClient as PyMongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure

from ..config.settings import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)

# Global client instance
_client: Optional[PyMongoClient] = None
_database: Optional[Database] = None


def get_client() -> PyMongoClient:
    """Get or create MongoDB client"""
    global _client
    if _client is None:
        logger.info(f"Connecting to MongoDB: {settings.mongo_uri}")
        _client = PyMongoClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=30000,
        )
        # Test connection
        try:
            _client.admin.command("ping")
            logger.info("MongoDB connection successful")
        except ConnectionFailure as e:
            logger.error(f"MongoDB connection failed: {e}")
            raise
    return _client


def get_database() -> Database:
    """Get the application database"""
    global _database
    if _database is None:
        client = get_client()
        _database = client[settings.mongo_db]
        logger.info(f"Using database: {settings.mongo_db}")
    return _database


def get_collection(name: str) -> Collection:
    """Get a collection from the database"""
    db = get_database()
    return db[name]


def close_connection() -> None:
    """Close MongoDB connection"""
    global _client, _database
    if _client is not None:
        _client.close()
        _client = None
        _database = None
        logger.info("MongoDB connection closed")


def create_indexes() -> None:
    """Create all required indexes"""
    db = get_database()
    logger.info("Creating MongoDB indexes...")
    
    # Workflows collection
    workflows = db["workflows"]
    workflows.create_index("workflow_id", unique=True)
    workflows.create_index("status")
    workflows.create_index("created_by.email")
    workflows.create_index("updated_at", background=True)
    
    # Workflow versions collection
    workflow_versions = db["workflow_versions"]
    workflow_versions.create_index("workflow_version_id", unique=True)
    workflow_versions.create_index([("workflow_id", ASCENDING), ("version_number", DESCENDING)])
    workflow_versions.create_index("published_at", background=True)
    
    # Tickets collection
    tickets = db["tickets"]
    tickets.create_index("ticket_id", unique=True)
    tickets.create_index([("requester.email", ASCENDING), ("status", ASCENDING)])
    tickets.create_index("status")
    tickets.create_index("workflow_id")
    tickets.create_index("updated_at", background=True)
    tickets.create_index("created_at", background=True)
    
    # Ticket steps collection
    ticket_steps = db["ticket_steps"]
    ticket_steps.create_index("ticket_step_id", unique=True)
    ticket_steps.create_index("ticket_id")
    ticket_steps.create_index([("assigned_to.email", ASCENDING), ("state", ASCENDING)])
    ticket_steps.create_index("state")
    
    # Approval tasks collection
    approval_tasks = db["approval_tasks"]
    approval_tasks.create_index("approval_task_id", unique=True)
    approval_tasks.create_index("ticket_id")
    approval_tasks.create_index("ticket_step_id")
    approval_tasks.create_index([("approver.email", ASCENDING), ("decision", ASCENDING)])
    
    # Assignments collection
    assignments = db["assignments"]
    assignments.create_index("assignment_id", unique=True)
    assignments.create_index("ticket_id")
    assignments.create_index("ticket_step_id")
    assignments.create_index([("assigned_to.email", ASCENDING), ("status", ASCENDING)])
    
    # Info requests collection
    info_requests = db["info_requests"]
    info_requests.create_index("info_request_id", unique=True)
    info_requests.create_index("ticket_id")
    info_requests.create_index([("ticket_step_id", ASCENDING), ("status", ASCENDING)])
    
    # Attachments collection
    attachments = db["attachments"]
    attachments.create_index("attachment_id", unique=True)
    attachments.create_index("ticket_id")
    
    # Notification outbox collection
    notification_outbox = db["notification_outbox"]
    notification_outbox.create_index("notification_id", unique=True)
    notification_outbox.create_index([("status", ASCENDING), ("next_retry_at", ASCENDING)])
    notification_outbox.create_index("ticket_id")
    notification_outbox.create_index("locked_until")
    
    # Audit events collection
    audit_events = db["audit_events"]
    audit_events.create_index("audit_event_id", unique=True)
    audit_events.create_index([("ticket_id", ASCENDING), ("timestamp", DESCENDING)])
    audit_events.create_index("timestamp", background=True)
    audit_events.create_index("correlation_id")
    
    # System config collection
    system_config = db["system_config"]
    system_config.create_index("config_id", unique=True)
    
    logger.info("MongoDB indexes created successfully")


def health_check() -> Dict[str, Any]:
    """Check MongoDB health"""
    try:
        client = get_client()
        client.admin.command("ping")
        return {
            "status": "healthy",
            "database": settings.mongo_db,
            "connection": "ok"
        }
    except Exception as e:
        logger.error(f"MongoDB health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": settings.mongo_db,
            "error": str(e)
        }


class MongoClient:
    """Wrapper class for MongoDB operations"""
    
    def __init__(self):
        self.db = get_database()
    
    def get_collection(self, name: str) -> Collection:
        """Get a collection"""
        return self.db[name]
    
    def health_check(self) -> Dict[str, Any]:
        """Check connection health"""
        return health_check()

