"""
Pydantic model representing IoT sensor telemetry, edge diagnostics, and gatekeeper states.
Phase 3 Data Input Layer.
"""

from typing import Optional
from pydantic import BaseModel


class Diagnostics(BaseModel):
    fault_detected: bool
    imputed: bool


class Gatekeeper(BaseModel):
    heater_lockout: bool
    ph_pump_lockout: bool


class Telemetry(BaseModel):
    temperature_c: float
    ph: float
    tds_ppm: float
    diagnostics: Optional[Diagnostics] = None
    gatekeeper: Optional[Gatekeeper] = None


# Backwards compatibility alias
TelemetryReading = Telemetry
