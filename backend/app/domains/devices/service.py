"""
AquaGuard — Devices domain: business logic service.
Handles provision token generation and the device claim flow.
"""
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from backend.app.core.config import settings
    from backend.app.domains.devices.schemas import (
        BindDeviceRequest,
        ClaimRequest,
        ClaimResponse,
        DeviceOut,
        ProvisionRequest,
        ProvisionResponse,
    )
except ImportError:
    from app.core.config import settings
    from app.domains.devices.schemas import (
        BindDeviceRequest,
        ClaimRequest,
        ClaimResponse,
        DeviceOut,
        ProvisionRequest,
        ProvisionResponse,
    )

logger = logging.getLogger("AquaGuard.Devices")

_TOKEN_TTL_SECONDS = 900  # 15 minutes


async def generate_provision_token(
    req: ProvisionRequest,
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> ProvisionResponse:
    """
    Mobile app calls this after user selects which tank to link.
    Returns a short-lived provision token and a QR payload string.
    """
    # Verify the tank belongs to this user
    tank = await db.tanks.find_one(
        {"_id": ObjectId(req.tank_id), "owner_id": ObjectId(owner_id)}
    )
    if not tank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tank not found.")

    if tank.get("device_id"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tank already has a device paired. Remove the existing device first.",
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_TOKEN_TTL_SECONDS)

    # Store the pending provision record
    await db.device_provisions.update_one(
        {"tank_id": ObjectId(req.tank_id)},
        {
            "$set": {
                "tank_id": ObjectId(req.tank_id),
                "owner_id": ObjectId(owner_id),
                "token": token,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    # QR payload — this is what gets encoded into the QR code shown by the ESP32
    # or entered into the provisioning AP web form
    qr_data = json.dumps({
        "server": f"https://{settings.MQTT_HOST}",
        "token": token,
        "tank_id": req.tank_id,
    })

    logger.info("Provision token generated for tank %s by user %s", req.tank_id, owner_id)
    return ProvisionResponse(
        provision_token=token,
        device_uid_prefix="AG-ESP32-",
        expires_in_seconds=_TOKEN_TTL_SECONDS,
        qr_payload=qr_data,
    )


async def claim_device(req: ClaimRequest, db: AsyncIOMotorDatabase) -> ClaimResponse:
    """
    ESP32 calls this (no auth) after connecting to home WiFi.
    Validates the one-time token, registers the device, links it to the tank.
    """
    not_found = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired provision token.",
    )

    # Look up the pending provision
    provision = await db.device_provisions.find_one({"token": req.provision_token})
    if not provision:
        raise not_found

    # Check expiry
    expires_at = datetime.fromisoformat(provision["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        await db.device_provisions.delete_one({"token": req.provision_token})
        raise not_found

    tank_id = provision["tank_id"]
    owner_id = provision["owner_id"]

    # Fetch tank to get target params
    tank = await db.tanks.find_one({"_id": tank_id})
    if not tank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tank no longer exists.")

    # Create or update device record
    mqtt_user = f"device_{req.device_uid.replace('-', '_').lower()}"
    mqtt_pass = secrets.token_urlsafe(24)

    device_doc = {
        "device_uid": req.device_uid,
        "tank_id": tank_id,
        "owner_id": owner_id,
        "status": "ACTIVE",
        "firmware_version": "1.0.0",
        "mqtt_username": mqtt_user,
        "mqtt_password": mqtt_pass,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }

    result = await db.devices.update_one(
        {"device_uid": req.device_uid},
        {"$set": device_doc},
        upsert=True,
    )
    device_id = result.upserted_id or (
        await db.devices.find_one({"device_uid": req.device_uid})
    )["_id"]

    # Link device to tank
    await db.tanks.update_one(
        {"_id": tank_id},
        {"$set": {"device_id": device_id}},
    )

    # Burn the one-time token
    await db.device_provisions.delete_one({"token": req.provision_token})

    logger.info(
        "Device %s claimed and linked to tank %s (owner %s)",
        req.device_uid, str(tank_id), str(owner_id),
    )

    return ClaimResponse(
        tank_id=str(tank_id),
        mqtt_host=settings.MQTT_HOST,
        mqtt_port=settings.MQTT_TLS_PORT if settings.MQTT_USE_TLS else settings.MQTT_PORT,
        mqtt_username=mqtt_user,
        mqtt_password=mqtt_pass,
        target_temp_c=tank.get("target_temp_c", 27.0),
        target_ph=tank.get("target_ph", 7.0),
        target_tds_ppm=tank.get("target_tds_ppm", 150),
    )


async def get_device_by_tank(
    tank_id: str, owner_id: str, db: AsyncIOMotorDatabase
) -> DeviceOut:
    tank = await db.tanks.find_one(
        {"_id": ObjectId(tank_id), "owner_id": ObjectId(owner_id)}
    )
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found.")

    device = await db.devices.find_one({"tank_id": ObjectId(tank_id)})
    if not device:
        raise HTTPException(status_code=404, detail="No device paired to this tank.")

    return DeviceOut(
        id=str(device["_id"]),
        device_uid=device["device_uid"],
        tank_id=str(device.get("tank_id", "")),
        owner_id=str(device.get("owner_id", "")),
        status=device.get("status", "UNCLAIMED"),
        firmware_version=device.get("firmware_version", "unknown"),
        last_seen=device.get("last_seen"),
    )


async def bind_device_manually(
    req: BindDeviceRequest, owner_id: str, db: AsyncIOMotorDatabase
) -> DeviceOut:
    """
    Manually bind a device UID to a user's tank.
    Enables instant testing without waiting for physical hardware provisioning.
    """
    # 1. Verify tank belongs to this user
    tank = await db.tanks.find_one(
        {"_id": ObjectId(req.tank_id), "owner_id": ObjectId(owner_id)}
    )
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found or not owned by you.")

    clean_uid = req.device_uid.strip().upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 2. Upsert device
    device_doc = {
        "device_uid": clean_uid,
        "tank_id": ObjectId(req.tank_id),
        "owner_id": ObjectId(owner_id),
        "status": "ACTIVE",
        "firmware_version": "2.0.0-tinyml",
        "last_seen": now_iso,
        "registered_at": now_iso,
    }

    await db.devices.update_one(
        {"device_uid": clean_uid},
        {"$set": device_doc},
        upsert=True,
    )
    device = await db.devices.find_one({"device_uid": clean_uid})
    device_id = device["_id"]

    # 3. Update tank with device_id
    await db.tanks.update_one(
        {"_id": ObjectId(req.tank_id)},
        {"$set": {"device_id": device_id}},
    )

    logger.info("Device %s manually bound to tank %s by user %s", clean_uid, req.tank_id, owner_id)

    return DeviceOut(
        id=str(device["_id"]),
        device_uid=device["device_uid"],
        tank_id=str(device["tank_id"]),
        owner_id=str(device["owner_id"]),
        status=device["status"],
        firmware_version=device["firmware_version"],
        last_seen=device.get("last_seen"),
    )
