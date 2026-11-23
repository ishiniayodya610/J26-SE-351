"""
AquaGuard — Tanks domain: business logic service.
All tank CRUD operations, scoped by owner_id for multi-tenancy.
"""
import logging
from datetime import datetime, timezone
from typing import List

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from backend.app.domains.tanks.schemas import BioloadInfo, TankCreate, TankOut, TankUpdate
except ImportError:
    from app.domains.tanks.schemas import BioloadInfo, TankCreate, TankOut, TankUpdate

logger = logging.getLogger("AquaGuard.Tanks")


def _calc_bioload(volume: float, count: int) -> BioloadInfo:
    lpf = round(volume / max(count, 1), 1)
    if lpf >= 15.0:
        return BioloadInfo(liters_per_fish=lpf, level="OPTIMAL",
                           description="Safe biomass. Biological filtration has ample capacity.")
    elif lpf >= 8.0:
        return BioloadInfo(liters_per_fish=lpf, level="MODERATE",
                           description="Moderate stocking density. Monitor ammonia oxidation rates.")
    else:
        return BioloadInfo(liters_per_fish=lpf, level="OVERSTOCKED",
                           description="High bioload! Rapid ammonia buildup likely during feeding.")


def _fmt(doc: dict) -> TankOut:
    bioload = _calc_bioload(doc["volume_liters"], doc["fish_count"])
    dims = doc.get("dimensions")
    return TankOut(
        id=str(doc["_id"]),
        owner_id=str(doc["owner_id"]),
        name=doc["name"],
        dimensions=dims,
        volume_liters=doc["volume_liters"],
        fish_types=doc["fish_types"],
        fish_count=doc["fish_count"],
        tank_type=doc.get("tank_type", "HOME"),
        target_temp_c=doc.get("target_temp_c", 27.0),
        target_ph=doc.get("target_ph", 7.0),
        target_tds_ppm=doc.get("target_tds_ppm", 150),
        bioload=bioload,
        device_id=str(doc["device_id"]) if doc.get("device_id") else None,
        created_at=doc.get("created_at", ""),
    )


async def create_tank(req: TankCreate, owner_id: str, db: AsyncIOMotorDatabase) -> TankOut:
    doc = {
        "owner_id": ObjectId(owner_id),
        "name": req.name,
        "dimensions": req.dimensions.model_dump() if req.dimensions else None,
        "volume_liters": req.volume_liters,
        "fish_types": req.fish_types,
        "fish_count": req.fish_count,
        "tank_type": req.tank_type,
        "target_temp_c": req.target_temp_c,
        "target_ph": req.target_ph,
        "target_tds_ppm": req.target_tds_ppm,
        "device_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.tanks.insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("Tank created: %s (owner=%s)", req.name, owner_id)
    return _fmt(doc)


async def list_tanks(owner_id: str, db: AsyncIOMotorDatabase) -> List[TankOut]:
    cursor = db.tanks.find({"owner_id": ObjectId(owner_id)}).sort("created_at", -1)
    return [_fmt(d) async for d in cursor]


async def get_tank(tank_id: str, owner_id: str, db: AsyncIOMotorDatabase) -> TankOut:
    doc = await db.tanks.find_one({"_id": ObjectId(tank_id), "owner_id": ObjectId(owner_id)})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tank not found.")
    return _fmt(doc)


async def update_tank(
    tank_id: str, req: TankUpdate, owner_id: str, db: AsyncIOMotorDatabase
) -> TankOut:
    update = req.model_dump(exclude_none=True)
    if "dimensions" in update and update["dimensions"]:
        update["dimensions"] = req.dimensions.model_dump()
    if not update:
        return await get_tank(tank_id, owner_id, db)

    result = await db.tanks.update_one(
        {"_id": ObjectId(tank_id), "owner_id": ObjectId(owner_id)},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tank not found.")
    return await get_tank(tank_id, owner_id, db)


async def delete_tank(tank_id: str, owner_id: str, db: AsyncIOMotorDatabase) -> None:
    result = await db.tanks.delete_one(
        {"_id": ObjectId(tank_id), "owner_id": ObjectId(owner_id)}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tank not found.")
    logger.info("Tank deleted: id=%s", tank_id)
