"""
Simulation API routes for running what-if counterfactual scenarios.
Phase 9 & Phase 10: What-If Simulation API Endpoint with Firebase Synchronization.
"""

import os
import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from app.simulation.what_if_engine import simulate_population_change
from app.models.aquarium import Aquarium
from app.models.telemetry import Telemetry
from app.models.species import FishBehavior
from app.database.firebase_client import save_simulation_result

router = APIRouter()


def _dump(obj):
    """Uniform model dump supporting Pydantic v2 and v1."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "dict"):
        return obj.dict()
    return dict(obj)


class SimulationRequest(BaseModel):
    aquarium: Aquarium
    telemetry: Telemetry
    current_population: List[FishBehavior]
    proposed_population: List[FishBehavior]


def load_species_db():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    target_path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(target_path):
        target_path = os.path.join(base_dir, "app", "data", "species_seed.json")
    with open(target_path, "r") as f:
        return {s["species_id"]: s for s in json.load(f)}


@router.post("/simulate")
@router.post("/simulations/what-if")
def simulate_change(request: SimulationRequest):
    """What-If simulation endpoint."""
    species_db = load_species_db()

    result = simulate_population_change(
        _dump(request.aquarium),
        _dump(request.telemetry),
        [_dump(f) for f in request.current_population],
        [_dump(f) for f in request.proposed_population],
        species_db,
    )

    # Sync simulation result with Firebase
    try:
        save_simulation_result("aquarium_001", result)
    except Exception as e:
        print(f"Failed to push simulation to Firebase: {e}")

    return {
        "before": {"esi": result.get("esi_before")},
        "after": {"esi": result.get("esi_after")},
        "difference": result.get("difference", {}),
        "recommendation": result.get("recommendation", ""),
        "explanation": result.get("explanation", ""),
    }
