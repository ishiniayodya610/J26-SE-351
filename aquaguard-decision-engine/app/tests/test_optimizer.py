"""
Unit tests for Genetic Algorithm optimizer and fitness evaluation.
"""

from app.optimizer.constraints import is_valid_individual
from app.optimizer.fitness import evaluate_ecosystem_fitness
from app.optimizer.optimizer import EcosystemOptimizer


def test_individual_validity():
    valid = [25.0, 7.2]
    invalid_temp = [45.0, 7.2]
    invalid_ph = [25.0, 11.0]

    assert is_valid_individual(valid) is True
    assert is_valid_individual(invalid_temp) is False
    assert is_valid_individual(invalid_ph) is False


def test_fitness_evaluation():
    individual = [24.0, 7.0]
    health, cost = evaluate_ecosystem_fitness(individual, [])
    assert health >= 0.0
    assert cost >= 0.0


def test_optimizer_instantiation():
    optimizer = EcosystemOptimizer()
    assert optimizer is not None
    result = optimizer.optimize_parameters([])
    assert "optimal_temperature_c" in result
