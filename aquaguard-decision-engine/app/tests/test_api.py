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
    
    # Validate payload schema with Pydantic model directly
    req = EvaluationRequest.model_validate(payload)
    assert req.scenario_id == "mock_baseline_001"
    assert req.aquarium.volume_liters == 60
    assert len(req.fish) == 2
    assert req.forecast.ammonia_status == "STABLE"

    # Test API endpoint with the payload
    response = client.post("/api/v1/decisions/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["scenario_id"] == "mock_baseline_001"


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
