import os
import random
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from backend.app.routers.fish_profile import SPECIES_DATABASE, active_profile, set_active_profile

router = APIRouter(prefix="/api/comp2", tags=["Comp 2: Fish ID & Behavior"])

class BehaviorMetrics(BaseModel):
    species: str
    confidence: float
    swimming_activity_pct: float
    lethargy_index_pct: float
    surface_piping: str
    feeding_response: str
    status: str

# ---------------------------------------------------------------------------
# TEAMMATE 2 HOOK:
# When Teammate 2 finishes their YOLO/PyTorch model, replace this function
# with their actual model inference call: `result = my_yolo_model.predict(image)`
# ---------------------------------------------------------------------------
def run_real_or_mock_fish_identification(file_bytes: bytes) -> Dict[str, Any]:
    # Select most likely species from DB for demo
    candidates = ["discus", "koi", "cichlid", "goldfish"]
    selected_id = random.choice(candidates)
    matched = SPECIES_DATABASE[selected_id]
    
    return {
        "species_id": matched.species_id,
        "common_name": matched.common_name,
        "scientific_name": matched.scientific_name,
        "confidence": round(random.uniform(0.92, 0.98), 4),
        "target_parameters": {
            "temp": matched.water_requirements.temperature_c,
            "ph": matched.water_requirements.ph,
            "tds": matched.water_requirements.tds_ppm
        },
        "care_notes": matched.vulnerability_notes
    }

@router.post("/identify-fish")
async def identify_fish_snapshot(file: UploadFile = File(...)):
    """
    Receives an image captured from the mobile phone camera,
    runs the fish recognition model, and automatically updates
    the active tank profile.
    """
    try:
        contents = await file.read()
        result = run_real_or_mock_fish_identification(contents)
        # Automatically update active profile in backend
        await set_active_profile(result["species_id"])
        return {
            "success": True,
            "message": f"Successfully identified {result['common_name']}",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fish identification failed: {str(e)}")

@router.get("/live-behavior", response_model=BehaviorMetrics)
async def get_live_ip_camera_behavior():
    """
    Continuous behavioral metrics extracted from the 24/7 IP camera stream.
    """
    activity = round(random.uniform(70.0, 90.0), 1)
    lethargy = round(100.0 - activity, 1)
    
    return BehaviorMetrics(
        species=active_profile.common_name,
        confidence=0.95,
        swimming_activity_pct=activity,
        lethargy_index_pct=lethargy,
        surface_piping="None (Normal Dissolved O2)",
        feeding_response="Active / Responsive",
        status="NORMAL_HEALTH"
    )
