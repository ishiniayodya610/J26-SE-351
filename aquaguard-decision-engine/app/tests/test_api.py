"""
Integration tests for FastAPI endpoints.
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
    assert data["service"] == "AquaGuard Decision Engine"
    assert data["status"] == "operational"


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "csp_engine" in data["modules"]


def test_decisions_evaluate_endpoint():
    response = client.post("/api/v1/decisions/evaluate")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"


def test_decisions_evaluate_with_phase3_mock_payload():
    mock_file = Path(__file__).parent.parent / "data" / "test_scenarios.json"
    assert mock_file.exists(), f"Mock file not found: {mock_file}"
    
    with open(mock_file, "r") as f:
        payload = json.load(f)
    
    # Validate entire file with ScenariosPayload
    assert "scenarios" in payload
    scenarios_list = payload["scenarios"]
    assert len(scenarios_list) == 2

    # Validate each individual scenario with EvaluationRequest
    for scenario_dict in scenarios_list:
        req = EvaluationRequest.model_validate(scenario_dict)
        assert req.scenario_id.startswith("scenario_")
        assert req.aquarium.volume_liters > 0
        assert len(req.fish) > 0

        # Test API endpoint with each scenario
        response = client.post("/api/v1/decisions/evaluate", json=scenario_dict)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["scenario_id"] == req.scenario_id


def test_simulations_what_if_endpoint():
    response = client.post("/api/v1/simulations/what-if")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"


def test_species_list_endpoint():
    response = client.get("/api/v1/species/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
