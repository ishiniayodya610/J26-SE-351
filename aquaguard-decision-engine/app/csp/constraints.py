"""
Constraint definitions and validation functions for CSP solver.
"""

from typing import List, Dict, Any


def _extract_param(species: Dict[str, Any], key: str, fallback_key: str) -> Dict[str, float]:
    if "environment" in species and isinstance(species["environment"], dict):
        if key in species["environment"]:
            return species["environment"][key]
    return species.get(fallback_key, species.get(key, {}))


def check_temperature_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """
    Check if two species have overlapping viable temperature ranges.
    """
    temp_a = _extract_param(species_a, "temperature", "temperature_c")
    temp_b = _extract_param(species_b, "temperature", "temperature_c")
    overlap_min = max(temp_a.get("min", 0), temp_b.get("min", 0))
    overlap_max = min(temp_a.get("max", 100), temp_b.get("max", 100))
    return overlap_min <= overlap_max


def check_ph_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """
    Check if two species have overlapping viable pH ranges.
    """
    ph_a = _extract_param(species_a, "ph", "ph")
    ph_b = _extract_param(species_b, "ph", "ph")
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
