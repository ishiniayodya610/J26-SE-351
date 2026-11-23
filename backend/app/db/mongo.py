"""
AquaGuard — MongoDB async client (Motor).
Provides a singleton `mongo_db` used across all domain services.
Falls back gracefully if MONGODB_URI is not set (dev mode).
"""
import logging
from typing import Optional

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

try:
    from backend.app.core.config import settings
except ImportError:
    from app.core.config import settings

logger = logging.getLogger("AquaGuard.MongoDB")

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect() -> bool:
    """Connect to MongoDB. Called once at app startup."""
    global _client, _db
    if not settings.MONGODB_URI:
        logger.info("MONGODB_URI not set — MongoDB disabled. Set it in .env to enable.")
        return False
    try:
        _client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=5000,
        )
        # Ping to verify connection
        await _client.admin.command("ping")
        _db = _client[settings.MONGODB_DB_NAME]
        await _ensure_indexes()
        logger.info("✅ MongoDB connected — database: %s", settings.MONGODB_DB_NAME)
        return True
    except Exception as exc:
        logger.warning("⚠️  MongoDB connection failed: %s", exc)
        _client = None
        _db = None
        return False


async def disconnect() -> None:
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB disconnected.")


def get_db() -> Optional[AsyncIOMotorDatabase]:
    """Return the active database handle. None if not connected."""
    return _db


async def _ensure_indexes() -> None:
    """Create all required indexes on startup (idempotent)."""
    if _db is None:
        return
    # users
    await _db.users.create_index("email", unique=True)
    # tanks
    await _db.tanks.create_index("owner_id")
    # devices
    await _db.devices.create_index("device_uid", unique=True)
    await _db.devices.create_index("provision_token", sparse=True)
    # telemetry — most queried: latest reading per tank
    await _db.telemetry.create_index([("tank_id", 1), ("ts", -1)])
    logger.info("MongoDB indexes ensured.")
