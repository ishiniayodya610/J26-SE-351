from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, List
import random
from backend.app.routers.telemetry import latest_telemetry_state
from backend.app.routers.fish_profile import active_profile

router = APIRouter(prefix="/api/comp3", tags=["Comp 3: Disease & Ammonia"])

class DiseaseRiskReport(BaseModel):
    species: str
    ammonia_spike_risk_pct: float
    ammonia_status: str
    whitespot_disease_risk_pct: float
    disease_status: str
    temperature_trend_c: float
    forecast_horizon_hours: int
    contributing_factors: List[str]

# ---------------------------------------------------------------------------
# TEAMMATE 3 HOOK:
# When Teammate 3 completes their tabular/time-series ML model,
# replace this function with their actual pickled/ONNX model inference.
# ---------------------------------------------------------------------------
def calculate_disease_and_ammonia_risk(temp: float, ph: float, tds: float) -> Dict[str, Any]:
    # Dynamic risk calculations based on water parameter deviations from active profile
    target = active_profile.water_requirements
    temp_delta = abs(temp - target.temperature_c)
    ph_delta = abs(ph - target.ph)
    
    # Whitespot (Ich) spikes with thermal fluctuation
    base_whitespot = 8.0 + (temp_delta * 14.5)
    whitespot_risk = min(max(round(base_whitespot, 1), 5.0), 95.0)
    
    # Ammonia toxicity increases with high pH and high TDS
    base_ammonia = 10.0 + (ph_delta * 18.0)
    ammonia_risk = min(max(round(base_ammonia, 1), 6.0), 92.0)
    
    factors = []
    if temp_delta > 2.0:
        factors.append(f"Water temperature deviated by {temp_delta:.1f}°C from {active_profile.common_name} target.")
    if ph_delta > 0.5:
        factors.append(f"pH level shifted by {ph_delta:.2f} units, increasing ammonia toxicity risk.")
    if not factors:
        factors.append("Water parameters are within safe biological limits.")

    return {
        "whitespot_risk": whitespot_risk,
        "whitespot_status": "HIGH RISK" if whitespot_risk > 60 else ("MODERATE" if whitespot_risk > 30 else "LOW RISK"),
        "ammonia_risk": ammonia_risk,
        "ammonia_status": "CRITICAL" if ammonia_risk > 65 else ("WARNING" if ammonia_risk > 35 else "STABLE"),
        "factors": factors
    }

@router.get("/risk-assessment", response_model=DiseaseRiskReport)
async def get_disease_risk():
    """
    Evaluates current sanitized telemetry against biological thresholds
    to forecast ammonia surges and whitespot disease outbreak.
    """
    telemetry = latest_telemetry_state.get("telemetry", {})
    temp = telemetry.get("temperature_c", 29.0)
    ph = telemetry.get("ph", 6.5)
    tds = telemetry.get("tds_ppm", 150.0)
    
    calc = calculate_disease_and_ammonia_risk(temp, ph, tds)
    
    return DiseaseRiskReport(
        species=active_profile.common_name,
        ammonia_spike_risk_pct=calc["ammonia_risk"],
        ammonia_status=calc["ammonia_status"],
        whitespot_disease_risk_pct=calc["whitespot_risk"],
        disease_status=calc["whitespot_status"],
        temperature_trend_c=temp,
        forecast_horizon_hours=12,
        contributing_factors=calc["factors"]
    )
