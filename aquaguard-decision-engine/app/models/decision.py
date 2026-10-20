"""
Pydantic model representing reasoning engine decisions, recommendations, and XAI outputs.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


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
