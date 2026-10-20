"""
Constraint validation and penalty functions for Genetic Algorithm individuals.
"""

from typing import List


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
