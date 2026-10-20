"""
Unit tests for CSP engine and species compatibility constraints.
"""

from app.csp.constraints import (
    check_temperature_compatibility,
    check_ph_compatibility,
    check_temperament_compatibility,
)
from app.csp.csp_engine import CSPEngine


def test_temperature_compatibility():
    species_a = {"temperature_c": {"min": 22.0, "max": 28.0}}
    species_b = {"temperature_c": {"min": 24.0, "max": 30.0}}
    species_incompatible = {"temperature_c": {"min": 10.0, "max": 18.0}}

    assert check_temperature_compatibility(species_a, species_b) is True
    assert check_temperature_compatibility(species_a, species_incompatible) is False


def test_temperament_compatibility():
    peaceful = {"temperament": "peaceful"}
    aggressive = {"temperament": "aggressive"}

    assert check_temperament_compatibility(peaceful, peaceful) is True
    assert check_temperament_compatibility(peaceful, aggressive) is False


def test_csp_engine_initialization():
    engine = CSPEngine()
    result = engine.solve_species_compatibility([], 100.0)
    assert isinstance(result, list)
