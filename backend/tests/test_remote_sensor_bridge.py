import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from backend.app.routers.telemetry import execute_edge_inference, latest_telemetry_state
from backend.app.services.aquio_bridge import AquioBridgeService

@pytest.mark.asyncio
async def test_remote_sensor_nominal_ingest():
    """
    Test Case 1: Nominal Physical Sensor Readings from Remote ESP32
    Verifies:
      1. Data source metadata is marked as REMOTE_ESP32 and is_real_hardware == True.
      2. Local TinyML model processes normal readings with high confidence.
      3. System status remains OPTIMAL.
      4. Hardware safety relays remain in nominal active state (no lockout).
    """
    remote_temp = 28.5
    remote_ph = 6.8
    remote_tds = 150.0

    result = await execute_edge_inference(
        temp=remote_temp,
        ph=remote_ph,
        tds=remote_tds,
        source="REMOTE_ESP32",
        device_label="Live Remote ESP32 (Tank #1)"
    )

    # 1. Verify Data Source Metadata
    assert "data_source" in result, "Result must contain data_source metadata"
    assert result["data_source"]["type"] == "REMOTE_ESP32"
    assert result["data_source"]["is_real_hardware"] is True
    assert "Tank #1" in result["data_source"]["label"]

    # 2. Verify TinyML Inference Output
    assert result["system_status"] == "OPTIMAL"
    assert result["telemetry"]["temperature_c"] == remote_temp
    assert result["telemetry"]["ph"] == remote_ph
    assert result["telemetry"]["tds_ppm"] == remote_tds

    # 3. Verify No Spurious Actuator Lockouts
    assert result["gatekeeper"]["heater_lockout"] is False
    assert result["gatekeeper"]["ph_pump_lockout"] is False
    assert result["ml_confidence"]["normal"] > 0.50

@pytest.mark.asyncio
async def test_remote_sensor_anomaly_and_lockout():
    """
    Test Case 2: Emergency Thermal Jump from Remote Sensor
    Verifies:
      1. Remote sensor data is tagged as real hardware.
      2. Edge TinyML model detects the thermal spike anomaly.
      3. Heater relay is locked out locally in hardware (heater_lockout == True).
      4. Baseline data imputation protects downstream cloud and mobile consumers.
    """
    # First establish a nominal baseline
    await execute_edge_inference(temp=28.0, ph=6.8, tds=150.0, source="REMOTE_ESP32")

    # Now inject a sudden +5.5°C jump from remote sensor
    spike_temp = 33.5
    result = await execute_edge_inference(
        temp=spike_temp,
        ph=6.8,
        tds=150.0,
        source="REMOTE_ESP32",
        device_label="Live Remote ESP32 (Tank #1)"
    )

    # 1. Verify Data Source
    assert result["data_source"]["is_real_hardware"] is True

    # 2. Verify Anomaly Detection & Actuator Interlock
    assert result["gatekeeper"]["heater_lockout"] is True, "Heater relay MUST be locked out on thermal jump!"
    assert result["diagnostics"]["temperature"]["fault_detected"] is True
    assert result["diagnostics"]["temperature"]["imputed"] is True, "Unsafe reading must be imputed to safe baseline"

@pytest.mark.asyncio
async def test_aquio_bridge_full_lifecycle_mock():
    """
    Test Case 3: Complete Aquio API Lifecycle Mock
    Simulates the exact OpenAPI behavior of https://api.aquio.smartaquamarket.com:
      - POST /api/v1/auth/login returns JWT bearer token
      - GET /api/v1/tanks/{tank_id} returns tank sensor list with latest_reading
    Verifies that AquioBridgeService authenticates, extracts sensor readings,
    and feeds them through the local TinyML engine successfully.
    """
    service = AquioBridgeService()
    service.email = "test_aquaguard@example.com"
    service.password = "ValidSecret123!"
    service.tank_id = 1
    service.enabled = True

    # Mock response from POST /api/v1/auth/login
    mock_login_response = MagicMock()
    mock_login_response.status_code = 200
    mock_login_response.json.return_value = {
        "status": "success",
        "data": {
            "access_token": "mocked_jwt_access_token_xyz123",
            "refresh_token": "mocked_jwt_refresh_token_abc456",
            "token_type": "bearer"
        }
    }

    # Mock response from GET /api/v1/tanks/1
    mock_tank_response = MagicMock()
    mock_tank_response.status_code = 200
    mock_tank_response.json.return_value = {
        "status": "success",
        "data": {
            "id": 1,
            "name": "Aquio Breeding Tank 1",
            "fish_type": "Discus",
            "sensors": [
                {"id": 101, "type": "temperature", "unit": "°C", "latest_reading": 29.2},
                {"id": 102, "type": "ph", "unit": "pH", "latest_reading": 6.6},
                {"id": 103, "type": "tds", "unit": "ppm", "latest_reading": 148.0}
            ]
        }
    }

    # Patch httpx.AsyncClient to return our mocks
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post, \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        
        mock_post.return_value = mock_login_response
        mock_get.return_value = mock_tank_response

        # Execute single sync cycle
        sync_result = await service.sync_once()

        # Assertions
        assert sync_result["success"] is True
        assert sync_result["readings"]["temp"] == 29.2
        assert sync_result["readings"]["ph"] == 6.6
        assert sync_result["readings"]["tds"] == 148.0
        assert service.sync_count == 1
        assert service.last_readings["temp"] == 29.2

        # Verify the TinyML state was updated with real hardware tag
        assert sync_result["inference"]["data_source"]["is_real_hardware"] is True

