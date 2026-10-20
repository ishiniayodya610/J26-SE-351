"""
Integration tests for FastAPI endpoints.
"""

from fastapi.testclient import TestClient
from app.main import app

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
