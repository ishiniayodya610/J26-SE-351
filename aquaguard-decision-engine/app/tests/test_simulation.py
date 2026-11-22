"""
Unit tests for What-If counterfactual simulation pipeline (Phase 8).
"""

import os
import json
import pytest
from app.simulation.what_if_engine import simulate_population_change, WhatIfSimulationEngine


@pytest.fixture
def load_simulation_data():
    base_dir = os.path.dirname(os.path.dirname(__file__))

    with open(os.path.join(base_dir, "data", "species_seed.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        species_db = {s["species_id"]: s for s in species_list}

    with open(os.path.join(base_dir, "data", "test_scenarios.json"), "r") as f:
        scenarios_data = json.load(f)

    return species_db, scenarios_data["scenarios"]


def test_simulation_approved_peaceful_addition(load_simulation_data):
    """Test what-if simulation when adding compatible fish passes and produces comparative metrics."""
    species_db, scenarios = load_simulation_data
    scenario = scenarios[0]

    current_fish = scenario["fish"]
    # Add 2 more Corydoras to an existing 100L tank
    proposed_fish = [
        dict(f) for f in current_fish
    ]
    proposed_fish[0]["male"] += 1
    proposed_fish[0]["female"] += 1

    result = simulate_population_change(
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        current_fish=current_fish,
        proposed_fish=proposed_fish,
        species_db=species_db,
    )

    assert result["status"] == "APPROVED"
    assert isinstance(result["esi_before"], float)
    assert isinstance(result["esi_after"], float)
    assert "difference" in result
    assert "esi_change" in result["difference"]
    assert result["difference"]["stability_impact"] in ["Improved", "Reduced", "Neutral"]
    assert "explanation" in result
    assert "recommendation" in result


def test_simulation_rejected_aggression_conflict(load_simulation_data):
    """Test what-if simulation rejects incompatible species additions (e.g. Betta with Guppy)."""
    species_db, scenarios = load_simulation_data
    scenario = scenarios[0]

    # Current: peaceful Corydoras + Neon Tetras
    current_fish = scenario["fish"]
    # Proposed: introduce Betta splendens alongside Guppy / Neon Tetra
    proposed_fish = current_fish + [
        {"species_id": "poecilia_reticulata", "male": 2, "female": 2},
        {"species_id": "betta_splendens", "male": 1, "female": 0},
    ]

    result = simulate_population_change(
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        current_fish=current_fish,
        proposed_fish=proposed_fish,
        species_db=species_db,
    )

    assert result["status"] == "REJECTED"
    assert result["esi_after"] is None
    assert isinstance(result["esi_before"], float)
    assert "conflict" in result["explanation"] or "territorial" in result["explanation"]
    assert "recommendation" in result


def test_simulation_rejected_volume_capacity(load_simulation_data):
    """Test what-if simulation rejects population changes that exceed tank capacity."""
    species_db, scenarios = load_simulation_data
    scenario = scenarios[0]

    current_fish = scenario["fish"]
    # Proposed: Overstock 100L tank with 60 Corydoras (60 * 4L = 240L required)
    proposed_fish = [
        {"species_id": "corydoras_aeneus", "male": 30, "female": 30}
    ]

    result = simulate_population_change(
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        current_fish=current_fish,
        proposed_fish=proposed_fish,
        species_db=species_db,
    )

    assert result["status"] == "REJECTED"
    assert result["esi_after"] is None
    assert "carrying capacity" in result["explanation"]
    assert "larger aquarium" in result["recommendation"]


def test_simulation_invalid_baseline(load_simulation_data):
    """Test what-if simulation when baseline configuration was already invalid."""
    species_db, scenarios = load_simulation_data
    scenario = scenarios[0]

    # Baseline with aggression conflict
    conflict_baseline = [
        {"species_id": "poecilia_reticulata", "male": 1, "female": 1},
        {"species_id": "betta_splendens", "male": 1, "female": 0},
    ]
    # Propose resolving conflict by removing Betta and keeping peaceful Corydoras
    proposed_peaceful = [
        {"species_id": "corydoras_aeneus", "male": 2, "female": 4}
    ]

    result = simulate_population_change(
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        current_fish=conflict_baseline,
        proposed_fish=proposed_peaceful,
        species_db=species_db,
    )

    assert result["esi_before"] == 0.0
    assert result["status"] == "APPROVED"
    assert result["esi_after"] is not None
    assert result["difference"]["esi_change"] > 0


def test_what_if_simulation_engine_class_wrapper(load_simulation_data):
    """Test WhatIfSimulationEngine class wrapper methods."""
    species_db, scenarios = load_simulation_data
    scenario = scenarios[0]

    engine = WhatIfSimulationEngine()
    result = engine.simulate_population_change(
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        current_fish=scenario["fish"],
        proposed_fish=scenario["fish"],
        species_db=species_db,
    )

    assert result["status"] == "APPROVED"
    assert result["difference"]["stability_impact"] == "Neutral"

    # Also check parameter shift simulation
    shift = engine.simulate_parameter_shift(
        current_state={"temperature_c": 24.0},
        hypothetical_changes={"temperature_c": 26.0},
    )
    assert shift["status"] == "simulation_complete"
    assert shift["simulated_state"]["temperature_c"] == 26.0
