"""
Multi-objective fitness functions and constraint penalties for DEAP genetic algorithm optimization.
Phase 6: The Dynamic Population Optimizer.
"""

from typing import Tuple, List, Dict, Any


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to access attributes from dictionaries or Pydantic models uniformly."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def calculate_breeding_suitability(candidate_population: List[Any], species_db: Dict[str, Any]) -> float:
    """Calculates how close the population is to the ideal male/female ratio."""
    score = 0.0
    total_species = 0

    for fish in candidate_population:
        species_id = _get(fish, "species_id")
        if species_id in species_db:
            species_info = species_db[species_id]
            breeding_info = _get(species_info, "breeding", {})
            ideal_ratio = _get(breeding_info, "male_female_ratio", None)
            if ideal_ratio is None:
                target_ratio = _get(breeding_info, "target_male_to_female_ratio")
                if isinstance(target_ratio, dict) and target_ratio.get("male", 0) > 0:
                    ideal_ratio = float(target_ratio.get("female", 0) / target_ratio["male"])
                else:
                    ideal_ratio = 0.0

            males = _get(fish, "male", 0)
            females = _get(fish, "female", 0)

            if ideal_ratio > 0 and males > 0:
                current_ratio = females / males
                # Penalize deviation from the ideal ratio
                deviation = abs(ideal_ratio - current_ratio)
                score += max(0.0, 1.0 - (deviation * 0.2))
            elif ideal_ratio == 0:
                # Species that shouldn't breed or are solitary (e.g., Betta)
                score += 1.0 if (males + females) <= 1 else 0.0

            total_species += 1

    return score / total_species if total_species > 0 else 0.0


def calculate_territorial_overlap(candidate_population: List[Any], species_db: Dict[str, Any]) -> float:
    """
    Calculates territorial overlap penalty for species occupying the same spatial zones.
    Simplified for Phase 6.
    """
    return 0.0


def evaluate_fitness(
    candidate_population: List[Any],
    aquarium: Any,
    telemetry: Any,
    species_db: Dict[str, Any],
    fuzzy_engine_func: Any,
) -> Tuple[float]:
    """
    Fitness = (w1 * ESI) + (w2 * Breeding) - (w3 * Bioload) - (w4 * Territory).
    """
    # Weights
    w1, w2, w3, w4 = 0.4, 0.3, 0.2, 0.1

    # 1. ESI (Ecosystem Stability Index)
    # We pass the candidate population to the fuzzy engine
    fuzzy_result = fuzzy_engine_func(telemetry, candidate_population, species_db)
    esi_score = _get(fuzzy_result, "esi_score", 0.0)

    # 2. Breeding Suitability
    breeding_score = calculate_breeding_suitability(candidate_population, species_db)

    # 3. Bioload Penalty
    tank_vol = _get(aquarium, "volume_liters", 60)
    required_volume = 0.0
    for f in candidate_population:
        f_species_id = _get(f, "species_id")
        f_species = species_db.get(f_species_id, {}) if isinstance(species_db, dict) else {}
        env = _get(f_species, "environment", {})
        min_vol = _get(env, "min_volume_liters") or _get(_get(f_species, "aquarium_requirements", {}), "min_volume_liters", 3.0)
        fish_count = _get(f, "male", 0) + _get(f, "female", 0)
        required_volume += fish_count * min_vol

    bioload_penalty = max(0.0, (required_volume / tank_vol) - 0.8) if tank_vol > 0 else 0.0  # Penalize if over 80% capacity

    # 4. Territorial Overlap Penalty (Simplified for Phase 6)
    territory_penalty = calculate_territorial_overlap(candidate_population, species_db)

    # Final Fitness Calculation
    fitness = (w1 * esi_score) + (w2 * breeding_score) - (w3 * bioload_penalty) - (w4 * territory_penalty)

    # Return as a tuple because DEAP expects an iterable for fitness values
    return (fitness,)


def evaluate_ecosystem_fitness(
    individual: List[float], species_list: List[Dict[str, Any]]
) -> Tuple[float, float]:
    """
    Evaluate multi-objective fitness (legacy/placeholder helper):
    - Objective 1: Maximize biological compatibility / health
    - Objective 2: Minimize maintenance effort and energy cost
    """
    health_score = 1.0
    cost_penalty = 0.1
    return health_score, cost_penalty
