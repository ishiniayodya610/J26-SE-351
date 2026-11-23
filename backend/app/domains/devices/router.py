"""
AquaGuard — Devices domain: HTTP router.
"""
from fastapi import APIRouter, Depends, status

try:
    from backend.app.core.dependencies import get_current_user
    from backend.app.db.mongo import get_db
    from backend.app.domains.devices.schemas import (
        BindDeviceRequest,
        ClaimRequest,
        ClaimResponse,
        DeviceOut,
        ProvisionRequest,
        ProvisionResponse,
    )
    from backend.app.domains.devices import service
except ImportError:
    from app.core.dependencies import get_current_user
    from app.db.mongo import get_db
    from app.domains.devices.schemas import (
        BindDeviceRequest,
        ClaimRequest,
        ClaimResponse,
        DeviceOut,
        ProvisionRequest,
        ProvisionResponse,
    )
    from app.domains.devices import service

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.post(
    "/provision",
    response_model=ProvisionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a one-time provision token to pair a new ESP32 device to a tank",
)
async def provision(req: ProvisionRequest, current_user: dict = Depends(get_current_user)):
    """
    Call this from the mobile app when the user taps 'Add New Device'.
    Returns a token + QR payload to send to the ESP32's provisioning AP.
    """
    return await service.generate_provision_token(req, owner_id=current_user["id"], db=get_db())


@router.post(
    "/claim",
    response_model=ClaimResponse,
    summary="[ESP32 only] Register device using a provision token after WiFi connect",
)
async def claim(req: ClaimRequest):
    """
    Called directly by the ESP32 firmware — no Bearer token required.
    The provision_token from NVS is used as the one-time credential.
    Returns MQTT credentials and tank target parameters.
    """
    return await service.claim_device(req, db=get_db())


@router.post(
    "/bind",
    response_model=DeviceOut,
    summary="Manually bind/register a device UID to a tank (testing / simulator / physical unit)",
)
async def bind_manual(req: BindDeviceRequest, current_user: dict = Depends(get_current_user)):
    """
    Allows user to input a Device UID directly to assign a hub to their tank
    without going through the physical QR softAP scanning procedure.
    """
    return await service.bind_device_manually(req, owner_id=current_user["id"], db=get_db())


@router.get(
    "/tank/{tank_id}",
    response_model=DeviceOut,
    summary="Get the device paired to a specific tank",
)
async def get_device(tank_id: str, current_user: dict = Depends(get_current_user)):
    return await service.get_device_by_tank(tank_id, owner_id=current_user["id"], db=get_db())
