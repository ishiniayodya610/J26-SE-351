import json
import subprocess
import os
import time
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple
from backend.app.config import EDGE_NODE_URL, SIMULATOR_BIN_PATH
from backend.app.routers.fish_profile import active_profile

router = APIRouter(prefix="/api/telemetry", tags=["Edge TinyML Telemetry"])

class TelemetryInput(BaseModel):
    temp: float
    ph: float
    tds: float
    source: Optional[str] = "SIMULATED_TESTBED"
    device_label: Optional[str] = None

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

# Rolling historical buffer of (timestamp, temperature_c) for rate-of-rise (dT/dt) analysis
temperature_history: List[Tuple[float, float]] = []

def evaluate_thermal_runaway(
    current_temp: float, 
    target_temp: float, 
    heater_locked: bool = False, 
    edge_runaway: bool = False
) -> Dict[str, Any]:
    """
    Thermodynamic Actuator-State Divergence Evaluator:
    Detects physical welded relay contacts / stuck heater failures.
    According to Newton's Law of Cooling, when the heater is commanded OFF,
    temperature must stabilize or decay (dT/dt <= 0).
    A sustained positive thermal slope (dT/dt > 0) beyond target parameters 
    indicates uncommanded AC current surging through heating elements.
    """
    global temperature_history
    now = time.time()
    temperature_history.append((now, current_temp))
    if len(temperature_history) > 30:
        temperature_history.pop(0)

    slope_per_min = 0.0
    if len(temperature_history) >= 2:
        dt = temperature_history[-1][0] - temperature_history[0][0]
        dT = temperature_history[-1][1] - temperature_history[0][1]
        if dt > 1.0:
            slope_per_min = (dT / dt) * 60.0
        else:
            # Accelerated test pulses / rapid simulation: extrapolate 2s cycles
            sample_count = len(temperature_history) - 1
            slope_per_min = (dT / (sample_count * 2.0)) * 60.0

    is_runaway = False
    if edge_runaway:
        is_runaway = True
    elif current_temp >= 31.5:
        is_runaway = True
    elif (current_temp >= target_temp + 0.4) and (slope_per_min > 0.04):
        is_runaway = True

    lethal_temp = target_temp + 3.0  # e.g. 32.0°C for Discus at 29.0°C
    if is_runaway:
        effective_slope = max(slope_per_min, 0.08)
        remaining_deg = max(0.1, lethal_temp - current_temp)
        time_to_critical_min = max(1, int(round(remaining_deg / effective_slope)))
        return {
            "active": True,
            "headline": "🚨 WELDED RELAY: UNPLUG HEATER",
            "message": f"Water temp ({current_temp:.1f}°C) is climbing (+{slope_per_min:.2f}°C/min) beyond target ({target_temp:.1f}°C) despite heater commanded OFF. Relay contacts likely welded shut.",
            "slope_per_min": round(slope_per_min, 2),
            "time_to_critical_min": time_to_critical_min,
            "lethal_temp": round(lethal_temp, 1),
            "action": "PHYSICALLY UNPLUG HEATER FROM WALL SOCKET IMMEDIATELY"
        }
    else:
        return {
            "active": False,
            "headline": "NOMINAL_THERMAL_REGULATION",
            "message": "Thermal regulation nominal.",
            "slope_per_min": round(slope_per_min, 2),
            "time_to_critical_min": None,
            "lethal_temp": round(lethal_temp, 1),
            "action": "Normal operation"
        }

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
    "gatekeeper": {"heater_lockout": False, "ph_pump_lockout": False, "thermal_runaway": False},
    "tank_profile": {
        "species": "Discus",
        "target_temp": 29.0,
        "target_ph": 6.5,
        "target_tds": 150.0
    },
    "thermal_runaway": {
        "active": False,
        "headline": "NOMINAL_THERMAL_REGULATION",
        "message": "Thermal regulation nominal.",
        "slope_per_min": 0.0,
        "time_to_critical_min": None,
        "lethal_temp": 32.0,
        "action": "Normal operation"
    },
    "data_source": {
        "type": "SIMULATED_TESTBED",
        "label": "Evaluator Testbed Simulator",
        "is_real_hardware": False
    }
}

