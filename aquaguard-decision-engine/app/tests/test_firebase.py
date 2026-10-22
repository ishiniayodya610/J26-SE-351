"""
Unit tests for Firebase Realtime Database Integration (Phase 10).
"""

from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.database import firebase_client
from app.database.firebase_client import (
    get_live_telemetry,
    save_decision_result,
    save_simulation_result,
)

client = TestClient(app)


def test_firebase_offline_mode():
    """Verify helper functions handle uninitialized Firebase gracefully."""
    with patch.object(firebase_client.firebase_admin, "_apps", {}):
        assert get_live_telemetry("aquarium_001") is None
        # Should execute silently without raising
        save_decision_result("aquarium_001", {"status": "APPROVED"})
        save_simulation_result("aquarium_001", {"status": "APPROVED"})


def test_firebase_save_decision_with_mock():
    """Verify save_decision_result references correct RTDB path and calls .set()."""
    mock_app = MagicMock()
    mock_ref = MagicMock()

    with patch.object(firebase_client.firebase_admin, "_apps", {"[DEFAULT]": mock_app}):
        with patch.object(firebase_client.db, "reference", return_value=mock_ref) as mock_db_ref:
            decision_payload = {"status": "APPROVED", "esi": 0.85}
            save_decision_result("aquarium_001", decision_payload)

            mock_db_ref.assert_called_once_with("aquariums/aquarium_001/decisions")
            mock_ref.set.assert_called_once_with(decision_payload)


def test_firebase_save_simulation_with_mock():
    """Verify save_simulation_result references correct RTDB path and calls .set()."""
    mock_app = MagicMock()
    mock_ref = MagicMock()

    with patch.object(firebase_client.firebase_admin, "_apps", {"[DEFAULT]": mock_app}):
        with patch.object(firebase_client.db, "reference", return_value=mock_ref) as mock_db_ref:
            sim_payload = {"before": {"esi": 0.8}, "after": {"esi": 0.85}}
            save_simulation_result("aquarium_001", sim_payload)

            mock_db_ref.assert_called_once_with("aquariums/aquarium_001/simulations")
            mock_ref.set.assert_called_once_with(sim_payload)


def test_firebase_get_live_telemetry_with_mock():
    """Verify get_live_telemetry references correct RTDB path and calls .get()."""
    mock_app = MagicMock()
    mock_ref = MagicMock()
    mock_ref.get.return_value = {"temperature_c": 25.5, "ph": 7.1}

    with patch.object(firebase_client.firebase_admin, "_apps", {"[DEFAULT]": mock_app}):
        with patch.object(firebase_client.db, "reference", return_value=mock_ref) as mock_db_ref:
            telemetry = get_live_telemetry("aquarium_001")

            mock_db_ref.assert_called_once_with("aquariums/aquarium_001/telemetry")
            mock_ref.get.assert_called_once()
            assert telemetry["temperature_c"] == 25.5


def test_evaluate_endpoint_calls_firebase_save():
    """Verify evaluate endpoint pushes final decision to Firebase."""
    import json
    from pathlib import Path

    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    with open(mock_file, "r") as f:
        payload = json.load(f)["scenarios"][0]

    with patch("app.api.decision_routes.save_decision_result") as mock_save:
        response = client.post("/api/v1/evaluate", json=payload)
        assert response.status_code == 200
        mock_save.assert_called_once()
        args, _ = mock_save.call_args
        if len(args) == 3:
            assert args[0] == "default_user"
            assert args[1] == "aquarium_001"
            assert args[2]["status"] == "APPROVED"
            assert "esi" in args[2]
        else:
            assert args[0] == "aquarium_001"
            assert args[1]["status"] == "APPROVED"
            assert "esi" in args[1]


def test_firebase_multi_tenant_paths():
    """Verify multi-tenant user/tank paths for save and telemetry."""
    mock_app = MagicMock()
    mock_ref = MagicMock()

    with patch.object(firebase_client.firebase_admin, "_apps", {"[DEFAULT]": mock_app}):
        with patch.object(firebase_client.db, "reference", return_value=mock_ref) as mock_db_ref:
            # Multi-tenant decision save
            save_decision_result("user_999", "tank_777", {"status": "APPROVED"})
            mock_db_ref.assert_called_with("users/user_999/tanks/tank_777/decisions")

            # Multi-tenant telemetry fetch
            get_live_telemetry("user_999", "tank_777")
            mock_db_ref.assert_called_with("users/user_999/tanks/tank_777/telemetry")


def test_start_tank_listener():
    """Verify start_tank_listener attaches real-time snapshot listener on users node."""
    mock_app = MagicMock()
    mock_users_ref = MagicMock()

    with patch.object(firebase_client.firebase_admin, "_apps", {"[DEFAULT]": mock_app}):
        with patch.object(firebase_client.db, "reference", return_value=mock_users_ref) as mock_db_ref:
            firebase_client.start_tank_listener()
            mock_db_ref.assert_called_once_with("users")
            mock_users_ref.listen.assert_called_once()

