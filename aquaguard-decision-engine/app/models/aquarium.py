"""
Pydantic model representing an aquarium setup, current population, and equipment.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class AquariumEquipment(BaseModel):
    heater: bool = True
    filter_type: str = "canister"
    aeration: bool = True
    co2_injection: bool = False
    uv_sterilizer: bool = False


class Aquarium(BaseModel):
    id: str
    name: str
    volume_liters: float
    dimensions_cm: Optional[Dict[str, float]] = None
    water_type: str = "freshwater"
    current_species_ids: List[str] = Field(default_factory=list)
    equipment: AquariumEquipment = Field(default_factory=AquariumEquipment)
    metadata: Dict[str, Any] = Field(default_factory=dict)
