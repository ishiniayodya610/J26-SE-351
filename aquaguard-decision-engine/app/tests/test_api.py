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
    assert isinstance(data["esi"], float)
    assert data["esi"] > 0.0
    assert data["risk_level"] in ["LOW", "MODERATE"]
    assert isinstance(data["population"], list)
    assert len(data["xai"]) > 0
    assert data["xai"][0]["summary"] == "Configuration approved."
    assert data["violations"] == []


def test_evaluate_endpoint_rejected():
    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    with open(mock_file, "r") as f:
        payload = json.load(f)

    conflict_scenario = payload["scenarios"][1]
    response = client.post("/api/v1/evaluate", json=conflict_scenario)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "REJECTED"
    assert data["esi"] == 0.0
    assert data["risk_level"] == "HIGH"
    assert len(data["violations"]) > 0
    assert len(data["xai"]) > 0
    assert data["xai"][0]["summary"] == "Configuration rejected."


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
