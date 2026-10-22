from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional

router = APIRouter(prefix="/api/fish", tags=["Fish Profiles"])

class TargetWaterParameters(BaseModel):
    temperature_c: float
    ph: float
    tds_ppm: float
    temp_tolerance: List[float]  # [min, max]
    ph_tolerance: List[float]    # [min, max]
    tds_tolerance: List[float]   # [min, max]

class FishProfile(BaseModel):
    species_id: str
    common_name: str
    scientific_name: str
    water_requirements: TargetWaterParameters
    behavior_baseline: str
    vulnerability_notes: str

# Master Database of Supported Species
SPECIES_DATABASE: Dict[str, FishProfile] = {
    "guppy": FishProfile(
        species_id="guppy",
        common_name="Guppy",
        scientific_name="Poecilia reticulata",
        water_requirements=TargetWaterParameters(
            temperature_c=26.0,
            ph=7.0,
            tds_ppm=300.0,
            temp_tolerance=[22.0, 28.0],
            ph_tolerance=[6.8, 7.8],
            tds_tolerance=[200.0, 500.0]
        ),
        behavior_baseline="Active surface swimmer, schooling in groups",
        vulnerability_notes="Sensitive to ammonia spikes and rapid temperature changes; prone to fin rot and Ich in poor water conditions."
    ),
    "swordtail": FishProfile(
        species_id="swordtail",
        common_name="Swordtail",
        scientific_name="Xiphophorus hellerii",
        water_requirements=TargetWaterParameters(
            temperature_c=25.0,
            ph=7.2,
            tds_ppm=350.0,
            temp_tolerance=[22.0, 28.0],
            ph_tolerance=[7.0, 8.0],
            tds_tolerance=[250.0, 500.0]
        ),
        behavior_baseline="Active mid-water swimmer, semi-aggressive",
        vulnerability_notes="Tolerant species but vulnerable to Ich during sudden temperature drops; males can show territorial stress."
    ),
    "betta": FishProfile(
        species_id="betta",
        common_name="Betta",
        scientific_name="Betta splendens",
        water_requirements=TargetWaterParameters(
            temperature_c=27.0,
            ph=7.0,
            tds_ppm=150.0,
            temp_tolerance=[24.0, 30.0],
            ph_tolerance=[6.5, 7.5],
            tds_tolerance=[50.0, 300.0]
        ),
        behavior_baseline="Slow surface dweller, labyrinth breather",
        vulnerability_notes="Highly sensitive to ammonia and nitrite; prone to fin rot, velvet disease, and Ich in cold or dirty water."
    )
}

# Current Active Tank Profile (Defaults to Guppy)
active_profile: FishProfile = SPECIES_DATABASE["guppy"]

@router.get("/profiles", response_model=List[FishProfile])
async def list_profiles():
    return list(SPECIES_DATABASE.values())

@router.get("/active", response_model=FishProfile)
async def get_active_profile():
    return active_profile

@router.post("/set-active/{species_id}", response_model=FishProfile)
async def set_active_profile(species_id: str):
    global active_profile
    key = species_id.lower().strip()
    if key not in SPECIES_DATABASE:
        raise HTTPException(status_code=404, detail=f"Species '{species_id}' not found in database.")
    active_profile = SPECIES_DATABASE[key]
    return active_profile
