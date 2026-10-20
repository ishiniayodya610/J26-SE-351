"""
Pydantic model representing IoT sensor telemetry readings.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TelemetryReading(BaseModel):
    aquarium_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    temperature_c: float
    ph: float
    dissolved_oxygen_mg_l: Optional[float] = None
    ammonia_ppm: Optional[float] = None
    nitrite_ppm: Optional[float] = None
    nitrate_ppm: Optional[float] = None
    salinity_ppt: Optional[float] = None
    turbidity_ntu: Optional[float] = None
