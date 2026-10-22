"""
Benchmark evaluation API routes for AquaGuard Decision Engine.
Phase 12: Benchmark Suite Runner.
"""

import os
import json
from typing import Dict, Any, List
from fastapi import APIRouter
from app.csp.csp_engine import evaluate_hard_constraints

router = APIRouter()


def _get_base_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


def _load_species_db() -> Dict[str, Any]:
    base_dir = _get_base_dir()
    path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(path):
        path = os.path.join(base_dir, "app", "data", "species_seed.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        return {s["species_id"]: s for s in species_list}


def _load_benchmarks() -> Dict[str, Any]:
    base_dir = _get_base_dir()
    path = os.path.join(base_dir, "data", "benchmark_100.json")
    if not os.path.exists(path):
        path = os.path.join(base_dir, "app", "data", "benchmark_100.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/")
def get_benchmarks():
    """Returns the benchmark metadata and scenario list."""
    data = _load_benchmarks()
    return {
        "status": "success",
        "dataset_name": data.get("dataset_name"),
        "schema_version": data.get("schema_version"),
        "summary": data.get("summary", {}),
        "total_scenarios": len(data.get("benchmarks", [])),
        "benchmarks": data.get("benchmarks", []),
    }


@router.post("/run")
def run_benchmark_evaluation():
    """Runs all benchmark scenarios through the CSP Gatekeeper and calculates statistical metrics."""
    species_db = _load_species_db()
    benchmarks_data = _load_benchmarks()
    benchmarks = benchmarks_data.get("benchmarks", [])

    tp = tn = fp = fn = 0
    results: List[Dict[str, Any]] = []

    for bm in benchmarks:
        eval_result = evaluate_hard_constraints(
            bm["aquarium"],
            bm.get("telemetry", {}),
            bm["fish"],
            species_db,
        )

        expected = bm["expected_csp_status"]
        actual = eval_result["status"]

        if expected == "PASS" and actual == "PASS":
            tp += 1
            classification = "TP"
        elif expected == "REJECTED" and actual == "REJECTED":
            tn += 1
            classification = "TN"
        elif expected == "REJECTED" and actual == "PASS":
            fp += 1
            classification = "FP"
        else:
            fn += 1
            classification = "FN"

        results.append({
            "id": bm["id"],
            "type": bm.get("type", "unknown"),
            "expected_csp_status": expected,
            "actual_csp_status": actual,
            "classification": classification,
            "match": (expected == actual),
            "reason_code": eval_result.get("reason_code"),
            "rule_id": eval_result.get("rule_id"),
            "species": eval_result.get("species", []),
            "telemetry": bm.get("telemetry", {}),
            "aquarium": bm.get("aquarium", {}),
            "fish": bm.get("fish", []),
        })

    total = tp + tn + fp + fn
    accuracy = (tp + tn) / total if total > 0 else 0.0

    return {
        "status": "success",
        "metrics": {
            "total": total,
            "tp": tp,
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "accuracy": round(accuracy * 100, 2),
        },
        "dataset_name": benchmarks_data.get("dataset_name"),
        "results": results,
    }
