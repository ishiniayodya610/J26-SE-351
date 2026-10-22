"""
Decision API routes for evaluating telemetry, compatibility, and running reasoning pipeline.
Phase 9 & Phase 10: Decision Evaluation API Endpoint with Firebase Synchronization.
"""

import os
import json
from fastapi import APIRouter
from app.models.decision import EvaluationRequest
from app.csp.csp_engine import evaluate_hard_constraints
from app.fuzzy.fuzzy_engine import calculate_esi
from app.optimizer.optimizer import optimize_population
from app.xai.explanation import generate_csp_explanation
from app.database.firebase_client import save_decision_result

router = APIRouter()


def _dump(obj):
    """Uniform model dump supporting Pydantic v2 and v1."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return dict(obj)


def load_species_db():
    """Helper to load the Phase 2 JSON database."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    target_path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(target_path):
        target_path = os.path.join(base_dir, "app", "data", "species_seed.json")
    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        return {s["species_id"]: s for s in species_list}


@router.post("/evaluate")
@router.post("/decisions/evaluate")
def evaluate_aquarium(request: EvaluationRequest):
    """Main decision endpoint for system-wide evaluation."""
    species_db = load_species_db()
    aquarium_data = _dump(request.aquarium)
    telemetry_data = _dump(request.telemetry)
    fish_list = [_dump(f) for f in request.fish]

    # Evaluate Constraints & ESI
    csp_result = evaluate_hard_constraints(aquarium_data, telemetry_data, fish_list, species_db)

    if csp_result.get("status") == "REJECTED":
        xai_res = generate_csp_explanation(csp_result)
        final_decision = {
            "status": "REJECTED",
            "esi": 0.0,
            "risk_level": "HIGH",
            "population": fish_list,
            "xai": [xai_res],
            "violations": [csp_result],
        }
    else:
        esi_result = calculate_esi(telemetry_data, fish_list, species_db)
        optimized_pop = optimize_population(fish_list, aquarium_data, telemetry_data, species_db)
        final_decision = {
            "status": "APPROVED",
            "esi": esi_result.get("esi_score", 0.0),
            "risk_level": "LOW" if esi_result.get("esi_score", 0) > 0.65 else "MODERATE",
            "population": optimized_pop,
            "xai": [{"summary": "Configuration approved.", "reason": "All constraints met."}],
            "violations": [],
        }

    # Push the result to Firebase so React Native can listen to it
    # Using a static aquarium_001 for now, but in production extract this from the request payload
    try:
        save_decision_result("aquarium_001", final_decision)
    except Exception as e:
        print(f"Failed to push to Firebase: {e}")

    return final_decision
