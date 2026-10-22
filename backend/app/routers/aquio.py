from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from backend.app.services.aquio_bridge import aquio_bridge

router = APIRouter(prefix="/api/aquio", tags=["Remote ESP32 Aquio Bridge"])

class AquioConfigPayload(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    tank_id: Optional[int] = None
    poll_interval_sec: Optional[float] = None
    enabled: Optional[bool] = None

@router.get("/status")
async def get_bridge_status():
    """
    Returns the real-time operational status of the remote Aquio ESP32 bridge.
    Shows connection state, authentication status, and the latest physical sensor values.
    """
    return aquio_bridge.get_status()

@router.post("/sync-now")
async def trigger_manual_sync():
    """
    Triggers an immediate one-off fetch from the remote Aquio ESP32 backend.
    Takes the raw readings and immediately passes them into our local TinyML Gatekeeper model.
    """
    res = await aquio_bridge.sync_once()
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Sync failed"))
    return res

@router.post("/configure")
async def update_bridge_configuration(payload: AquioConfigPayload):
    """
    Allows dynamically configuring or updating the Aquio credentials, tank ID, or enabling the bridge
    without needing to manually restart the backend.
    """
    if payload.email is not None:
        aquio_bridge.email = payload.email
    if payload.password is not None:
        aquio_bridge.password = payload.password
    if payload.tank_id is not None:
        aquio_bridge.tank_id = payload.tank_id
    if payload.poll_interval_sec is not None:
        aquio_bridge.poll_interval = payload.poll_interval_sec
    if payload.enabled is not None:
        aquio_bridge.enabled = payload.enabled
        if payload.enabled:
            aquio_bridge.start()
        else:
            aquio_bridge.stop()

    return {
        "status": "UPDATED",
        "configuration": aquio_bridge.get_status()
    }
