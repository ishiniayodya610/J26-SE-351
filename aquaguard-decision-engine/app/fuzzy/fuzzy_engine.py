"""
Fuzzy Inference Engine executing water quality and behavioral evaluation via scikit-fuzzy control systems.
Phase 5: Ecosystem Stability Index (ESI) Calculation.
"""

from typing import Dict, Any, List
from skfuzzy import control as ctrl
from app.fuzzy.membership import setup_fuzzy_variables
from app.fuzzy.rules import get_fuzzy_rules


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to access attributes from dictionaries or Pydantic models uniformly."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def calculate_esi(telemetry: Any, fish_list: List[Any], species_db: Dict[str, Any]) -> Dict[str, Any]:
    """
    Takes CSP-approved telemetry and computes the Ecosystem Stability Index (ESI).
    """
    temp_val = _get(telemetry, "temperature_c", 25.0)
    ph_val = _get(telemetry, "ph", 7.0)
    tds_val = _get(telemetry, "tds_ppm", 200)

    # Derive aggression dynamically based on species database and vision lethargy flags
    max_aggression = 0.0
    for fish in fish_list:
        species_id = _get(fish, "species_id")
        if species_id in species_db:
            behavior = species_db[species_id].get("behavior", {})
            base_aggression = behavior.get("aggression")
            if base_aggression is None:
                base_aggression = behavior.get("aggression_score_1_to_10")
            if base_aggression is None:
                base_aggression = 1
            # Increase aggression score slightly if vision API detects stress/lethargy
            stress_modifier = _get(fish, "lethargy_index_pct", 0) / 20.0
            calculated = min(10.0, float(base_aggression + stress_modifier))
            if calculated > max_aggression:
                max_aggression = calculated

    # Initialize the Fuzzy Control System
    temperature, ph, tds, aggression, esi = setup_fuzzy_variables()
    rules = get_fuzzy_rules(temperature, ph, tds, aggression, esi)
    esi_ctrl = ctrl.ControlSystem(rules)
    esi_sim = ctrl.ControlSystemSimulation(esi_ctrl)

    # Input the real values
    esi_sim.input['temperature'] = temp_val
    esi_sim.input['ph'] = ph_val
    esi_sim.input['tds'] = tds_val
    esi_sim.input['aggression'] = max_aggression

    # Calculate
    try:
        esi_sim.compute()
        score = esi_sim.output['esi']

        # Determine human-readable category based on score
        if score < 0.35:
            category = "Critical"
        elif score < 0.70:
            category = "Suboptimal"
        else:
            category = "Stable"

        return {
            "esi_score": round(float(score), 2),
            "stability_status": category
        }
    except Exception:
        # Fallback if inputs fall completely outside rule boundaries
        return {"esi_score": 0.5, "stability_status": "Suboptimal"}


class FuzzyEngine:
    """Wrapper class for Fuzzy Stability Engine."""

    def evaluate(self, telemetry: Any, fish_list: List[Any], species_db: Dict[str, Any]) -> Dict[str, Any]:
        return calculate_esi(telemetry, fish_list, species_db)
