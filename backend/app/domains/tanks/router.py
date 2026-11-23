"""
AquaGuard — Tanks domain: HTTP router.
All endpoints require authentication (Bearer token).
"""
from typing import List

from fastapi import APIRouter, Depends, status

try:
    from backend.app.core.dependencies import get_current_user
    from backend.app.db.mongo import get_db
    from backend.app.domains.tanks.schemas import TankCreate, TankOut, TankUpdate
    from backend.app.domains.tanks import service
except ImportError:
    from app.core.dependencies import get_current_user
    from app.db.mongo import get_db
    from app.domains.tanks.schemas import TankCreate, TankOut, TankUpdate
    from app.domains.tanks import service

router = APIRouter(prefix="/tanks", tags=["Tanks"])


@router.post(
    "",
    response_model=TankOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new fish tank",
)
async def create_tank(req: TankCreate, current_user: dict = Depends(get_current_user)):
    return await service.create_tank(req, owner_id=current_user["id"], db=get_db())


@router.get(
    "",
    response_model=List[TankOut],
    summary="List all tanks owned by the current user",
)
async def list_tanks(current_user: dict = Depends(get_current_user)):
    return await service.list_tanks(owner_id=current_user["id"], db=get_db())


@router.get(
    "/{tank_id}",
    response_model=TankOut,
    summary="Get a single tank by ID",
)
async def get_tank(tank_id: str, current_user: dict = Depends(get_current_user)):
    return await service.get_tank(tank_id, owner_id=current_user["id"], db=get_db())


@router.patch(
    "/{tank_id}",
    response_model=TankOut,
    summary="Update tank metadata or target parameters",
)
async def update_tank(
    tank_id: str,
    req: TankUpdate,
    current_user: dict = Depends(get_current_user),
):
    return await service.update_tank(tank_id, req, owner_id=current_user["id"], db=get_db())


@router.delete(
    "/{tank_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a tank",
)
async def delete_tank(tank_id: str, current_user: dict = Depends(get_current_user)):
    await service.delete_tank(tank_id, owner_id=current_user["id"], db=get_db())
