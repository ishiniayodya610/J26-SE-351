"""
Integration tests for FastAPI endpoints (Phase 9: Decision & Simulation REST API Layer).
"""

import json
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.models.decision import EvaluationRequest

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "AquaGuard Decision Engine" in data["service"]
    assert data["status"] == "operational"


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "csp_engine" in data["modules"]
    assert "fuzzy_engine" in data["modules"]
    assert "optimizer" in data["modules"]


def test_evaluate_endpoint_approved():
    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    with open(mock_file, "r") as f:
        payload = json.load(f)

    peaceful_scenario = payload["scenarios"][0]
    response = client.post("/api/v1/evaluate", json=peaceful_scenario)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "APPROVED"
    assert data.get("mode") == "ornamental"
    assert isinstance(data["esi"], float)
    assert data["esi"] > 0.0
    assert data["risk_level"] in ["LOW", "MODERATE"]
    assert isinstance(data["population"], list)
    assert len(data["xai"]) > 0
    assert "Configuration approved" in data["xai"][0]["summary"]
    assert data["violations"] == []
    assert "esp32_targets" in data


def test_evaluate_endpoint_breeder_mode():
    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    with open(mock_file, "r") as f:
        payload = json.load(f)

    scenario = dict(payload["scenarios"][0])
    scenario["tank_mode"] = "breeder"
    response = client.post("/api/v1/evaluate", json=scenario)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "APPROVED"
    assert data.get("mode") == "breeder"
    assert data["xai"][0]["summary"] == "Breeding configuration optimized. Sex ratios and fry bioload margins applied."
    assert "esp32_targets" in data
    assert isinstance(data["population"], list)


def test_evaluate_endpoint_minimal_payload():
    """Verify React Native payload without scenario_id/forecast succeeds."""
    minimal_payload = {
        "aquarium": {"volume_liters": 120.0},
        "telemetry": {"temperature_c": 25.0, "ph": 7.0, "tds_ppm": 150.0},
        "fish": [
            {"species_id": "poecilia_reticulata", "count": 5, "male": 2, "female": 3}
        ],
        "tank_mode": "ornamental"
    }
    response = client.post("/api/v1/evaluate", json=minimal_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "APPROVED"
    assert data.get("mode") == "ornamental"
    assert len(data["population"]) == 1
    assert data["population"][0]["species_id"] == "poecilia_reticulata"
    assert data["population"][0]["count"] == 5


def test_evaluate_endpoint_rejected():
    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    with open(mock_file, "r") as f:
        payload = json.load(f)

    conflict_scenario = payload["scenarios"][1]
    response = client.post("/api/v1/evaluate", json=conflict_scenario)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "REJECTED"
    assert data.get("mode") == "ornamental"
    assert data["esi"] == 0.0
    assert data["risk_level"] == "HIGH"
    assert len(data["violations"]) > 0
    assert len(data["xai"]) > 0
    assert "Configuration rejected" in data["xai"][0]["summary"]


def test_simulate_endpoint():
    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    with open(mock_file, "r") as f:
        payload = json.load(f)

    scenario = payload["scenarios"][0]
    sim_request = {
        "aquarium": scenario["aquarium"],
        "telemetry": scenario["telemetry"],
        "current_population": scenario["fish"],
        "proposed_population": scenario["fish"],
    }

    response = client.post("/api/v1/simulate", json=sim_request)
    assert response.status_code == 200
    data = response.json()
    assert "before" in data and "esi" in data["before"]
    assert "after" in data and "esi" in data["after"]
    assert "difference" in data
    assert "recommendation" in data
    assert "explanation" in data


def test_species_list_endpoint():
    response = client.get("/api/v1/species/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
