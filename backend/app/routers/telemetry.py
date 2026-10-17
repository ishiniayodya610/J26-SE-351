import json
import subprocess
import os
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.app.config import EDGE_NODE_URL, SIMULATOR_BIN_PATH
from backend.app.routers.fish_profile import active_profile

router = APIRouter(prefix="/api/telemetry", tags=["Edge TinyML Telemetry"])

class TelemetryInput(BaseModel):
    temp: float
    ph: float
    tds: float

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Global state of the latest edge inference
latest_telemetry_state: Dict[str, Any] = {
    "system_status": "OPTIMAL",
    "timing_ms": {"dsp": 0, "classification": 1, "anomaly": 0},
    "ml_confidence": {"normal": 0.98, "ph_fault": 0.01, "tds_fault": 0.01, "temp_fault": 0.0},
    "telemetry": {"temperature_c": 29.0, "ph": 6.5, "tds_ppm": 150.0},
    "diagnostics": {
        "temperature": {"fault_detected": False, "imputed": False},
        "ph": {"fault_detected": False, "imputed": False},
        "tds": {"fault_detected": False, "imputed": False}
    },
    "gatekeeper": {"heater_lockout": False, "ph_pump_lockout": False},
    "tank_profile": {
        "species": "Discus",
        "target_temp": 29.0,
        "target_ph": 6.5,
        "target_tds": 150.0
    }
}

async def execute_edge_inference(temp: float, ph: float, tds: float) -> Dict[str, Any]:
    global latest_telemetry_state
    
    # 1. Attempt HTTP call to the standalone Edge IoT device server
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.post(f"{EDGE_NODE_URL}/simulate", json={"temp": temp, "ph": ph, "tds": tds})
            if resp.status_code == 200:
                result = resp.json()
                latest_telemetry_state = result
                latest_telemetry_state["tank_profile"] = {
                    "species": active_profile.common_name,
                    "target_temp": active_profile.water_requirements.temperature_c,
                    "target_ph": active_profile.water_requirements.ph,
                    "target_tds": active_profile.water_requirements.tds_ppm
                }
                return latest_telemetry_state
    except Exception:
        pass  # Fall back to direct binary execution

    # 2. Fallback: Execute Edge Impulse C++ compiled binary directly
    if os.path.exists(SIMULATOR_BIN_PATH):
        try:
            res = subprocess.run(
                [SIMULATOR_BIN_PATH, str(temp), str(ph), str(tds)],
                capture_output=True,
                text=True,
                check=True
            )
            result = json.loads(res.stdout)
            latest_telemetry_state = result
            latest_telemetry_state["tank_profile"] = {
                "species": active_profile.common_name,
                "target_temp": active_profile.water_requirements.temperature_c,
                "target_ph": active_profile.water_requirements.ph,
                "target_tds": active_profile.water_requirements.tds_ppm
            }
            return latest_telemetry_state
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"C++ Edge Runner failed: {str(e)}")

    raise HTTPException(status_code=500, detail="Edge IoT node and C++ binary not reachable.")

class TelemetryIngestPayload(BaseModel):
    device_id: Optional[str] = "aquaguard-esp32-node1"
    firmware_version: Optional[str] = "v23-delta-int8"
    system_status: str
    telemetry: Dict[str, float]
    deltas: Optional[Dict[str, float]] = None
    diagnostics: Dict[str, Any]
    gatekeeper: Dict[str, bool]
    timing_ms: Optional[Dict[str, int]] = None
    ml_confidence: Optional[Dict[str, float]] = None

@router.get("/latest")
async def get_latest_telemetry():
    return latest_telemetry_state

@router.post("/ingest")
async def ingest_edge_telemetry(payload: Dict[str, Any]):
    """
    Production Telemetry Uplink Endpoint:
    Receives autonomous telemetry packets pushed from the physical ESP32 
    (or the IoT Digital Twin simulator) after on-device TinyML inference has completed.
    Enriches with multi-species tank profiles and broadcasts live to connected mobile clients.
    """
    global latest_telemetry_state
    latest_telemetry_state.update(payload)
    latest_telemetry_state["tank_profile"] = {
        "species": active_profile.common_name,
        "target_temp": active_profile.water_requirements.temperature_c,
        "target_ph": active_profile.water_requirements.ph,
        "target_tds": active_profile.water_requirements.tds_ppm
    }
    await manager.broadcast(latest_telemetry_state)
    return {"status": "ACK", "received": True, "species": active_profile.common_name}

@router.post("/simulate")
async def simulate_edge_input(data: TelemetryInput):
    """
    Legacy/Fallback Endpoint:
    Receives raw sensor inputs and executes edge inference if needed.
    """
    result = await execute_edge_inference(data.temp, data.ph, data.tds)
    await manager.broadcast(result)
    return result

@router.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket):
    await manager.connect(websocket)
    # Send current state upon connection
    await websocket.send_json(latest_telemetry_state)
    try:
        while True:
            # Keep connection alive & accept optional client commands
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                if "temp" in payload and "ph" in payload and "tds" in payload:
                    res = await execute_edge_inference(payload["temp"], payload["ph"], payload["tds"])
                    await manager.broadcast(res)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
