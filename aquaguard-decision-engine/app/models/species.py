"""
Pydantic models representing fish species knowledge base and observed fish behavior.
Phase 2 & Phase 3 Data Models.
"""

from typing import List, Dict, Optional
from pydantic import BaseModel, Field


# Phase 3: Vision / Behavioral Observation Model
class FishBehavior(BaseModel):
    species_id: str
    common_name: Optional[str] = ""
    male: int = 0
    female: int = 0
    count: Optional[int] = None
    confidence: float = 1.0
    swimming_activity_pct: float = 100.0
    lethargy_index_pct: float = 0.0
    surface_piping: str = "normal"
    feeding_response: str = "normal"
    status: str = "healthy"


# Phase 2: Species Biological Profile Models
class ParameterRange(BaseModel):
    min: float
    optimal_min: float
    optimal_max: float
    max: float


class SpeciesEnvironment(BaseModel):
    temperature: ParameterRange
    ph: ParameterRange
    tds: ParameterRange
    min_volume_liters: Optional[float] = 3.0


class SpeciesBehavior(BaseModel):
    aggression: int = Field(ge=1, le=10, description="Aggression index from 1 (peaceful) to 10 (aggressive)")
    fin_nipping: bool = False
    territorial: bool = False


class SpeciesSpatial(BaseModel):
    zones: List[str] = Field(default_factory=lambda: ["Middle"], description="Swimming layers: Top, Middle, Bottom")


class SpeciesBreeding(BaseModel):
    type: str  # livebearer, egglayer, etc.
    male_female_ratio: float = 1.0


class Species(BaseModel):
    species_id: str
    common_name: str
    temperament: str
    environment: SpeciesEnvironment
    behavior: SpeciesBehavior
    spatial: SpeciesSpatial
    breeding: SpeciesBreeding
    compatibility: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of target species_id to risk level (e.g. low_risk, moderate_risk, high_risk)"
    )
