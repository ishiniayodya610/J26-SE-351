"""
Genetic Algorithm Optimizer module for dynamic population and aquarium parameter optimization.
Phase 6: The Dynamic Population Optimizer.
"""

from app.optimizer.optimizer import EcosystemOptimizer, optimize_population
from app.optimizer.fitness import (
    evaluate_fitness,
    calculate_breeding_suitability,
    calculate_territorial_overlap,
    evaluate_ecosystem_fitness,
)
from app.optimizer.constraints import is_valid_individual, is_valid_population

__all__ = [
    "EcosystemOptimizer",
    "optimize_population",
    "evaluate_fitness",
    "calculate_breeding_suitability",
    "calculate_territorial_overlap",
    "evaluate_ecosystem_fitness",
    "is_valid_individual",
    "is_valid_population",
]
