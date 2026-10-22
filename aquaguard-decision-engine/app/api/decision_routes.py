"""
Decision API routes with Phase 16 Mode-Aware routing.
Branches logic between 'ornamental' mode (fast path) and 'breeder' mode (Genetic Algorithm).
"""

import os
import json
from fastapi import APIRouter
from app.models.decision import EvaluationRequest
from app.csp.csp_engine import evaluate_hard_constraints
from app.csp.overlap import calculate_environmental_targets
from app.fuzzy.fuzzy_engine import calculate_esi
from app.optimizer.optimizer import optimize_population
from app.xai.explanation import generate_csp_explanation
from app.database.firebase_client import save_decision_result

router = APIRouter()


_SPECIES_DB_CACHE = None

def load_species_db():
    global _SPECIES_DB_CACHE
    if _SPECIES_DB_CACHE is not None:
        return _SPECIES_DB_CACHE

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    target_path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(target_path):
        target_path = os.path.join(base_dir, "app", "data", "species_seed.json")
    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        _SPECIES_DB_CACHE = {s["species_id"]: s for s in species_list}
        return _SPECIES_DB_CACHE


@router.post("/evaluate")
@router.post("/decisions/evaluate")
def evaluate_aquarium(request: EvaluationRequest):
    """Main decision endpoint with Mode-Aware routing."""
    species_db = load_species_db()
    aquarium_data = request.aquarium.model_dump() if hasattr(request.aquarium, "model_dump") else request.aquarium.dict()
    telemetry_data = request.telemetry.model_dump() if hasattr(request.telemetry, "model_dump") else request.telemetry.dict()
    fish_list = [f.model_dump() if hasattr(f, "model_dump") else f.dict() for f in request.fish]
    tank_mode = request.tank_mode.lower() if request.tank_mode else "ornamental"

    # 1. Gatekeeper Check (Applies to ALL modes)
    csp_result = evaluate_hard_constraints(aquarium_data, telemetry_data, fish_list, species_db)

    if csp_result.get("status") == "REJECTED":
        xai_res = generate_csp_explanation(csp_result)
        final_decision = {
            "status": "REJECTED",
            "mode": tank_mode,
            "esi": 0.0,
            "risk_level": "HIGH",
            "population": fish_list,
            "xai": [xai_res],
            "violations": [csp_result],
        }
    else:
        # 2. Base Calculations (Applies to ALL modes)
        esi_result = calculate_esi(telemetry_data, fish_list, species_db)
        overlap_success, esp32_targets, _ = calculate_environmental_targets(fish_list, species_db)

        # 3. Mode-Aware Branching
        if tank_mode == "breeder":
            # Run the heavy Genetic Algorithm for maximum yield & fry bioload margins
            optimized_pop = optimize_population(fish_list, aquarium_data, telemetry_data, species_db)
            xai_summary = "Breeding configuration optimized. Sex ratios and fry bioload margins applied."
        else:
            # Ornamental mode: Skip the GA entirely. Return the current fish list as approved.
            optimized_pop = fish_list
            xai_summary = "Configuration approved. Ecosystem constraints met."

        final_decision = {
            "status": "APPROVED",
            "mode": tank_mode,
            "esi": esi_result.get("esi_score", 0.0),
            "risk_level": "LOW" if esi_result.get("esi_score", 0) > 0.65 else "MODERATE",
            "population": optimized_pop,
            "esp32_targets": esp32_targets if overlap_success else None,
            "xai": [{"summary": xai_summary, "reason": "All constraints met."}],
            "violations": [],
        }

    # Push the result to Firebase for the mobile app
    try:
        save_decision_result("default_user", "aquarium_001", final_decision)
    except Exception as e:
        print(f"Failed to push to Firebase: {e}")

    return final_decision
