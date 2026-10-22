"""
Unit tests for CSP Gatekeeper hard constraints (Test Group A).
Tests compatibility, volume, and temperature validation against mock scenarios.
"""

import os
import json
import pytest
from app.csp.csp_engine import evaluate_hard_constraints, CSPEngine
from app.csp.constraints import (
    check_compatibility,
    check_volume,
    check_temperature,
    check_temperature_compatibility,
    check_ph_compatibility,
    check_temperament_compatibility,
)
from app.models.decision import EvaluationRequest


@pytest.fixture
def load_mock_data():
    base_dir = os.path.dirname(os.path.dirname(__file__))

    with open(os.path.join(base_dir, "data", "species_seed.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        species_db = {s["species_id"]: s for s in species_list}

    with open(os.path.join(base_dir, "data", "test_scenarios.json"), "r") as f:
        scenarios_data = json.load(f)

    return species_db, scenarios_data["scenarios"]


def test_peaceful_community_passes(load_mock_data):
    """Test that a compatible tank (Corydoras & Neon Tetras) passes CSP."""
    species_db, scenarios = load_mock_data
    scenario = scenarios[0]  # scenario_001_peaceful_community

    result = evaluate_hard_constraints(
        scenario["aquarium"],
        scenario["telemetry"],
        scenario["fish"],
        species_db,
    )

    assert result["status"] == "PASS"
    assert result["reason_code"] == "ALL_CONSTRAINTS_MET"


def test_predator_conflict_rejected(load_mock_data):
    """Test that Angelfish and Neon Tetras trigger a high-risk rejection."""
    species_db, scenarios = load_mock_data
    scenario = scenarios[1]  # scenario_002_predator_conflict

    result = evaluate_hard_constraints(
        scenario["aquarium"],
        scenario["telemetry"],
        scenario["fish"],
        species_db,
    )

    assert result["status"] == "REJECTED"
    assert result["rule_id"] == "CSP-001"
    assert result["reason_code"] == "AGGRESSION_CONFLICT"
    assert "Angelfish" in result["species"]
    assert "Neon Tetra" in result["species"]


def test_volume_exceeded_rejected(load_mock_data):
    """Test that overloading a small tank triggers VOLUME_EXCEEDED (CSP-002)."""
    species_db, scenarios = load_mock_data
    scenario = scenarios[0]

    # Tank volume is only 10 Liters, but 10 fish require 25 Liters
    small_tank = dict(scenario["aquarium"], volume_liters=10.0)

    result = evaluate_hard_constraints(
        small_tank,
        scenario["telemetry"],
        scenario["fish"],
        species_db,
    )

    assert result["status"] == "REJECTED"
    assert result["rule_id"] == "CSP-002"
    assert result["reason_code"] == "VOLUME_EXCEEDED"


def test_temperature_violation_rejected(load_mock_data):
    """Test that extreme temperatures trigger TEMPERATURE_VIOLATION (CSP-003)."""
    species_db, scenarios = load_mock_data
    scenario = scenarios[0]

    # Neon Tetra max temperature is 26°C; test with 32°C
    hot_telemetry = dict(scenario["telemetry"], temperature_c=32.0)

    result = evaluate_hard_constraints(
        scenario["aquarium"],
        hot_telemetry,
        scenario["fish"],
        species_db,
    )

    assert result["status"] == "REJECTED"
    assert result["rule_id"] == "CSP-003"
    assert result["reason_code"] == "TEMPERATURE_VIOLATION"
    assert "Neon Tetra" in result["species"]


def test_evaluate_with_pydantic_models(load_mock_data):
    """Test that evaluate_hard_constraints works identically with Pydantic model instances."""
    species_db, scenarios = load_mock_data
    req_peaceful = EvaluationRequest.model_validate(scenarios[0])
    req_conflict = EvaluationRequest.model_validate(scenarios[1])

    pass_result = evaluate_hard_constraints(
        req_peaceful.aquarium,
        req_peaceful.telemetry,
        req_peaceful.fish,
        species_db,
    )
    assert pass_result["status"] == "PASS"

    reject_result = evaluate_hard_constraints(
        req_conflict.aquarium,
        req_conflict.telemetry,
        req_conflict.fish,
        species_db,
    )
    assert reject_result["status"] == "REJECTED"
    assert reject_result["rule_id"] == "CSP-001"


def test_csp_engine_class_wrapper(load_mock_data):
    """Test that the CSPEngine class wrapper delegates properly."""
    species_db, scenarios = load_mock_data
    engine = CSPEngine()
    result = engine.evaluate(
        scenarios[0]["aquarium"],
        scenarios[0]["telemetry"],
        scenarios[0]["fish"],
        species_db,
    )
    assert result["status"] == "PASS"
