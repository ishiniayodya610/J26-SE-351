"""
Unit tests for Fuzzy Stability Engine (Test Group B).
Tests Ecosystem Stability Index (ESI) calculation against optimal, suboptimal, and critical scenarios.
"""

import pytest
from app.fuzzy.fuzzy_engine import calculate_esi, FuzzyEngine
from app.models.telemetry import Telemetry, Diagnostics, Gatekeeper
from app.models.species import FishBehavior


@pytest.fixture
def mock_species_db():
    return {
        "poecilia_reticulata": {"behavior": {"aggression": 1}},
        "betta_splendens": {"behavior": {"aggression": 9}},
    }


def test_optimal_conditions_yield_stable_esi(mock_species_db):
    """Test scenario with perfect temperature, pH, TDS, and calm fish."""
    telemetry = {"temperature_c": 25.0, "ph": 7.0, "tds_ppm": 200}
    fish_list = [{"species_id": "poecilia_reticulata", "lethargy_index_pct": 0}]

    result = calculate_esi(telemetry, fish_list, mock_species_db)

    assert result["esi_score"] >= 0.70
    assert result["stability_status"] == "Stable"


def test_severe_stress_yields_critical_esi(mock_species_db):
    """Test scenario with high temperature and aggressive fish."""
    telemetry = {"temperature_c": 31.0, "ph": 7.0, "tds_ppm": 200}
    fish_list = [{"species_id": "betta_splendens", "lethargy_index_pct": 20}]

    result = calculate_esi(telemetry, fish_list, mock_species_db)

    assert result["esi_score"] < 0.35
    assert result["stability_status"] == "Critical"


def test_water_chemistry_suboptimal_esi(mock_species_db):
    """Test scenario with acidic pH or high TDS yielding suboptimal stability."""
    telemetry = {"temperature_c": 25.0, "ph": 5.5, "tds_ppm": 450}
    fish_list = [{"species_id": "poecilia_reticulata", "lethargy_index_pct": 0}]

    result = calculate_esi(telemetry, fish_list, mock_species_db)

    assert result["stability_status"] in ["Suboptimal", "Critical"]


def test_fuzzy_engine_with_pydantic_models(mock_species_db):
    """Test that calculate_esi works identically with Pydantic model instances."""
    telemetry = Telemetry(
        temperature_c=25.0,
        ph=7.0,
        tds_ppm=200.0,
        diagnostics=Diagnostics(fault_detected=False, imputed=False),
        gatekeeper=Gatekeeper(heater_lockout=False, ph_pump_lockout=False),
    )
    fish = FishBehavior(
        species_id="poecilia_reticulata",
        common_name="Guppy",
        male=2,
        female=6,
        confidence=0.95,
        swimming_activity_pct=85.0,
        lethargy_index_pct=0.0,
        surface_piping="None",
        feeding_response="Active",
        status="NORMAL_HEALTH",
    )

    result = calculate_esi(telemetry, [fish], mock_species_db)
    assert result["stability_status"] == "Stable"
    assert result["esi_score"] >= 0.70


def test_fuzzy_engine_class_wrapper(mock_species_db):
    """Test FuzzyEngine class wrapper evaluate method."""
    engine = FuzzyEngine()
    telemetry = {"temperature_c": 25.0, "ph": 7.0, "tds_ppm": 200}
    fish_list = [{"species_id": "poecilia_reticulata", "lethargy_index_pct": 0}]

    result = engine.evaluate(telemetry, fish_list, mock_species_db)
    assert result["stability_status"] == "Stable"
