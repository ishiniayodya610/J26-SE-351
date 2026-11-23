"""
Constraint validation and penalty functions for Genetic Algorithm individuals.
Phase 6: Dynamic Population Optimizer constraints.
"""

from typing import List, Any


def is_valid_individual(individual: List[float]) -> bool:
    """
    Check if the gene values fall within biologically plausible boundaries:
    temp: [18.0, 32.0], pH: [5.5, 8.5]
    """
    if len(individual) < 2:
        return False
    temp, ph = individual[0], individual[1]
    if not (18.0 <= temp <= 32.0):
        return False
    if not (5.5 <= ph <= 8.5):
        return False
    return True


def is_valid_population(candidate_population: List[Any]) -> bool:
    """
    Check if candidate fish population has valid non-negative counts.
    """
    for fish in candidate_population:
        male = fish.get("male", 0) if isinstance(fish, dict) else getattr(fish, "male", 0)
        female = fish.get("female", 0) if isinstance(fish, dict) else getattr(fish, "female", 0)
        if male < 0 or female < 0:
            return False
    return True
