"""
Repository layer for interacting with Species and Telemetry database collections.
"""

from typing import List, Optional, Dict, Any
from app.database.mongodb import get_database


class SpeciesRepository:
    def __init__(self):
        self.collection = get_database()["species"]

    def find_by_id(self, species_id: str) -> Optional[Dict[str, Any]]:
        return self.collection.find_one({"id": species_id})

    def list_all(self) -> List[Dict[str, Any]]:
        return list(self.collection.find({}, {"_id": 0}))


class TelemetryRepository:
    def __init__(self):
        self.collection = get_database()["telemetry"]

    def record_reading(self, reading: Dict[str, Any]) -> str:
        result = self.collection.insert_one(reading)
        return str(result.inserted_id)

    def get_latest(self, aquarium_id: str) -> Optional[Dict[str, Any]]:
        return self.collection.find_one(
            {"aquarium_id": aquarium_id},
            sort=[("timestamp", -1)],
        )
