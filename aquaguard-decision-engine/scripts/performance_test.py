"""
Performance Profiling Script for AquaGuard Decision Engine Modules.
Phase 13: Module Latency Profiling (CSP, Fuzzy FIS, GA Optimizer, XAI).
"""

import os
import sys
import json
import time

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.csp.csp_engine import evaluate_hard_constraints
from app.fuzzy.fuzzy_engine import calculate_esi
from app.optimizer.optimizer import optimize_population
from app.xai.explanation import generate_csp_explanation


def load_test_data():
    species_path = os.path.join(BASE_DIR, "data", "species_seed.json")
    if not os.path.exists(species_path):
        species_path = os.path.join(BASE_DIR, "app", "data", "species_seed.json")

    with open(species_path, "r", encoding="utf-8") as f:
        species_db = {s["species_id"]: s for s in json.load(f)}

    aquarium = {"volume_liters": 200}
    telemetry = {"temperature_c": 25.0, "ph": 7.0, "tds_ppm": 150}
    fish = [
        {"species_id": "poecilia_reticulata", "male": 5, "female": 10},
        {"species_id": "corydoras_aeneus", "male": 4, "female": 4},
    ]
    return species_db, aquarium, telemetry, fish


def run_performance_tests():
    """Profiles the millisecond latency of each AI module."""
    print("=== Phase 13: Module Latency Profiling ===\n")
    species_db, aquarium, telemetry, fish = load_test_data()

    # 1. Profile CSP Gatekeeper
    start = time.perf_counter()
    evaluate_hard_constraints(aquarium, telemetry, fish, species_db)
    csp_time = (time.perf_counter() - start) * 1000
    print(f"CSP Evaluation Latency:       {csp_time:.2f} ms")

    # 2. Profile Fuzzy FIS Evaluation
    start = time.perf_counter()
    calculate_esi(telemetry, fish, species_db)
    fuzzy_time = (time.perf_counter() - start) * 1000
    print(f"Fuzzy Engine Latency:         {fuzzy_time:.2f} ms")

    # 3. Profile Genetic Algorithm (10 Generations)
    start = time.perf_counter()
    optimize_population(fish, aquarium, telemetry, species_db, generations=10, pop_size=20)
    ga_time = (time.perf_counter() - start) * 1000
    print(f"GA Optimizer Latency:         {ga_time:.2f} ms")

    # 4. Profile XAI Generation
    mock_rej = {"status": "REJECTED", "rule_id": "CSP-001", "species": ["Betta", "Guppy"]}
    start = time.perf_counter()
    generate_csp_explanation(mock_rej)
    xai_time = (time.perf_counter() - start) * 1000
    print(f"XAI Generation Latency:       {xai_time:.2f} ms")

    total_time = csp_time + fuzzy_time + ga_time + xai_time
    print(f"\nTotal API Pipeline Latency:   {total_time:.2f} ms")

    return {
        "csp_time_ms": csp_time,
        "fuzzy_time_ms": fuzzy_time,
        "ga_time_ms": ga_time,
        "xai_time_ms": xai_time,
        "total_time_ms": total_time,
    }


if __name__ == "__main__":
    run_performance_tests()
