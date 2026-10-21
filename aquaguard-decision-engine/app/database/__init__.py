"""
Database connection and repository management for AquaGuard Decision Engine.
Phase 10: Firebase Integration.
"""

from app.database.mongodb import get_database, get_mongo_client
from app.database.firebase_client import (
    get_live_telemetry,
    save_decision_result,
    save_simulation_result,
)

__all__ = [
    "get_database",
    "get_mongo_client",
    "get_live_telemetry",
    "save_decision_result",
    "save_simulation_result",
]
