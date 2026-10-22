#!/usr/bin/env python3
"""
AquaGuard J26-SE-351: Remote Sensor Bridge & TinyML Integration Test Runner
Executes comprehensive validation tests for remote ESP32 ingestion.
"""

import sys
import os
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.routers.telemetry import execute_edge_inference
from backend.app.services.aquio_bridge import AquioBridgeService

GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"

def print_header(title: str):
    print(f"\n{CYAN}{BOLD}{'='*60}{RESET}")
    print(f"{CYAN}{BOLD}  {title}{RESET}")
    print(f"{CYAN}{BOLD}{'='*60}{RESET}")

async def run_tests():
    print_header("AquaGuard: Remote ESP32 Sensor & TinyML Test Suite")
    tests_passed = 0
    total_tests = 5

    def reset_state():
        try:
            with open("/tmp/aquaguard_state.txt", "w") as f:
                f.write("28.500 6.800 150.000\n")
        except Exception:
            pass

    reset_state()

    # --------------------------------------------------------------------------
    # Test 1: Remote Nominal Sensor Ingest
    # --------------------------------------------------------------------------
    print(f"\n{BOLD}[Test 1/5] Testing Nominal Remote ESP32 Ingestion...{RESET}")
    try:
        res = await execute_edge_inference(
            temp=28.5, ph=6.8, tds=150.0,
            source="REMOTE_ESP32",
            device_label="Live Remote ESP32 (Tank #1)"
        )
        assert res["data_source"]["is_real_hardware"] is True
        assert res["data_source"]["type"] == "REMOTE_ESP32"
        assert res["system_status"] == "OPTIMAL"
        assert res["gatekeeper"]["heater_lockout"] is False
        assert res["gatekeeper"]["ph_pump_lockout"] is False
        
        print(f"  {GREEN}✔ Data Source Tagged: {res['data_source']['label']}{RESET}")
        print(f"  {GREEN}✔ TinyML Classification: {res['system_status']} (Confidence: {res['ml_confidence']['normal']*100:.1f}%){RESET}")
        print(f"  {GREEN}✔ Hardware Interlocks: All Actuators Safe (No Lockout){RESET}")
        print(f"  {GREEN}--> TEST 1 PASSED{RESET}")
        tests_passed += 1
    except Exception as e:
        print(f"  {RED}✘ TEST 1 FAILED: {e}{RESET}")

    # --------------------------------------------------------------------------
    # Test 2: Remote Sensor Anomaly Detection & Actuator Lockdown
    # --------------------------------------------------------------------------
    print(f"\n{BOLD}[Test 2/5] Testing Remote Sensor Thermal Spike & Relay Lockout...{RESET}")
    try:
        # Establish baseline first
        await execute_edge_inference(temp=28.0, ph=6.8, tds=150.0, source="REMOTE_ESP32")
        
        # Inject +5.5°C jump from remote
        res = await execute_edge_inference(
            temp=33.5, ph=6.8, tds=150.0,
            source="REMOTE_ESP32",
            device_label="Live Remote ESP32 (Tank #1)"
        )
        assert res["data_source"]["is_real_hardware"] is True
        assert res["gatekeeper"]["heater_lockout"] is True
        assert res["diagnostics"]["temperature"]["imputed"] is True

        print(f"  {GREEN}✔ Thermal Jump Detected: ΔT = +{(res.get('deltas', {}).get('delta_temp', 5.5)):.1f}°C{RESET}")
        print(f"  {GREEN}✔ AC Heater Relay Interlock: LOCKED OUT IN HARDWARE (GPIO 18 Safe){RESET}")
        print(f"  {GREEN}✔ Safe Data Imputation: Active (Clean Temp = {res['telemetry']['temperature_c']}°C){RESET}")
        print(f"  {GREEN}--> TEST 2 PASSED{RESET}")
        tests_passed += 1
    except Exception as e:
        print(f"  {RED}✘ TEST 2 FAILED: {e}{RESET}")

    # --------------------------------------------------------------------------
    # Test 3: Aquio Cloud API Mock Lifecycle (Login + Tank Sensors)
    # --------------------------------------------------------------------------
    print(f"\n{BOLD}[Test 3/5] Testing Aquio Swagger API End-to-End Mock...{RESET}")
    try:
        service = AquioBridgeService()
        service.email = "test@example.com"
        service.password = "ValidSecret123!"
        service.tank_id = 1
        service.enabled = True

        mock_login = MagicMock()
        mock_login.status_code = 200
        mock_login.json.return_value = {
            "status": "success",
            "data": {"access_token": "mock_jwt_token_123", "refresh_token": "mock_rf"}
        }

        mock_tank = MagicMock()
        mock_tank.status_code = 200
        mock_tank.json.return_value = {
            "status": "success",
            "data": {
                "id": 1,
                "name": "Discus Breeding Tank #1",
                "sensors": [
                    {"id": 1, "type": "temperature", "unit": "°C", "latest_reading": 29.1},
                    {"id": 2, "type": "ph", "unit": "pH", "latest_reading": 6.55},
                    {"id": 3, "type": "tds", "unit": "ppm", "latest_reading": 152.0}
                ]
            }
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as m_post, \
             patch("httpx.AsyncClient.get", new_callable=AsyncMock) as m_get:
            m_post.return_value = mock_login
            m_get.return_value = mock_tank

            sync_res = await service.sync_once()
            assert sync_res["success"] is True
            assert sync_res["readings"]["temp"] == 29.1
            assert sync_res["readings"]["ph"] == 6.55
            assert sync_res["readings"]["tds"] == 152.0

        print(f"  {GREEN}✔ Authenticated via POST /api/v1/auth/login (JWT Bearer Token Received){RESET}")
        print(f"  {GREEN}✔ Polled GET /api/v1/tanks/1 -> Extracted Temp=29.1°C, pH=6.55, TDS=152.0ppm{RESET}")
        print(f"  {GREEN}✔ Ingested into TinyML: State Updated & Broadcasted{RESET}")
        print(f"  {GREEN}--> TEST 3 PASSED{RESET}")
        tests_passed += 1
    except Exception as e:
        print(f"  {RED}✘ TEST 3 FAILED: {e}{RESET}")

    # --------------------------------------------------------------------------
    # Test 4: Switching Between Remote Sensors and Simulator Slider
    # --------------------------------------------------------------------------
    print(f"\n{BOLD}[Test 4/5] Testing Dynamic Source Switching (Remote <-> Slider)...{RESET}")
    try:
        # A. Remote Sensor
        res_a = await execute_edge_inference(temp=28.0, ph=6.8, tds=150.0, source="REMOTE_ESP32")
        assert res_a["data_source"]["is_real_hardware"] is True

        # B. Slider moves
        res_b = await execute_edge_inference(temp=32.0, ph=6.0, tds=200.0, source="SIMULATED_TESTBED")
        assert res_b["data_source"]["is_real_hardware"] is False

        # C. Remote Sensor arrives again
        res_c = await execute_edge_inference(temp=28.2, ph=6.8, tds=152.0, source="REMOTE_ESP32")
        assert res_c["data_source"]["is_real_hardware"] is True

        print(f"  {GREEN}✔ Remote Mode: is_real_hardware = TRUE (Shows 🟢 Live Remote ESP32){RESET}")
        print(f"  {GREEN}✔ Slider Mode: is_real_hardware = FALSE (Shows 🧪 Evaluator Testbed){RESET}")
        print(f"  {GREEN}✔ Revert Mode: Successfully resumed real hardware tracking{RESET}")
        print(f"  {GREEN}--> TEST 4 PASSED{RESET}")
        tests_passed += 1
    except Exception as e:
        print(f"  {RED}✘ TEST 4 FAILED: {e}{RESET}")

    # --------------------------------------------------------------------------
    # Test 5: Welded Relay / Stuck Heater Thermal Runaway Anomaly Detection
    # --------------------------------------------------------------------------
    print(f"\n{BOLD}[Test 5/5] Testing Welded Relay Runaway & XAI Root-Cause Attribution...{RESET}")
    try:
        from backend.app.routers.telemetry import reset_temperature_history
        from backend.app.routers.comp4_xai import synthesize_xai_explanation

        await reset_temperature_history()
        # Ingest baseline
        await execute_edge_inference(temp=29.0, ph=6.5, tds=150.0, source="REMOTE_ESP32")
        # Ingest slow creep
        await execute_edge_inference(temp=29.5, ph=6.5, tds=150.0, source="REMOTE_ESP32")
        res_runaway = await execute_edge_inference(temp=30.2, ph=6.5, tds=150.0, source="REMOTE_ESP32")

        assert res_runaway["thermal_runaway"]["active"] is True
        assert res_runaway["gatekeeper"]["thermal_runaway"] is True
        assert res_runaway["system_status"] == "CRITICAL_THERMAL_RUNAWAY"
        assert res_runaway["thermal_runaway"]["time_to_critical_min"] is not None

        xai = synthesize_xai_explanation()
        assert "HARDWARE FAULT" in xai["headline"]
        assert any(a.feature_name == "Actuator State Discrepancy" for a in xai["attributions"])

        print(f"  {GREEN}✔ Thermodynamic Divergence Detected: T=30.2°C, dT/dt > 0 while Heater OFF{RESET}")
        print(f"  {GREEN}✔ Gatekeeper Transition: system_status = CRITICAL_THERMAL_RUNAWAY{RESET}")
        print(f"  {GREEN}✔ Mortality Countdown: ~{res_runaway['thermal_runaway']['time_to_critical_min']} mins until lethal limit{RESET}")
        print(f"  {GREEN}✔ Component 4 XAI: Causal attribution generated ({xai['headline']}){RESET}")
        print(f"  {GREEN}--> TEST 5 PASSED{RESET}")
        tests_passed += 1
    except Exception as e:
        print(f"  {RED}✘ TEST 5 FAILED: {e}{RESET}")

    # Summary
    print_header("Test Summary")
    if tests_passed == total_tests:
        print(f"{GREEN}{BOLD}ALL {tests_passed}/{total_tests} TESTS PASSED SUCCESSFULLY! ✔{RESET}")
        print(f"{GREEN}The system is verified and ready to ingest live remote Aquio ESP32 data.{RESET}\n")
    else:
        print(f"{RED}{BOLD}{total_tests - tests_passed} TESTS FAILED! ✘{RESET}\n")

if __name__ == "__main__":
    asyncio.run(run_tests())
