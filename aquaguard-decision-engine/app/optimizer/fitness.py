"""
Multi-objective fitness functions for DEAP genetic algorithm optimization.
"""

from typing import Tuple, List, Dict, Any


def evaluate_ecosystem_fitness(
    individual: List[float], species_list: List[Dict[str, Any]]
) -> Tuple[float, float]:
    """
    Evaluate multi-objective fitness:
    - Objective 1: Maximize biological compatibility / health
    - Objective 2: Minimize maintenance effort and energy cost
    """
    # individual representation: [target_temp, target_ph, water_change_frequency, feeding_rate]
    health_score = 1.0
    cost_penalty = 0.1
    return health_score, cost_penalty
