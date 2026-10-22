from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
from backend.app.services.database import db_manager, calculate_bioload

router = APIRouter(prefix="/api/tank", tags=["Tank Database Management"])


class TankConfigResponse(BaseModel):
    tank_id: int = Field(5, description="Unique tank identifier")
    tank_name: str = Field("Albino Red Cover - Tank #5", description="Display name of the aquatic tank")
    volume_liters: float = Field(120.0, description="Total water volume in liters")
    fish_types: List[str] = Field(["Guppy", "Swordtail", "Betta"], description="List of fish species currently in the tank")
    fish_count: int = Field(8, description="Total fish population count")
    bioload_level: str = Field("OPTIMAL", description="Bioload density status: OPTIMAL, MODERATE, or OVERSTOCKED")
    liters_per_fish: float = Field(15.0, description="Calculated water volume per fish (L/fish)")
    bioload_desc: Optional[str] = Field(None, description="Detailed biological explanation of current density")
    updated_at: str = Field(..., description="ISO 8601 UTC timestamp of last update")
    db_engine: str = Field("sqlite", description="Active database engine: 'mongodb' or 'sqlite'")


class TankConfigUpdateInput(BaseModel):
    tank_id: int = Field(5, description="Tank ID to update")
    tank_name: Optional[str] = Field("Albino Red Cover - Tank #5", description="Display name of tank")
    volume_liters: float = Field(..., ge=10.0, le=5000.0, description="Water volume between 10L and 5000L")
    fish_types: List[str] = Field(..., min_length=1, description="Selected fish species in the tank")
    fish_count: int = Field(..., ge=1, le=500, description="Fish count between 1 and 500")


@router.get("/config", response_model=TankConfigResponse, summary="Get Tank Configuration & Population")
async def get_tank_config(tank_id: int = 5):
    """
    Retrieves the persistent tank volume, fish types, fish count, and stocking density
    from the database (MongoDB or local SQLite).
    """
    config = await db_manager.get_tank_config(tank_id=tank_id)
    bioload = calculate_bioload(config["volume_liters"], config["fish_count"])
    return {
        **config,
        "bioload_level": bioload["bioload_level"],
        "liters_per_fish": bioload["liters_per_fish"],
        "bioload_desc": bioload["bioload_desc"]
    }


@router.post("/config", response_model=TankConfigResponse, summary="Update Tank Configuration & Population")
async def update_tank_config(payload: TankConfigUpdateInput):
    """
    Updates the tank volume, species, and population in the database.
    Recalculates biological stocking density and persists to storage.
    """
    try:
        saved = await db_manager.save_tank_config(
            tank_id=payload.tank_id,
            tank_name=payload.tank_name or "Albino Red Cover - Tank #5",
            volume_liters=payload.volume_liters,
            fish_types=payload.fish_types,
            fish_count=payload.fish_count
        )
        return saved
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )
