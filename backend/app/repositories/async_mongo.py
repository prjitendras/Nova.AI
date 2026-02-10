"""Async MongoDB Client using Motor for async operations"""
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from ..config.settings import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)

# Global async client instance
_async_client: Optional[AsyncIOMotorClient] = None
_async_database: Optional[AsyncIOMotorDatabase] = None


def get_async_client() -> AsyncIOMotorClient:
    """Get or create async MongoDB client using Motor"""
    global _async_client
    if _async_client is None:
        logger.info(f"Creating async MongoDB client for: {settings.mongo_uri}")
        _async_client = AsyncIOMotorClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=30000,
        )
    return _async_client


def get_async_database() -> AsyncIOMotorDatabase:
    """Get the async application database"""
    global _async_database
    if _async_database is None:
        client = get_async_client()
        _async_database = client[settings.mongo_db]
        logger.info(f"Using async database: {settings.mongo_db}")
    return _async_database


async def close_async_connection() -> None:
    """Close async MongoDB connection"""
    global _async_client, _async_database
    if _async_client is not None:
        _async_client.close()
        _async_client = None
        _async_database = None
        logger.info("Async MongoDB connection closed")


async def async_health_check() -> dict:
    """Check async MongoDB health"""
    try:
        client = get_async_client()
        await client.admin.command("ping")
        return {
            "status": "healthy",
            "database": settings.mongo_db,
            "connection": "ok",
            "type": "async"
        }
    except Exception as e:
        logger.error(f"Async MongoDB health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": settings.mongo_db,
            "error": str(e),
            "type": "async"
        }
