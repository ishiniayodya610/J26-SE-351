"""
Dynamic Overlap Algorithm for calculating strict environmental safe ranges and ESP32 hardware targets.
Phase 14: Dynamic Environmental Target Generation.
"""

from typing import List, Dict, Any, Tuple, Optional


def calculate_environmental_targets(
    fish_list: List[Any], species_db: Dict[str, Any]
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Calculates the overlapping safe parameters for a given list of fish.
    Returns the exact target median for the ESP32 or a conflict error.
    """
    # Default safe targets if the tank is currently empty
    if not fish_list:
        return True, {
            "temperature_c": 25.0,
            "ph": 7.0,
            "tds_ppm": 200
        }, None

    # Initialize wide boundaries
    min_temp, max_temp = 0.0, 100.0
    min_ph, max_ph = 0.0, 14.0
    min_tds, max_tds = 0.0, 2000.0
    
    # Process the intersection algorithm (Max of mins, Min of maxes)
    for fish in fish_list:
        species_id = fish["species_id"] if isinstance(fish, dict) else getattr(fish, "species_id", None)
        if species_id in species_db:
            env = species_db[species_id].get("environment", {})
            
            # Temperature Overlap
            t_env = env.get("temperature") or env.get("temperature_c") or {"min": 0, "max": 100}
            t_min = t_env.get("min")
            t_max = t_env.get("max")
            min_temp = max(min_temp, float(t_min) if t_min is not None else 0.0)
            max_temp = min(max_temp, float(t_max) if t_max is not None else 100.0)
            
            # pH Overlap
            p_env = env.get("ph") or {"min": 0, "max": 14}
            p_min = p_env.get("min")
            p_max = p_env.get("max")
            min_ph = max(min_ph, float(p_min) if p_min is not None else 0.0)
            max_ph = min(max_ph, float(p_max) if p_max is not None else 14.0)
            
            # TDS Overlap
            tds_env = env.get("tds") or env.get("tds_ppm") or {"min": 0, "max": 2000}
            tds_min = tds_env.get("min")
            tds_max = tds_env.get("max")
            min_tds = max(min_tds, float(tds_min) if tds_min is not None else 0.0)
            max_tds = min(max_tds, float(tds_max) if tds_max is not None else 2000.0)

    # Check for negative overlap (a fatal biological conflict)
    conflicts = []
    if min_temp > max_temp:
        conflicts.append("Temperature ranges do not overlap safely.")
    if min_ph > max_ph:
        conflicts.append("pH ranges do not overlap safely.")
    if min_tds > max_tds:
        conflicts.append("TDS (water hardness) ranges do not overlap safely.")
        
    # If the mathematical overlap fails, return a rejection for the XAI engine
    if conflicts:
        return False, None, {
            "status": "REJECTED",
            "rule_id": "CSP-004",  # New rule for Dynamic Overlap Failure
            "reason_code": "ENVIRONMENT_CONFLICT",
            "explanation": " ".join(conflicts)
        }
        
    # Calculate the median of the valid overlap for the ESP32
    esp32_targets = {
        "temperature_c": round((min_temp + max_temp) / 2.0, 1),
        "ph": round((min_ph + max_ph) / 2.0, 1),
        "tds_ppm": int((min_tds + max_tds) / 2)
    }
    
    return True, esp32_targets, None
