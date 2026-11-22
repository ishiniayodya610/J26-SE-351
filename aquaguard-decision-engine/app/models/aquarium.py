"""
Pydantic model representing an aquarium setup, dimensions, water type, and equipment.
Phase 3 Data Input Layer.
"""

from typing import Dict, Optional
from pydantic import BaseModel


class Equipment(BaseModel):
    heater: bool
    filter_type: str
    aeration: bool


class Aquarium(BaseModel):
    volume_liters: float
    dimensions_cm: Optional[Dict[str, float]] = None
    water_type: str = "freshwater"
    equipment: Optional[Equipment] = None
