"""
CSP Evaluation Metrics & Benchmark Evaluation Framework.
Phase 12: Testing Strategy & Statistical Accuracy.
"""

import os
import sys
import json

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.csp.csp_engine import evaluate_hard_constraints


def load_data():
    """Load species seed database and benchmark permutations."""
    species_path = os.path.join(BASE_DIR, "data", "species_seed.json")
    if not os.path.exists(species_path):
        species_path = os.path.join(BASE_DIR, "app", "data", "species_seed.json")

    benchmark_path = os.path.join(BASE_DIR, "data", "benchmark_100.json")
    if not os.path.exists(benchmark_path):
        benchmark_path = os.path.join(BASE_DIR, "app", "data", "benchmark_100.json")

    with open(species_path, "r", encoding="utf-8") as f:
        species_db = {s["species_id"]: s for s in json.load(f)}

    with open(benchmark_path, "r", encoding="utf-8") as f:
        benchmarks = json.load(f)["benchmarks"]

    return species_db, benchmarks


def run_csp_evaluation():
    """Runs Test Group A metrics (TP, TN, FP, FN, Accuracy)."""
    species_db, benchmarks = load_data()

    tp = tn = fp = fn = 0

    for bm in benchmarks:
        result = evaluate_hard_constraints(
            bm["aquarium"],
            bm.get("telemetry", {}),
            bm["fish"],
            species_db,
        )

        expected = bm["expected_csp_status"]
        actual = result["status"]

        # In this context:
        # Positive = System correctly identifies a VALID tank (PASS)
        # Negative = System correctly flags an INVALID tank (REJECTED)

        if expected == "PASS" and actual == "PASS":
            tp += 1
        elif expected == "REJECTED" and actual == "REJECTED":
            tn += 1
        elif expected == "REJECTED" and actual == "PASS":
            fp += 1  # System dangerously allowed an invalid tank
        elif expected == "PASS" and actual == "REJECTED":
            fn += 1  # System incorrectly rejected a safe tank

    total = tp + tn + fp + fn
    accuracy = (tp + tn) / total if total > 0 else 0

    print("=== Phase 12: CSP Evaluation Metrics ===")
    print(f"Total Scenarios Tested: {total}")
    print(f"True Positives (TP): {tp}")
    print(f"True Negatives (TN): {tn}")
    print(f"False Positives (FP): {fp}")
    print(f"False Negatives (FN): {fn}")
    print(f"Accuracy: {accuracy * 100:.2f}%\n")

    return {
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "total": total,
        "accuracy": accuracy,
    }


if __name__ == "__main__":
    run_csp_evaluation()
