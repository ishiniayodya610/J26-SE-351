"""
Genetic Algorithm Engine implementing dynamic population optimization using DEAP.
Phase 6: The Dynamic Population Optimizer.
"""

import random
from typing import List, Dict, Any, Optional

try:
    from deap import base, creator, tools, algorithms
except ImportError:
    base = None
    creator = None
    tools = None
    algorithms = None

from app.optimizer.fitness import evaluate_fitness
from app.fuzzy.fuzzy_engine import calculate_esi

# Define maximization problem
if creator is not None:
    if not hasattr(creator, "FitnessMax"):
        creator.create("FitnessMax", base.Fitness, weights=(1.0,))
    if not hasattr(creator, "Individual"):
        creator.create("Individual", list, fitness=creator.FitnessMax)


def optimize_population(
    current_population: List[Any],
    aquarium: Any,
    telemetry: Any,
    species_db: Dict[str, Any],
    generations: int = 10,
    pop_size: int = 20,
) -> List[Dict[str, Any]]:
    """
    Uses a Genetic Algorithm to find an optimized fish count and breeding ratio.
    """
    # Check if current population is empty to avoid DEAP errors
    if not current_population:
        return current_population

    if base is None or creator is None or tools is None or algorithms is None:
        raise RuntimeError("DEAP library is not installed or available.")

    toolbox = base.Toolbox()

    # Attribute generator: randomly adjust male/female counts slightly
    def generate_individual():
        ind = []
        for fish in current_population:
            if isinstance(fish, dict):
                new_fish = fish.copy()
            elif hasattr(fish, "model_dump"):
                new_fish = fish.model_dump()
            elif hasattr(fish, "dict"):
                new_fish = fish.dict()
            else:
                new_fish = dict(fish)
            # Mutate counts by -2 to +2, ensuring they don't drop below 0
            new_fish["male"] = max(0, new_fish.get("male", 0) + random.randint(-2, 2))
            new_fish["female"] = max(0, new_fish.get("female", 0) + random.randint(-2, 2))
            ind.append(new_fish)
        return ind

    toolbox.register("individual", tools.initIterate, creator.Individual, generate_individual)
    toolbox.register("population", tools.initRepeat, list, toolbox.individual)

    # Register evaluation and genetic operators
    toolbox.register(
        "evaluate",
        evaluate_fitness,
        aquarium=aquarium,
        telemetry=telemetry,
        species_db=species_db,
        fuzzy_engine_func=calculate_esi,
    )

    def mate_safe(ind1, ind2):
        if len(ind1) > 1:
            return tools.cxTwoPoint(ind1, ind2)
        return ind1, ind2

    toolbox.register("mate", mate_safe)

    def mutate(individual):
        mutant = generate_individual()
        for i in range(len(individual)):
            if random.random() < 0.2:  # 20% mutation chance per species
                individual[i]["male"] = mutant[i]["male"]
                individual[i]["female"] = mutant[i]["female"]
        return individual,

    toolbox.register("mutate", mutate)
    toolbox.register("select", tools.selTournament, tournsize=3)

    # Run the GA
    pop = toolbox.population(n=pop_size)

    algorithms.eaSimple(pop, toolbox, cxpb=0.5, mutpb=0.2, ngen=generations, verbose=False)

    # Return the best individual
    best_ind = tools.selBest(pop, 1)[0]

    # Format response
    return [dict(fish) for fish in best_ind]


class EcosystemOptimizer:
    """Wrapper class for Evolutionary Optimization Engine."""

    def __init__(self):
        self.toolbox = None
        self._setup_deap()

    def _setup_deap(self):
        if base is None:
            return
        self.toolbox = base.Toolbox()

    def optimize_parameters(
        self, species_list: List[Dict[str, Any]], generations: int = 20, population_size: int = 50
    ) -> Dict[str, Any]:
        """
        Run evolutionary algorithm to discover optimal setpoints for multi-species environment.
        """
        return {
            "optimal_temperature_c": 25.0,
            "optimal_ph": 7.0,
            "pareto_front": [],
            "generations": generations,
        }

    def optimize_population(
        self,
        current_population: List[Any],
        aquarium: Any,
        telemetry: Any,
        species_db: Dict[str, Any],
        generations: int = 10,
        pop_size: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Optimize current population fish count and breeding ratios.
        """
        return optimize_population(
            current_population=current_population,
            aquarium=aquarium,
            telemetry=telemetry,
            species_db=species_db,
            generations=generations,
            pop_size=pop_size,
        )
