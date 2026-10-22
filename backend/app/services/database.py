import os
import json
import sqlite3
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger("AquaGuard.Database")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SQLITE_DB_PATH = BASE_DIR / "data" / "aquaguard.db"

# Optional MongoDB settings
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "aquaguard").strip()

DEFAULT_TANK_CONFIG = {
    "tank_id": 5,
    "tank_name": "Albino Red Cover - Tank #5",
    "volume_liters": 120.0,
    "fish_types": ["Guppy", "Swordtail", "Betta"],
    "fish_count": 8,
    "bioload_level": "OPTIMAL",
    "liters_per_fish": 15.0,
    "db_engine": "sqlite"
}


def calculate_bioload(volume_liters: float, fish_count: int) -> Dict[str, Any]:
    """Calculates stocking density metrics based on volume and fish count."""
    count = max(int(fish_count), 1)
    liters_per_fish = round(float(volume_liters) / count, 1)

    if liters_per_fish >= 15.0:
        level = "OPTIMAL"
        desc = "Safe biomass level. Biological filtration has ample capacity."
    elif liters_per_fish >= 8.0:
        level = "MODERATE"
        desc = "Moderate stocking density. Monitor ammonia oxidation rates."
    else:
        level = "OVERSTOCKED"
        desc = "High bioload density! Rapid ammonia buildup likely during feeding."

    return {
        "liters_per_fish": liters_per_fish,
        "bioload_level": level,
        "bioload_desc": desc
    }


class DatabaseManager:
    def __init__(self):
        self.engine: str = "sqlite"
        self.mongo_client = None
        self.mongo_db = None
        self._init_sqlite()

    def _init_sqlite(self):
        """Ensure SQLite table exists."""
        SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(SQLITE_DB_PATH))
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tank_config (
                tank_id INTEGER PRIMARY KEY,
                tank_name TEXT NOT NULL,
                volume_liters REAL NOT NULL,
                fish_types TEXT NOT NULL,
                fish_count INTEGER NOT NULL,
                bioload_level TEXT NOT NULL,
                liters_per_fish REAL NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()

        # Seed initial tank #5 config if empty
        cursor.execute("SELECT COUNT(*) FROM tank_config WHERE tank_id = 5")
        if cursor.fetchone()[0] == 0:
            now_iso = datetime.utcnow().isoformat() + "Z"
            cursor.execute("""
                INSERT INTO tank_config 
                (tank_id, tank_name, volume_liters, fish_types, fish_count, bioload_level, liters_per_fish, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                DEFAULT_TANK_CONFIG["tank_id"],
                DEFAULT_TANK_CONFIG["tank_name"],
                DEFAULT_TANK_CONFIG["volume_liters"],
                json.dumps(DEFAULT_TANK_CONFIG["fish_types"]),
                DEFAULT_TANK_CONFIG["fish_count"],
                DEFAULT_TANK_CONFIG["bioload_level"],
                DEFAULT_TANK_CONFIG["liters_per_fish"],
                now_iso
            ))
            conn.commit()
            logger.info("Initialized default Tank #5 config in SQLite at %s", SQLITE_DB_PATH)
        conn.close()

    async def connect_mongo(self) -> bool:
        """Attempt to connect to MongoDB Atlas if URI is provided in .env."""
        if not MONGODB_URI:
            logger.info("No MONGODB_URI configured. Using local SQLite persistence.")
            return False

        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            self.mongo_client = AsyncIOMotorClient(
                MONGODB_URI,
                serverSelectionTimeoutMS=2000
            )
            # Ping database to verify connection
            await self.mongo_client.admin.command('ping')
            self.mongo_db = self.mongo_client[MONGODB_DB_NAME]
            self.engine = "mongodb"
            logger.info("Connected to MongoDB database: %s", MONGODB_DB_NAME)
            return True
        except Exception as e:
            logger.warning("Could not connect to MongoDB (%s). Falling back to local SQLite.", e)
            self.engine = "sqlite"
            return False

    async def get_tank_config(self, tank_id: int = 5) -> Dict[str, Any]:
        """Fetch tank config from active database engine."""
        # 1. Try MongoDB if active
        if self.engine == "mongodb" and self.mongo_db is not None:
            try:
                doc = await self.mongo_db.tank_config.find_one({"tank_id": tank_id})
                if doc:
                    doc.pop("_id", None)
                    doc["db_engine"] = "mongodb"
                    return doc
            except Exception as e:
                logger.error("MongoDB read error: %s. Falling back to SQLite.", e)

        # 2. SQLite / Local fallback
        conn = sqlite3.connect(str(SQLITE_DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tank_config WHERE tank_id = ?", (tank_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            types = json.loads(row["fish_types"]) if row["fish_types"] else []
            return {
                "tank_id": row["tank_id"],
                "tank_name": row["tank_name"],
                "volume_liters": row["volume_liters"],
                "fish_types": types,
                "fish_count": row["fish_count"],
                "bioload_level": row["bioload_level"],
                "liters_per_fish": row["liters_per_fish"],
                "updated_at": row["updated_at"],
                "db_engine": "sqlite"
            }

        return {**DEFAULT_TANK_CONFIG, "updated_at": datetime.utcnow().isoformat() + "Z"}

    async def save_tank_config(
        self,
        tank_id: int,
        tank_name: str,
        volume_liters: float,
        fish_types: List[str],
        fish_count: int
    ) -> Dict[str, Any]:
        """Save updated tank config to active database."""
        bioload = calculate_bioload(volume_liters, fish_count)
        now_iso = datetime.utcnow().isoformat() + "Z"

        record = {
            "tank_id": tank_id,
            "tank_name": tank_name,
            "volume_liters": round(float(volume_liters), 1),
            "fish_types": fish_types,
            "fish_count": int(fish_count),
            "bioload_level": bioload["bioload_level"],
            "liters_per_fish": bioload["liters_per_fish"],
            "updated_at": now_iso
        }

        # 1. Save to SQLite
        try:
            conn = sqlite3.connect(str(SQLITE_DB_PATH))
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO tank_config 
                (tank_id, tank_name, volume_liters, fish_types, fish_count, bioload_level, liters_per_fish, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record["tank_id"],
                record["tank_name"],
                record["volume_liters"],
                json.dumps(record["fish_types"]),
                record["fish_count"],
                record["bioload_level"],
                record["liters_per_fish"],
                record["updated_at"]
            ))
            conn.commit()
            conn.close()
            logger.info("Saved Tank #%d config to SQLite: %s", tank_id, record)
        except Exception as e:
            logger.error("Failed to save Tank config to SQLite: %s", e)

        # 2. Save to MongoDB if available
        if self.engine == "mongodb" and self.mongo_db is not None:
            try:
                await self.mongo_db.tank_config.update_one(
                    {"tank_id": tank_id},
                    {"$set": record},
                    upsert=True
                )
                logger.info("Saved Tank #%d config to MongoDB", tank_id)
            except Exception as e:
                logger.error("Failed to save Tank config to MongoDB: %s", e)

        return {**record, "db_engine": self.engine, "bioload_desc": bioload["bioload_desc"]}


# Singleton Database Instance
db_manager = DatabaseManager()