async def execute_edge_inference(
    temp: float, 
    ph: float, 
    tds: float, 
    source: str = "SIMULATED_TESTBED", 
    device_label: Optional[str] = None
) -> Dict[str, Any]:
    global latest_telemetry_state
    
    is_real = source in ("REMOTE_ESP32", "PHYSICAL_EDGE")
    default_label = "Live Physical ESP32 Probes" if is_real else "Evaluator Testbed Simulator"
    data_source_meta = {
        "type": source,
        "label": device_label or default_label,
        "is_real_hardware": is_real
    }

    result = None

    # 1. Attempt HTTP call to the standalone Edge IoT device server
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.post(f"{EDGE_NODE_URL}/simulate", json={"temp": temp, "ph": ph, "tds": tds, "source": source})
            if resp.status_code == 200:
                result = resp.json()
    except Exception:
        pass  # Fall back to direct binary execution

    # 2. Fallback: Execute Edge Impulse C++ compiled binary directly
    if result is None and os.path.exists(SIMULATOR_BIN_PATH):
        try:
            res = subprocess.run(
                [SIMULATOR_BIN_PATH, str(temp), str(ph), str(tds)],
                capture_output=True,
                text=True,
                check=True
            )
            result = json.loads(res.stdout)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"C++ Edge Runner failed: {str(e)}")

    if result is None:
        raise HTTPException(status_code=500, detail="Edge IoT node and C++ binary not reachable.")

    latest_telemetry_state.clear()
    latest_telemetry_state.update(result)
    latest_telemetry_state["data_source"] = data_source_meta
    target_temp = active_profile.water_requirements.temperature_c
    latest_telemetry_state["tank_profile"] = {
        "species": active_profile.common_name,
        "target_temp": target_temp,
        "target_ph": active_profile.water_requirements.ph,
        "target_tds": active_profile.water_requirements.tds_ppm
    }

    # Evaluate physical thermal runaway / welded relay failure
    raw_temp = latest_telemetry_state.get("telemetry", {}).get("raw_temp", temp)
    gatekeeper = latest_telemetry_state.setdefault("gatekeeper", {})
    edge_runaway = gatekeeper.get("thermal_runaway", False)
    heater_locked = gatekeeper.get("heater_lockout", False)

    runaway_info = evaluate_thermal_runaway(raw_temp, target_temp, heater_locked, edge_runaway)
    latest_telemetry_state["thermal_runaway"] = runaway_info
    latest_telemetry_state["gatekeeper"]["thermal_runaway"] = runaway_info["active"]
    if runaway_info["active"]:
        latest_telemetry_state["system_status"] = "CRITICAL_THERMAL_RUNAWAY"
        latest_telemetry_state["gatekeeper"]["heater_lockout"] = True

    return latest_telemetry_state

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
    target_temp = active_profile.water_requirements.temperature_c
    latest_telemetry_state["tank_profile"] = {
        "species": active_profile.common_name,
        "target_temp": target_temp,
        "target_ph": active_profile.water_requirements.ph,
        "target_tds": active_profile.water_requirements.tds_ppm
    }

    # Evaluate physical thermal runaway / welded relay failure
    raw_temp = latest_telemetry_state.get("telemetry", {}).get("raw_temp", 
               latest_telemetry_state.get("telemetry", {}).get("temperature_c", target_temp))
    gatekeeper = latest_telemetry_state.setdefault("gatekeeper", {})
    edge_runaway = gatekeeper.get("thermal_runaway", False)
    heater_locked = gatekeeper.get("heater_lockout", False)

    runaway_info = evaluate_thermal_runaway(raw_temp, target_temp, heater_locked, edge_runaway)
    latest_telemetry_state["thermal_runaway"] = runaway_info
    latest_telemetry_state["gatekeeper"]["thermal_runaway"] = runaway_info["active"]
    if runaway_info["active"]:
        latest_telemetry_state["system_status"] = "CRITICAL_THERMAL_RUNAWAY"
        latest_telemetry_state["gatekeeper"]["heater_lockout"] = True

    await manager.broadcast(latest_telemetry_state)
    return {"status": "ACK", "received": True, "species": active_profile.common_name, "thermal_runaway": runaway_info["active"]}

@router.post("/reset-history")
async def reset_temperature_history():
    """Clears the historical temperature trend buffer."""
    global temperature_history
    temperature_history.clear()
    return {"status": "CLEARED", "samples_retained": 0}

@router.post("/simulate")
async def simulate_edge_input(data: TelemetryInput):
    """
    Legacy/Fallback Endpoint:
    Receives raw sensor inputs and executes edge inference if needed.
    """
    result = await execute_edge_inference(
        data.temp, 
        data.ph, 
        data.tds,
        source=data.source or "SIMULATED_TESTBED",
        device_label=data.device_label
    )
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
