from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
import backend.app.routers.telemetry as telemetry_router
from backend.app.routers.fish_profile import active_profile
from backend.app.routers.comp3_disease import calculate_disease_and_ammonia_risk

router = APIRouter(prefix="/api/comp4", tags=["Comp 4: Explainable AI"])

class FeatureAttribution(BaseModel):
    feature_name: str
    importance_weight: float
    description: str

class XAIExplanation(BaseModel):
    tank_status_headline: str
    primary_explanation: str
    edge_gatekeeper_role: str
    attributions: List[FeatureAttribution]
    recommended_actions: List[str]

# ---------------------------------------------------------------------------
# TEAMMATE 4 HOOK:
# When Teammate 4 finishes their SHAP/LIME or LLM explainability engine,
# replace this synthesizer with their actual causality attribution pipeline.
# ---------------------------------------------------------------------------
def synthesize_xai_explanation() -> Dict[str, Any]:
    latest_telemetry_state = telemetry_router.latest_telemetry_state
    sys_status = latest_telemetry_state.get("system_status", "OPTIMAL")
    diagnostics = latest_telemetry_state.get("diagnostics", {})
    gatekeeper = latest_telemetry_state.get("gatekeeper", {})
    telemetry = latest_telemetry_state.get("telemetry", {})
    
    ph_fault = diagnostics.get("ph", {}).get("fault_detected", False)
    temp_fault = diagnostics.get("temperature", {}).get("fault_detected", False)
    tds_fault = diagnostics.get("tds", {}).get("fault_detected", False)
    
    ph_locked = gatekeeper.get("ph_pump_lockout", False)
    heater_locked = gatekeeper.get("heater_lockout", False)
    runaway = latest_telemetry_state.get("thermal_runaway", {})
    is_runaway = runaway.get("active", False) or gatekeeper.get("thermal_runaway", False)
    
    attributions = []
    actions = []
    
    if is_runaway:
        curr_temp = telemetry.get("raw_temp", telemetry.get("temperature_c", 29.0))
        target_temp = active_profile.water_requirements.temperature_c
        slope = runaway.get("slope_per_min", 0.0)
        ttc = runaway.get("time_to_critical_min", 30)
        lethal_temp = runaway.get("lethal_temp", target_temp + 3.0)

        headline = "🚨 HARDWARE FAULT: Welded Relay / Stuck Heater Runaway"
        explanation = (
            f"Water temperature has climbed to {curr_temp:.1f}°C (Target: {target_temp:.1f}°C) "
            f"despite the microcontroller commanding Heater OFF (0V GPIO). "
            f"Positive rate-of-rise (+{slope:.2f}°C/min) confirms that AC mains power is continuously surging "
            f"into the heating element due to mechanically welded relay contacts or semiconductor breakdown. "
            f"At this rate, the lethal thermal ceiling ({lethal_temp:.1f}°C) for {active_profile.common_name} "
            f"will be reached in approximately {ttc} minutes. Physical disconnection is urgently required!"
        )
        edge_role = "Actuator Divergence Alarm: Software control lost authority due to welded relay contacts."
        attributions.append(FeatureAttribution(
            feature_name="Actuator State Discrepancy",
            importance_weight=0.65,
            description="Commanded state is OFF, but thermal energy is actively surging into aquatic volume."
        ))
        attributions.append(FeatureAttribution(
            feature_name="Sustained Thermal Rate-of-Rise (dT/dt)",
            importance_weight=0.25,
            description=f"Continuous positive gradient (+{slope:.2f}°C/min) violates Newton's Law of Cooling."
        ))
        attributions.append(FeatureAttribution(
            feature_name="Species Lethal Ceiling",
            importance_weight=0.10,
            description=f"Approaching acute hypoxic & thermal shock boundary ({lethal_temp:.1f}°C) for {active_profile.common_name}."
        ))
        actions.append("🚨 IMMEDIATELY unplug the heater directly from the AC wall outlet.")
        actions.append("🌬️ Turn on auxiliary air stones / increase surface aeration to counter rapid O2 depletion.")
        actions.append("🧊 If water exceeds 31.5°C, float sealed ice bottles or perform a 10% gradual cool-water change.")
        actions.append("🔧 Replace the faulty 5V mechanical relay module with an optocoupled solid-state relay (SSR).")
    elif ph_fault:
        headline = "⚠️ SENSOR FAULT MITIGATED: pH Dosing Locked"
        explanation = (
            f"The Edge TinyML Gatekeeper detected anomalous readings on the analog pH probe. "
            f"To protect {active_profile.common_name} from lethal acidosis or chemical burn, "
            f"the physical acid/base dosing pump was instantly locked out. "
            f"The safe baseline ({active_profile.water_requirements.ph:.1f}) was imputed to keep cloud analytics stable."
        )
        edge_role = "Active Actuator Lockout: Chemical dosing hardware disabled in 1 ms."
        attributions.append(FeatureAttribution(
            feature_name="pH Sensor Delta",
            importance_weight=0.78,
            description="Reading fell outside expected covariance boundaries."
        ))
        attributions.append(FeatureAttribution(
            feature_name="Species Sensitivity",
            importance_weight=0.15,
            description=f"{active_profile.common_name} is intolerant to rapid pH shifts."
        ))
        actions.append("Inspect the BNC connector on the analog pH probe.")
        actions.append("Clean probe glass bulb with distilled water and recalibrate.")
    elif temp_fault:
        headline = "⚠️ THERMAL ANOMALY INTERCEPTED: Heater Disabled"
        explanation = (
            f"The TinyML model detected an erratic temperature spike. "
            f"Heater relay was disengaged to prevent lethal thermal shock to {active_profile.common_name}."
        )
        edge_role = "Active Actuator Lockout: Heating element relay turned OFF."
        attributions.append(FeatureAttribution(
            feature_name="Thermal Rate-of-Rise",
            importance_weight=0.82,
            description="Exceeded maximum biologically viable gradient."
        ))
        actions.append("Check heater thermostat relay.")
    else:
        headline = "✅ ECOSYSTEM OPTIMAL & PROTECTED"
        explanation = (
            f"All water metrics (Temp: {telemetry.get('temperature_c', 29)}°C, "
            f"pH: {telemetry.get('ph', 6.5)}, TDS: {telemetry.get('tds_ppm', 150)} ppm) "
            f"are in harmony with the {active_profile.common_name} biological profile. "
            f"TinyML Gatekeeper reports high neural confidence with all hardware actuators operating normally."
        )
        edge_role = "Continuous Monitoring: Zero faults detected across sensor array."
        attributions.append(FeatureAttribution(
            feature_name="Parameter Balance",
            importance_weight=0.90,
            description="Water parameters tightly cluster around ideal baseline."
        ))
        actions.append("Continue standard feeding schedule.")
        actions.append("Regular bi-weekly 20% water change recommended.")

    return {
        "headline": headline,
        "explanation": explanation,
        "edge_role": edge_role,
        "attributions": attributions,
        "actions": actions
    }

@router.get("/explanation", response_model=XAIExplanation)
async def get_xai_explanation():
    data = synthesize_xai_explanation()
    return XAIExplanation(
        tank_status_headline=data["headline"],
        primary_explanation=data["explanation"],
        edge_gatekeeper_role=data["edge_role"],
        attributions=data["attributions"],
        recommended_actions=data["actions"]
    )
