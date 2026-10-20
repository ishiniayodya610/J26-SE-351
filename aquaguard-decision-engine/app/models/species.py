"""
Pydantic model representing fish and plant species parameters.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class WaterParameterRange(BaseModel):
    min: float
    max: float
    optimal_min: float
    optimal_max: float


class Species(BaseModel):
    id: str
    common_name: str
    scientific_name: Optional[str] = None
    water_type: str = "freshwater"  # freshwater, saltwater, brackish
    temperature_c: WaterParameterRange
    ph: WaterParameterRange
    hardness_dgh: Optional[WaterParameterRange] = None
    min_tank_volume_liters: float = 20.0
    temperament: str = "peaceful"  # peaceful, semi-aggressive, aggressive
    swimming_level: str = "middle"  # top, middle, bottom
    incompatible_species_ids: List[str] = Field(default_factory=list)
    diet_type: str = "omnivore"
