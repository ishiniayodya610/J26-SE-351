"""
Constraint definitions and validation functions for CSP solver.
Phase 4: CSP Gatekeeper Hard Constraints with Structured XAI Rejection Format.
"""

from typing import List, Dict, Any, Tuple, Optional


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to access attributes from dictionaries or Pydantic models uniformly."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def check_compatibility(fish_list: List[Any], species_db: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Rule 1 & Rule 4: Reject based on aggression and predator/prey compatibility mapping.
    """
    species_ids = [_get(f, "species_id") for f in fish_list if _get(f, "species_id") in species_db]

    for i in range(len(species_ids)):
        for j in range(i + 1, len(species_ids)):
            species_a = species_ids[i]
            species_b = species_ids[j]

            # Check compatibility mapping in the database
            compat_a = species_db[species_a].get("compatibility", {})
            compat_b = species_db[species_b].get("compatibility", {})

            if compat_a.get(species_b) == "high_risk" or compat_b.get(species_a) == "high_risk":
                return False, {
                    "status": "REJECTED",
                    "reason_code": "AGGRESSION_CONFLICT",
                    "species": [species_db[species_a]["common_name"], species_db[species_b]["common_name"]],
                    "rule_id": "CSP-001",
                }
    return True, None


def check_volume(aquarium: Any, fish_list: List[Any], species_db: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """Rule 2: Reject if required volume exceeds aquarium capacity."""
    tank_vol = _get(aquarium, "volume_liters", 0)

    required_volume = 0.0
    for fish in fish_list:
        species_id = _get(fish, "species_id")
        if species_id in species_db:
            # Fetch the specific minimum volume required for this species (defaulting to 3L if missing)
            species_min_vol = species_db[species_id].get("environment", {}).get("min_volume_liters", 3.0)
            fish_count = _get(fish, "male", 0) + _get(fish, "female", 0)
            required_volume += (species_min_vol * fish_count)

    if required_volume > tank_vol:
        return False, {
            "status": "REJECTED",
            "reason_code": "VOLUME_EXCEEDED",
            "species": [
                species_db[_get(f, "species_id")]["common_name"]
                for f in fish_list
                if _get(f, "species_id") in species_db
            ],
            "rule_id": "CSP-002",
        }
    return True, None


def check_temperature(telemetry: Any, fish_list: List[Any], species_db: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Rule 3: Reject if current temperature is outside a species' strict min/max boundaries.
    """
    current_temp = _get(telemetry, "temperature_c", 25.0)
    violating_species = []

    for fish in fish_list:
        species_id = _get(fish, "species_id")
        if species_id in species_db:
            db_env = species_db[species_id].get("environment", {}).get("temperature", {})
            min_temp = db_env.get("min", 0)
            max_temp = db_env.get("max", 100)

            if current_temp < min_temp or current_temp > max_temp:
                name = species_db[species_id].get("common_name", species_id)
                if name not in violating_species:
                    violating_species.append(name)

    if violating_species:
        return False, {
            "status": "REJECTED",
            "reason_code": "TEMPERATURE_VIOLATION",
            "species": violating_species,
            "rule_id": "CSP-003",
        }
    return True, None


# Pairwise compatibility utilities
def _extract_param(species: Dict[str, Any], key: str, fallback_key: str) -> Dict[str, float]:
    if "environment" in species and isinstance(species["environment"], dict):
        if key in species["environment"]:
            return species["environment"][key]
    return species.get(fallback_key, species.get(key, {}))


def check_temperature_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """Check if two species have overlapping viable temperature ranges."""
    temp_a = _extract_param(species_a, "temperature", "temperature_c")
    temp_b = _extract_param(species_b, "temperature", "temperature_c")
    overlap_min = max(temp_a.get("min", 0), temp_b.get("min", 0))
    overlap_max = min(temp_a.get("max", 100), temp_b.get("max", 100))
    return overlap_min <= overlap_max


def check_ph_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """Check if two species have overlapping viable pH ranges."""
    ph_a = _extract_param(species_a, "ph", "ph")
    ph_b = _extract_param(species_b, "ph", "ph")
    overlap_min = max(ph_a.get("min", 0), ph_b.get("min", 0))
    overlap_max = min(ph_a.get("max", 14), ph_b.get("max", 14))
    return overlap_min <= overlap_max


def check_temperament_compatibility(species_a: Dict[str, Any], species_b: Dict[str, Any]) -> bool:
    """Ensure aggressive species are not paired with docile/peaceful species."""
    temp_a = species_a.get("temperament", "peaceful")
    temp_b = species_b.get("temperament", "peaceful")
    if "aggressive" in (temp_a, temp_b) and "peaceful" in (temp_a, temp_b):
        return False
    return True
