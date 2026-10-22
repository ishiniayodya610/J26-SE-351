"""
Unit tests for Genetic Algorithm dynamic population optimizer and fitness evaluation (Phase 6).
"""

import os
import json
import pytest
from app.optimizer.constraints import is_valid_individual, is_valid_population
from app.optimizer.fitness import (
    evaluate_ecosystem_fitness,
    calculate_breeding_suitability,
    evaluate_fitness,
)
from app.optimizer.optimizer import EcosystemOptimizer, optimize_population
from app.fuzzy.fuzzy_engine import calculate_esi


@pytest.fixture
def mock_optimizer_data():
    base_dir = os.path.dirname(os.path.dirname(__file__))

    with open(os.path.join(base_dir, "data", "species_seed.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        species_db = {s["species_id"]: s for s in species_list}

    with open(os.path.join(base_dir, "data", "test_scenarios.json"), "r") as f:
        scenarios_data = json.load(f)

    return species_db, scenarios_data["scenarios"]


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


def test_breeding_suitability_ideal(mock_optimizer_data):
    species_db, _ = mock_optimizer_data
    # corydoras ideal ratio is 2.0 (2 males, 4 females -> current ratio 4/2 = 2.0)
    candidate = [
        {"species_id": "corydoras_aeneus", "male": 2, "female": 4}
    ]
    score = calculate_breeding_suitability(candidate, species_db)
    assert score == pytest.approx(1.0, 0.01)


def test_breeding_suitability_deviation(mock_optimizer_data):
    species_db, _ = mock_optimizer_data
    # corydoras ideal is 2.0, but candidate has 5 males and 1 female (ratio = 0.2)
    # deviation = |2.0 - 0.2| = 1.8 -> score = 1.0 - (1.8 * 0.2) = 0.64
    candidate = [
        {"species_id": "corydoras_aeneus", "male": 5, "female": 1}
    ]
    score = calculate_breeding_suitability(candidate, species_db)
    assert score < 1.0
    assert score == pytest.approx(0.64, 0.01)


def test_breeding_suitability_solitary(mock_optimizer_data):
    species_db, _ = mock_optimizer_data
    # Betta ideal ratio is 0.0 (solitary)
    single_betta = [{"species_id": "betta_splendens", "male": 1, "female": 0}]
    assert calculate_breeding_suitability(single_betta, species_db) == pytest.approx(1.0)

    multiple_bettas = [{"species_id": "betta_splendens", "male": 1, "female": 1}]
    assert calculate_breeding_suitability(multiple_bettas, species_db) == pytest.approx(0.0)


def test_breeding_suitability_empty(mock_optimizer_data):
    species_db, _ = mock_optimizer_data
    assert calculate_breeding_suitability([], species_db) == 0.0


def test_evaluate_fitness_function(mock_optimizer_data):
    species_db, scenarios = mock_optimizer_data
    scenario = scenarios[0]

    fitness = evaluate_fitness(
        candidate_population=scenario["fish"],
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        species_db=species_db,
        fuzzy_engine_func=calculate_esi,
    )

    assert isinstance(fitness, tuple)
    assert len(fitness) == 1
    assert isinstance(fitness[0], float)
    # Scenario 0 is well-conditioned, so fitness should be positive
    assert fitness[0] > 0.0


def test_evaluate_fitness_bioload_penalty(mock_optimizer_data):
    species_db, scenarios = mock_optimizer_data
    scenario = scenarios[0]

    # Normal population in 100L tank
    normal_fitness = evaluate_fitness(
        candidate_population=scenario["fish"],
        aquarium={"volume_liters": 100},
        telemetry=scenario["telemetry"],
        species_db=species_db,
        fuzzy_engine_func=calculate_esi,
    )[0]

    # Heavy population that severely exceeds 80% capacity of a tiny 20L tank
    overcrowded_pop = [
        {"species_id": "corydoras_aeneus", "male": 10, "female": 20},  # 30 * 4L = 120L
    ]
    crowded_fitness = evaluate_fitness(
        candidate_population=overcrowded_pop,
        aquarium={"volume_liters": 20},
        telemetry=scenario["telemetry"],
        species_db=species_db,
        fuzzy_engine_func=calculate_esi,
    )[0]

    assert crowded_fitness < normal_fitness


def test_optimize_population_execution(mock_optimizer_data):
    species_db, scenarios = mock_optimizer_data
    scenario = scenarios[0]

    optimized = optimize_population(
        current_population=scenario["fish"],
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        species_db=species_db,
        generations=5,
        pop_size=10,
    )

    assert isinstance(optimized, list)
    assert len(optimized) == len(scenario["fish"])
    assert is_valid_population(optimized) is True
    for fish in optimized:
        assert "male" in fish and fish["male"] >= 0
        assert "female" in fish and fish["female"] >= 0
        assert "species_id" in fish


def test_optimize_population_empty():
    assert optimize_population([], {"volume_liters": 100}, {}, {}) == []


def test_optimize_population_single_species(mock_optimizer_data):
    species_db, scenarios = mock_optimizer_data
    telemetry = scenarios[0]["telemetry"]
    single_species_pop = [
        {"species_id": "corydoras_aeneus", "male": 2, "female": 3}
    ]

    optimized = optimize_population(
        current_population=single_species_pop,
        aquarium={"volume_liters": 60},
        telemetry=telemetry,
        species_db=species_db,
        generations=3,
        pop_size=6,
    )

    assert len(optimized) == 1
    assert optimized[0]["male"] >= 0
    assert optimized[0]["female"] >= 0


def test_ecosystem_optimizer_class_wrapper(mock_optimizer_data):
    species_db, scenarios = mock_optimizer_data
    scenario = scenarios[0]

    optimizer = EcosystemOptimizer()
    optimized = optimizer.optimize_population(
        current_population=scenario["fish"],
        aquarium=scenario["aquarium"],
        telemetry=scenario["telemetry"],
        species_db=species_db,
        generations=3,
        pop_size=6,
    )

    assert isinstance(optimized, list)
    assert len(optimized) == len(scenario["fish"])


def test_is_valid_population():
    valid = [{"male": 2, "female": 4}, {"male": 0, "female": 1}]
    invalid = [{"male": -1, "female": 4}]

    assert is_valid_population(valid) is True
    assert is_valid_population(invalid) is False