@pytest.mark.asyncio
async def test_switch_between_remote_and_simulator():
    """
    Test Case 4: Seamless Switching Between Remote ESP32 & HTML Testbed Simulator
    Verifies:
      1. Ingesting from remote sets is_real_hardware = True.
      2. Ingesting from slider testbed sets is_real_hardware = False.
      3. Returning to remote re-engages is_real_hardware = True.
    """
    # 1. Remote Sensor feeds in
    res_remote = await execute_edge_inference(temp=28.0, ph=6.8, tds=150.0, source="REMOTE_ESP32")
    assert res_remote["data_source"]["is_real_hardware"] is True
    assert res_remote["data_source"]["type"] == "REMOTE_ESP32"

    # 2. Evaluator moves the HTML Slider on Port 3000
    res_sim = await execute_edge_inference(temp=32.0, ph=6.0, tds=200.0, source="SIMULATED_TESTBED")
    assert res_sim["data_source"]["is_real_hardware"] is False
    assert res_sim["data_source"]["type"] == "SIMULATED_TESTBED"

    # 3. Next remote sensor packet arrives
    res_remote_2 = await execute_edge_inference(temp=28.2, ph=6.8, tds=152.0, source="REMOTE_ESP32")
    assert res_remote_2["data_source"]["is_real_hardware"] is True
    assert res_remote_2["data_source"]["type"] == "REMOTE_ESP32"

@pytest.mark.asyncio
async def test_welded_relay_thermal_runaway_detection():
    """
    Test Case 5: Welded Relay / Stuck Immersion Heater Anomaly
    Simulates physical relay contact welding where:
      1. Water temperature begins at nominal baseline (29.0°C).
      2. Heater relay is commanded OFF by thermostat logic.
      3. Temperature slowly creeps upward (29.5°C, 30.0°C, 30.6°C).
      4. System detects positive rate-of-rise (dT/dt > 0) violating Newton's cooling law.
      5. Flags thermal_runaway = True, locks heater relay, calculates time-to-critical countdown,
         and Component 4 XAI synthesizes urgent physical intervention advice.
    """
    from backend.app.routers.telemetry import reset_temperature_history
    from backend.app.routers.comp4_xai import synthesize_xai_explanation

    # Clear historical window
    await reset_temperature_history()

    # Step 1: Nominal baseline
    res_base = await execute_edge_inference(temp=29.0, ph=6.5, tds=150.0, source="REMOTE_ESP32")
    assert res_base["thermal_runaway"]["active"] is False

    # Step 2: Uncontrolled heat accumulation (creeps above 29.4°C threshold with sustained positive gradient)
    await execute_edge_inference(temp=29.5, ph=6.5, tds=150.0, source="REMOTE_ESP32")
    res_runaway = await execute_edge_inference(temp=30.2, ph=6.5, tds=150.0, source="REMOTE_ESP32")

    # Assertions on Runaway Detection
    assert res_runaway["thermal_runaway"]["active"] is True
    assert res_runaway["gatekeeper"]["thermal_runaway"] is True
    assert res_runaway["gatekeeper"]["heater_lockout"] is True
    assert res_runaway["system_status"] == "CRITICAL_THERMAL_RUNAWAY"
    assert res_runaway["thermal_runaway"]["time_to_critical_min"] is not None
    assert "UNPLUG HEATER" in res_runaway["thermal_runaway"]["action"]

    # Step 3: Verify Component 4 XAI Root-Cause Attribution
    xai = synthesize_xai_explanation()
    assert "HARDWARE FAULT" in xai["headline"]
    assert "Welded Relay" in xai["headline"] or "Welded Relay" in xai["explanation"]
    assert any(attr.feature_name == "Actuator State Discrepancy" for attr in xai["attributions"])
    assert any("unplug" in act.lower() for act in xai["actions"])

