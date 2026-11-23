"""
AquaGuard — Tanks domain: Pydantic schemas.
"""
from typing import List, Literal
from pydantic import BaseModel, Field


class TankDimensions(BaseModel):
    length_cm: float = Field(..., gt=0, examples=[90])
    width_cm: float = Field(..., gt=0, examples=[45])
    height_cm: float = Field(..., gt=0, examples=[50])


class TankCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, examples=["Living Room Guppy Tank"])
    dimensions: TankDimensions | None = None
    volume_liters: float = Field(..., gt=0, examples=[120.0])
    fish_types: List[str] = Field(..., min_length=1, examples=[["Guppy", "Swordtail"]])
    fish_count: int = Field(..., ge=1, examples=[15])
    tank_type: Literal["HOME", "FARMING"] = Field("HOME", examples=["HOME"])
    # Target water parameters (optional at creation; device can get defaults)
    target_temp_c: float = Field(27.0, ge=10.0, le=40.0)
    target_ph: float = Field(7.0, ge=0.0, le=14.0)
    target_tds_ppm: int = Field(150, ge=0, le=5000)


class TankUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    dimensions: TankDimensions | None = None
    volume_liters: float | None = Field(None, gt=0)
    fish_types: List[str] | None = None
    fish_count: int | None = Field(None, ge=1)
    tank_type: Literal["HOME", "FARMING"] | None = None
    target_temp_c: float | None = Field(None, ge=10.0, le=40.0)
    target_ph: float | None = Field(None, ge=0.0, le=14.0)
    target_tds_ppm: int | None = Field(None, ge=0, le=5000)


class BioloadInfo(BaseModel):
    liters_per_fish: float
    level: Literal["OPTIMAL", "MODERATE", "OVERSTOCKED"]
    description: str


class TankOut(BaseModel):
    id: str
    owner_id: str
    name: str
    dimensions: TankDimensions | None
    volume_liters: float
    fish_types: List[str]
    fish_count: int
    tank_type: str
    target_temp_c: float
    target_ph: float
    target_tds_ppm: int
    bioload: BioloadInfo
    device_id: str | None
    created_at: str
