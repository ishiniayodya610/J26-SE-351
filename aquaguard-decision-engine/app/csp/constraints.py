"""
Constraint definitions and validation functions for CSP solver.
"""

from typing import List, Dict, Any


def check_temperature_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """
    Check if two species have overlapping viable temperature ranges.
    """
    temp_a = species_a.get("temperature_c", {})
    temp_b = species_b.get("temperature_c", {})
    overlap_min = max(temp_a.get("min", 0), temp_b.get("min", 0))
    overlap_max = min(temp_a.get("max", 100), temp_b.get("max", 100))
    return overlap_min <= overlap_max


def check_ph_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """
    Check if two species have overlapping viable pH ranges.
    """
    ph_a = species_a.get("ph", {})
    ph_b = species_b.get("ph", {})
    overlap_min = max(ph_a.get("min", 0), ph_b.get("min", 0))
    overlap_max = min(ph_a.get("max", 14), ph_b.get("max", 14))
    return overlap_min <= overlap_max


def check_temperament_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """
    Ensure aggressive species are not paired with docile/peaceful species.
    """
    temp_a = species_a.get("temperament", "peaceful")
    temp_b = species_b.get("temperament", "peaceful")
    if "aggressive" in (temp_a, temp_b) and "peaceful" in (temp_a, temp_b):
        return False
    return True
