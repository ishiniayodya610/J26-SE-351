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
    "discus": FishProfile(
        species_id="discus",
        common_name="Discus",
        scientific_name="Symphysodon aequifasciatus",
        water_requirements=TargetWaterParameters(
            temperature_c=29.0,
            ph=6.5,
            tds_ppm=150.0,
            temp_tolerance=[28.0, 31.0],
            ph_tolerance=[6.0, 7.0],
            tds_tolerance=[80.0, 200.0]
        ),
        behavior_baseline="Graceful schooling, mid-water column swimmer",
        vulnerability_notes="Highly sensitive to pH drops and ammonia; prone to skin flukes and whitespot under thermal shock."
    ),
    "koi": FishProfile(
        species_id="koi",
        common_name="Koi Carp",
        scientific_name="Cyprinus rubrofuscus",
        water_requirements=TargetWaterParameters(
            temperature_c=22.0,
            ph=7.5,
            tds_ppm=350.0,
            temp_tolerance=[18.0, 26.0],
            ph_tolerance=[7.0, 8.0],
            tds_tolerance=[200.0, 500.0]
        ),
        behavior_baseline="Active surface and substrate foraging",
        vulnerability_notes="Tolerant to wider temperature ranges, but vulnerable to ammonia spikes during heavy feeding."
    ),
    "cichlid": FishProfile(
        species_id="cichlid",
        common_name="African Cichlid",
        scientific_name="Pseudotropheus sp.",
        water_requirements=TargetWaterParameters(
            temperature_c=26.0,
            ph=8.2,
            tds_ppm=480.0,
            temp_tolerance=[24.0, 28.0],
            ph_tolerance=[7.8, 8.6],
            tds_tolerance=[350.0, 600.0]
        ),
        behavior_baseline="Territorial rock-dwelling, rapid darting",
        vulnerability_notes="Requires hard alkaline water; acidic pH leads to severe acidosis and lethargy."
    ),
    "goldfish": FishProfile(
        species_id="goldfish",
        common_name="Fancy Goldfish",
        scientific_name="Carassius auratus",
        water_requirements=TargetWaterParameters(
            temperature_c=21.0,
            ph=7.2,
            tds_ppm=280.0,
            temp_tolerance=[18.0, 24.0],
            ph_tolerance=[6.8, 7.8],
            tds_tolerance=[150.0, 400.0]
        ),
        behavior_baseline="Slow, continuous cruising across all depths",
        vulnerability_notes="High biological load generator; rapid ammonia producer."
    ),
    "betta": FishProfile(
        species_id="betta",
        common_name="Betta",
        scientific_name="Betta splendens",
        water_requirements=TargetWaterParameters(
            temperature_c=26.5,
            ph=6.8,
            tds_ppm=180.0,
            temp_tolerance=[24.0, 29.0],
            ph_tolerance=[6.5, 7.5],
            tds_tolerance=[100.0, 300.0]
        ),
        behavior_baseline="Labyrinth breathing, mid-water gliding with resting intervals",
        vulnerability_notes="Highly vulnerable to fin rot, swim bladder disease (SBD), and cold water lethargy."
    ),
    "guppy": FishProfile(
        species_id="guppy",
        common_name="Guppy",
        scientific_name="Poecilia reticulata",
        water_requirements=TargetWaterParameters(
            temperature_c=25.0,
            ph=7.4,
            tds_ppm=250.0,
            temp_tolerance=[22.0, 28.0],
            ph_tolerance=[7.0, 8.2],
            tds_tolerance=[150.0, 400.0]
        ),
        behavior_baseline="Continuous surface and mid-water schooling activity",
        vulnerability_notes="Rapidly indicates low oxygen or nitrite spikes via surface piping."
    ),
    "swordtail": FishProfile(
        species_id="swordtail",
        common_name="Swordtail",
        scientific_name="Xiphophorus helleri",
        water_requirements=TargetWaterParameters(
            temperature_c=24.5,
            ph=7.5,
            tds_ppm=300.0,
            temp_tolerance=[21.0, 27.0],
            ph_tolerance=[7.0, 8.2],
            tds_tolerance=[200.0, 450.0]
        ),
        behavior_baseline="Vigorous linear cruising across all tank strata",
        vulnerability_notes="Requires hard alkaline water; prone to velvet and fungal infections under temperature drops."
    )
}

# Current Active Tank Profile (Defaults to Discus)
active_profile: FishProfile = SPECIES_DATABASE["discus"]

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
