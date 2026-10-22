import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime
import httpx
from backend.app.config import (
    AQUIO_ENABLED,
    AQUIO_API_URL,
    AQUIO_EMAIL,
    AQUIO_PASSWORD,
    AQUIO_TANK_ID,
    AQUIO_POLL_INTERVAL_SEC,
)

logger = logging.getLogger("aquaguard.aquio_bridge")

class AquioBridgeService:
    """
    Aquio Remote ESP32 Sensor Bridge Service
    Connects to the external hosted Aquio Backend (Swagger: https://api.aquio.smartaquamarket.com/api/v1/docs#/)
    Authenticates via JWT Bearer Token, polls live physical ESP32 tank sensors,
    and feeds the raw values directly into our local Edge Impulse TinyML Gatekeeper model.
    """

    def __init__(self):
        self.base_url = AQUIO_API_URL
        self.email = AQUIO_EMAIL
        self.password = AQUIO_PASSWORD
        self.tank_id = AQUIO_TANK_ID
        self.poll_interval = AQUIO_POLL_INTERVAL_SEC
        self.enabled = AQUIO_ENABLED

        # State tracking
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        
        self.last_sync_time: Optional[str] = None
        self.last_error: Optional[str] = None
        self.sync_count: int = 0
        self.last_readings: Dict[str, Any] = {}

    def is_configured(self) -> bool:
        """Checks if real credentials have been provided in .env"""
        return bool(self.email and self.password and self.email != "your_email@example.com")

    async def login(self) -> bool:
        """
        Logs into the remote Aquio backend (POST /api/v1/auth/login)
        Extracts and stores the JWT access token for subsequent sensor queries.
        """
        if not self.is_configured():
            self.last_error = "Aquio credentials not configured. Please set AQUIO_EMAIL and AQUIO_PASSWORD in .env"
            return False

        login_url = f"{self.base_url}/auth/login"
        payload = {
            "email": self.email,
            "password": self.password,
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(login_url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    token_data = data.get("data", {})
                    self.access_token = token_data.get("access_token")
                    self.refresh_token = token_data.get("refresh_token")
                    self.last_error = None
                    logger.info("[Aquio Bridge] Successfully authenticated with remote Aquio ESP32 backend!")
                    print(f"\n\033[1;92m✅ [REMOTE ESP32 CLOUD] Connected & Authenticated to Aquio Hub!\033[0m")
                    print(f"   ├── Endpoint: {self.base_url}")
                    print(f"   └── Target Tank: #{self.tank_id} (Polling every {self.poll_interval}s)\n")
                    return True
                else:
                    self.last_error = f"Login failed (HTTP {res.status_code}): {res.text}"
                    logger.warning(f"[Aquio Bridge] {self.last_error}")
                    print(f"\033[1;91m❌ [REMOTE ESP32 CLOUD] Authentication Failed: {self.last_error}\033[0m")
                    return False
        except Exception as e:
            self.last_error = f"Connection error during login: {str(e)}"
            logger.error(f"[Aquio Bridge] {self.last_error}")
            print(f"\033[1;91m❌ [REMOTE ESP32 CLOUD] Connection Error: {str(e)}\033[0m")
            return False

    async def fetch_remote_readings(self) -> Optional[Dict[str, float]]:
        """
        Fetches the latest physical ESP32 sensor values for the configured tank
        from GET /api/v1/tanks/{tank_id}.
        """
        if not self.access_token:
            success = await self.login()
            if not success:
                return None

        tank_url = f"{self.base_url}/tanks/{self.tank_id}"
        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(tank_url, headers=headers)
                
                # If access token expired (401), attempt re-login once
                if res.status_code == 401:
                    logger.info("[Aquio Bridge] Access token expired, re-authenticating...")
                    if await self.login():
                        headers["Authorization"] = f"Bearer {self.access_token}"
                        res = await client.get(tank_url, headers=headers)

                if res.status_code == 200:
                    response_json = res.json()
                    tank_data = response_json.get("data", {})
                    sensors = tank_data.get("sensors", [])

                    temp_val, ph_val, tds_val = None, None, None

                    for sensor in sensors:
                        stype = sensor.get("type", "").lower()
                        # Extract latest reading from the sensor summary
                        reading = sensor.get("latest_reading")
                        if reading is not None:
                            try:
                                reading_float = float(reading)
                                if "temp" in stype:
                                    temp_val = reading_float
                                elif "ph" in stype:
                                    ph_val = reading_float
                                elif "tds" in stype or "conduct" in stype:
                                    tds_val = reading_float
                            except (ValueError, TypeError):
                                pass

                    if temp_val is not None or ph_val is not None or tds_val is not None:
                        return {
                            "temp": temp_val,
                            "ph": ph_val,
                            "tds": tds_val
                        }
                    else:
                        self.last_error = f"Tank #{self.tank_id} found, but no active sensor readings yet."
                        return None
                else:
                    self.last_error = f"Fetch tank #{self.tank_id} failed (HTTP {res.status_code}): {res.text}"
                    return None
        except Exception as e:
            self.last_error = f"Error querying remote tank #{self.tank_id}: {str(e)}"
            return None

    async def sync_once(self) -> Dict[str, Any]:
        """
        Executes a single fetch cycle: reads from Aquio and pushes into our Edge TinyML engine.
        """
        readings = await self.fetch_remote_readings()
        if not readings:
            return {
                "success": False,
                "error": self.last_error or "No data received from remote sensors",
                "timestamp": datetime.now().isoformat()
            }

        temp = readings.get("temp") if readings.get("temp") is not None else 28.5
        ph = readings.get("ph") if readings.get("ph") is not None else 6.8
        tds = readings.get("tds") if readings.get("tds") is not None else 150.0

        # Feed directly into OUR local Edge Impulse TinyML engine & Gatekeeper!
        from backend.app.routers.telemetry import execute_edge_inference, manager
        try:
            inference_result = await execute_edge_inference(
                temp, 
                ph, 
                tds, 
                source="REMOTE_ESP32", 
                device_label=f"Live Remote ESP32 (Tank #{self.tank_id})"
            )
            await manager.broadcast(inference_result)

            self.sync_count += 1
            self.last_sync_time = datetime.now().isoformat()
            self.last_readings = {"temp": temp, "ph": ph, "tds": tds}
            self.last_error = None

            # Prominent backend terminal log
            temp_src = "Physical" if readings.get("temp") is not None else "Soft-Sensor"
            ph_src = "Physical" if readings.get("ph") is not None else "Soft-Sensor"
            tds_src = "Physical" if readings.get("tds") is not None else "Soft-Sensor"
            print(
                f"\033[1;96m📡 [REMOTE SENSORS -> TINYML #{self.sync_count}]\033[0m "
                f"Tank #{self.tank_id} | "
                f"\033[93mTemp: {temp:.1f}°C ({temp_src})\033[0m | "
                f"\033[92mpH: {ph:.2f} ({ph_src})\033[0m | "
                f"\033[94mTDS: {tds:.0f} ppm ({tds_src})\033[0m -> "
                f"\033[95mStatus: {inference_result.get('system_status', 'OPTIMAL')}\033[0m"
            )

            return {
                "success": True,
                "readings": self.last_readings,
                "inference": inference_result,
                "sync_count": self.sync_count,
                "timestamp": self.last_sync_time
            }
        except Exception as e:
            self.last_error = f"Failed to execute local TinyML inference: {str(e)}"
            return {"success": False, "error": self.last_error}

    async def _polling_loop(self):
        """Continuous background polling loop."""
        logger.info(f"[Aquio Bridge] Starting continuous sensor ingest (Interval: {self.poll_interval}s)")
        while self.is_running:
            try:
                await self.sync_once()
            except Exception as e:
                logger.error(f"[Aquio Bridge Loop Exception] {e}")
            await asyncio.sleep(self.poll_interval)

    def start(self):
        """Starts background ingestion loop if enabled and configured."""
        if self.is_running:
            return
        if not self.enabled:
            logger.info("[Aquio Bridge] AQUIO_ENABLED=false. Bridge idle (Waiting for user activation in .env).")
            print("\033[93m⏸️  [REMOTE SENSOR BRIDGE] Inactive (Set AQUIO_ENABLED=true in .env to poll physical Tank #5)\033[0m")
            return
        if not self.is_configured():
            logger.info("[Aquio Bridge] AQUIO_ENABLED=true but credentials are placeholders. Please update .env.")
            print("\033[91m⚠️  [REMOTE SENSOR BRIDGE] Credentials missing in .env! Update AQUIO_EMAIL & AQUIO_PASSWORD.\033[0m")
            return

        self.is_running = True
        print(f"\033[1;92m🚀 [REMOTE SENSOR BRIDGE] Starting polling for Tank #{self.tank_id} every {self.poll_interval}s...\033[0m")
        self._task = asyncio.create_task(self._polling_loop())

    def stop(self):
        """Stops background ingestion loop."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("[Aquio Bridge] Remote sensor ingest stopped.")

    def get_status(self) -> Dict[str, Any]:
        """Returns the current operational status of the bridge."""
        return {
            "bridge_enabled": self.enabled,
            "is_configured": self.is_configured(),
            "target_api_url": self.base_url,
            "target_tank_id": self.tank_id,
            "poll_interval_sec": self.poll_interval,
            "authenticated": bool(self.access_token),
            "is_polling_active": self.is_running,
            "sync_count": self.sync_count,
            "last_sync_time": self.last_sync_time,
            "last_readings": self.last_readings,
            "last_error": self.last_error,
        }

# Global singleton instance
aquio_bridge = AquioBridgeService()
