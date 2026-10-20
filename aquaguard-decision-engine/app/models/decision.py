"""
Pydantic models representing evaluation requests, forecast predictions, and decision outputs.
Phase 3 Data Input Layer & Decision Schemas.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from app.models.aquarium import Aquarium
from app.models.telemetry import Telemetry
from app.models.species import FishBehavior


# Phase 3: Forecast Model from Forecasting Service
class Forecast(BaseModel):
    ammonia_spike_risk_pct: float
    ammonia_status: str
    whitespot_disease_risk_pct: float
    disease_status: str
    temperature_trend_c: float
    forecast_horizon_hours: int


# Phase 3: Comprehensive Evaluation Request Payload
class EvaluationRequest(BaseModel):
    scenario_id: str
    aquarium: Aquarium
    telemetry: Telemetry
    fish: List[FishBehavior]
    forecast: Forecast


# Decision & Recommendation Outputs
class Recommendation(BaseModel):
    action: str
    parameter: Optional[str] = None
    target_value: Optional[float] = None
    urgency: str = "medium"  # low, medium, high, critical
    rationale: str
    impact_score: float = 0.0


class DecisionOutput(BaseModel):
    decision_id: str
    aquarium_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    overall_health_score: float = 1.0  # 0.0 to 1.0
    risk_level: str = "normal"  # normal, warning, critical
    active_violations: List[str] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)
    fuzzy_assessments: Dict[str, Any] = Field(default_factory=dict)
    explanation: Dict[str, Any] = Field(default_factory=dict)
