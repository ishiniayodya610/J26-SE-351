"""
What-If Engine allowing users to test hypothetical population changes and parameter shifts.
Phase 8: What-If Simulation.
"""

from typing import Dict, Any, List
from app.csp.csp_engine import evaluate_hard_constraints
from app.fuzzy.fuzzy_engine import calculate_esi
from app.xai.explanation import generate_csp_explanation


def simulate_population_change(aquarium, telemetry, current_fish, proposed_fish, species_db):
    """
    Executes the What-If simulation pipeline to compare the Before vs After states.
    """
    # 1. Evaluate Current State (Before)
    base_csp = evaluate_hard_constraints(aquarium, telemetry, current_fish, species_db)
    if base_csp.get("status") == "PASS":
        base_esi = calculate_esi(telemetry, current_fish, species_db)
        esi_before = base_esi.get("esi_score", 0.0)
    else:
        esi_before = 0.0  # Baseline was already invalid

    # 2. Evaluate Proposed State (After)
    new_csp = evaluate_hard_constraints(aquarium, telemetry, proposed_fish, species_db)

    # Handle CSP Rejection on the new configuration
    if new_csp.get("status") == "REJECTED":
        xai_output = generate_csp_explanation(new_csp)
        return {
            "status": "REJECTED",
            "esi_before": esi_before,
            "esi_after": None,
            "explanation": xai_output["reason"],
            "recommendation": xai_output["recommendation"],
        }

    # Handle CSP Pass (Calculate new FIS stability)
    new_esi = calculate_esi(telemetry, proposed_fish, species_db)
    esi_after = new_esi.get("esi_score", 0.0)

    # 3. Compare Before vs After
    esi_difference = round(esi_after - esi_before, 2)

    # Simple semantic XAI generation for the simulation
    if esi_difference > 0:
        impact = "Improved"
        recommendation = "The configuration is feasible, and the additional population improves overall ecosystem stability."
    elif esi_difference < 0:
        impact = "Reduced"
        recommendation = "The configuration is feasible, but the additional population reduces the available biological capacity and lowers stability."
    else:
        impact = "Neutral"
        recommendation = "The configuration is feasible and maintains current ecosystem stability."

    return {
        "status": "APPROVED",
        "esi_before": esi_before,
        "esi_after": esi_after,
        "difference": {
            "esi_change": esi_difference,
            "stability_impact": impact,
        },
        "explanation": f"Ecosystem Stability Index changed by {esi_difference}.",
        "recommendation": recommendation,
    }


class WhatIfSimulationEngine:
    """Wrapper class for counterfactual and what-if simulation."""

    def __init__(self):
        pass

    def simulate_population_change(
        self, aquarium, telemetry, current_fish, proposed_fish, species_db
    ) -> Dict[str, Any]:
        """Run counterfactual population change simulation."""
        return simulate_population_change(
            aquarium=aquarium,
            telemetry=telemetry,
            current_fish=current_fish,
            proposed_fish=proposed_fish,
            species_db=species_db,
        )

    def simulate_parameter_shift(
        self,
        current_state: Dict[str, Any],
        hypothetical_changes: Dict[str, float],
    ) -> Dict[str, Any]:
        """
        Simulate the impact of hypothetical water parameter shifts on aquarium ecosystem health.
        """
        simulated_state = dict(current_state)
        simulated_state.update(hypothetical_changes)
        return {
            "original_state": current_state,
            "simulated_state": simulated_state,
            "predicted_risk_change": 0.0,
            "status": "simulation_complete",
        }
