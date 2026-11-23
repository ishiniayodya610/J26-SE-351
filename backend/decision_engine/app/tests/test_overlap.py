"""
Unit tests for Phase 14: Dynamic Overlap Algorithm for ESP32 target generation.
"""

import os
import json
import pytest
from app.csp.overlap import calculate_environmental_targets
from app.models.species import FishBehavior


@pytest.fixture
def sample_species_db():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    target_path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(target_path):
        target_path = os.path.join(base_dir, "app", "data", "species_seed.json")

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        return {s["species_id"]: s for s in species_list}


def test_empty_population_defaults(sample_species_db):
    """Empty fish population should return safe standard baseline targets."""
    success, targets, error = calculate_environmental_targets([], sample_species_db)
    assert success is True
    assert error is None
    assert targets == {
        "temperature_c": 25.0,
        "ph": 7.0,
        "tds_ppm": 200
    }


def test_valid_community_overlap(sample_species_db):
    """Compatible species (Guppy and Corydoras) should produce an exact median target."""
    fish_list = [
        {"species_id": "poecilia_reticulata", "male": 2, "female": 4},
        {"species_id": "corydoras_aeneus", "male": 3, "female": 3}
    ]
    success, targets, error = calculate_environmental_targets(fish_list, sample_species_db)
    assert success is True
    assert error is None
    assert targets is not None
    assert "temperature_c" in targets
    assert "ph" in targets
    assert "tds_ppm" in targets
    # Guppy (17-28°C), Corydoras (21-27°C) -> Overlap [21, 27] -> Median 24.0°C
    assert targets["temperature_c"] == 24.0
    # Guppy (7.0-8.5), Corydoras (6.0-8.0) -> Overlap [7.0, 8.0] -> Median 7.5
    assert targets["ph"] == 7.5


def test_temperature_conflict_rejection():
    """Mock species with non-overlapping thermal windows should trigger CSP-004."""
    mock_db = {
        "cold_fish": {
            "environment": {
                "temperature": {"min": 14.0, "max": 18.0},
                "ph": {"min": 6.5, "max": 7.5},
                "tds": {"min": 100, "max": 200}
            }
        },
        "tropical_fish": {
            "environment": {
                "temperature": {"min": 26.0, "max": 30.0},
                "ph": {"min": 6.5, "max": 7.5},
                "tds": {"min": 100, "max": 200}
            }
        }
    }
    fish_list = [
        {"species_id": "cold_fish"},
        {"species_id": "tropical_fish"}
    ]
    success, targets, error = calculate_environmental_targets(fish_list, mock_db)
    assert success is False
    assert targets is None
    assert error["status"] == "REJECTED"
    assert error["rule_id"] == "CSP-004"
    assert error["reason_code"] == "ENVIRONMENT_CONFLICT"
    assert "Temperature ranges do not overlap" in error["explanation"]


def test_ph_conflict_rejection():
    """Mock species with non-overlapping pH windows should trigger CSP-004."""
    mock_db = {
        "acidic_fish": {
            "environment": {
                "temperature": {"min": 22.0, "max": 26.0},
                "ph": {"min": 4.5, "max": 6.0},
                "tds": {"min": 50, "max": 150}
            }
        },
        "alkaline_fish": {
            "environment": {
                "temperature": {"min": 22.0, "max": 26.0},
                "ph": {"min": 7.8, "max": 8.8},
                "tds": {"min": 50, "max": 150}
            }
        }
    }
    fish_list = [
        {"species_id": "acidic_fish"},
        {"species_id": "alkaline_fish"}
    ]
    success, targets, error = calculate_environmental_targets(fish_list, mock_db)
    assert success is False
    assert targets is None
    assert error["status"] == "REJECTED"
    assert error["rule_id"] == "CSP-004"
    assert "pH ranges do not overlap" in error["explanation"]


def test_pydantic_model_compatibility(sample_species_db):
    """Ensure FishBehavior Pydantic instances work interchangeably with dictionaries."""
    fish_models = [
        FishBehavior(
            species_id="poecilia_reticulata",
            common_name="Guppy",
            male=1,
            female=3,
            confidence=0.95,
            swimming_activity_pct=75.0,
            lethargy_index_pct=0.0,
            surface_piping="None",
            feeding_response="Active",
            status="NORMAL_HEALTH"
        ),
        FishBehavior(
            species_id="corydoras_aeneus",
            common_name="Corydoras",
            male=2,
            female=2,
            confidence=0.95,
            swimming_activity_pct=75.0,
            lethargy_index_pct=0.0,
            surface_piping="None",
            feeding_response="Active",
            status="NORMAL_HEALTH"
        )
    ]
    success, targets, error = calculate_environmental_targets(fish_models, sample_species_db)
    assert success is True
    assert error is None
    assert targets["temperature_c"] == 24.0
