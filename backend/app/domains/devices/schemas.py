"""
AquaGuard — Devices domain: Pydantic schemas.
Covers provisioning token generation and device claim flow.
"""
from typing import Literal
from pydantic import BaseModel, Field


class ProvisionRequest(BaseModel):
    """Body: mobile app → backend. User links a tank to a new device."""
    tank_id: str = Field(..., description="The MongoDB ObjectId of the tank to link.")


class ProvisionResponse(BaseModel):
    """Response: backend → mobile app. Contains the QR data to show on the ESP32."""
    provision_token: str
    device_uid_prefix: str = Field(..., description="Expected device UID prefix for display.")
    expires_in_seconds: int = 900
    # This JSON string is what gets encoded into the QR code on the ESP32 display
    # or shown as a text token to type into the provisioning AP web page.
    qr_payload: str


class ClaimRequest(BaseModel):
    """Body: ESP32 device → backend (HTTP POST after connecting to WiFi).
    No auth header — device uses the one-time provision_token as proof.
    """
    device_uid: str = Field(..., description="Hardware UID burned into NVS at flash time.")
    provision_token: str


class ClaimResponse(BaseModel):
    """
    Response: backend → ESP32 device.
    Contains everything the device needs to connect to MQTT permanently.
    """
    tank_id: str
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str
    mqtt_password: str
    target_temp_c: float
    target_ph: float
    target_tds_ppm: int


class BindDeviceRequest(BaseModel):
    """Body: mobile app → backend. Manually binds a device UID to a tank."""
    tank_id: str = Field(..., description="The tank to pair the device to.")
    device_uid: str = Field(..., min_length=3, max_length=64, description="Device UID (e.g. AG-ESP32-DEV01 or simulator ID)")


class DeviceOut(BaseModel):
    id: str
    device_uid: str
    tank_id: str | None
    owner_id: str | None
    status: Literal["UNCLAIMED", "ACTIVE", "OFFLINE"]
    firmware_version: str
    last_seen: str | None
