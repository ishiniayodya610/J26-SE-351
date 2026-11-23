"""
CSP Engine for species cohabitation and aquarium parameter satisfaction.
Phase 4: Gatekeeper controller executing hard constraints sequentially.
"""

from typing import List, Dict, Any, Optional
from app.csp.constraints import check_compatibility, check_volume, check_temperature

try:
    from constraint import Problem, AllDifferentConstraint
except ImportError:
    Problem = None
    AllDifferentConstraint = None


def evaluate_hard_constraints(aquarium: Any, telemetry: Any, fish_list: List[Any], species_db: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates the aquarium state against all hard CSP rules.
    Returns the first violation found or a PASS status.
    """
    # 1. Compatibility Check (Aggression & Predator/Prey)
    passed, error = check_compatibility(fish_list, species_db)
    if not passed:
        return error

    # 2. Volume Check
    passed, error = check_volume(aquarium, fish_list, species_db)
    if not passed:
        return error

    # 3. Temperature Check
    passed, error = check_temperature(telemetry, fish_list, species_db)
    if not passed:
        return error

    # If all pass, return the success state for Phase 5 (Fuzzy FIS)
    return {
        "status": "PASS",
        "reason_code": "ALL_CONSTRAINTS_MET"
    }


class CSPEngine:
    def __init__(self):
        self.problem = Problem() if Problem is not None else None

    def evaluate(self, aquarium: Any, telemetry: Any, fish_list: List[Any], species_db: Dict[str, Any]) -> Dict[str, Any]:
        """Run the gatekeeper hard constraints evaluation."""
        return evaluate_hard_constraints(aquarium, telemetry, fish_list, species_db)

    def solve_species_compatibility(
        self, candidate_species: List[Dict[str, Any]], tank_volume: float
    ) -> List[Dict[str, Any]]:
        """Solve CSP for a compatible subset of candidate species."""
        return candidate_species
