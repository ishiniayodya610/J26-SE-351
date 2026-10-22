"""
Unit tests for Benchmark Evaluation and CSP statistical metrics (Phase 12).
"""

import os
import json
import pytest
from scripts.evaluate_metrics import load_data, run_csp_evaluation


def test_benchmark_dataset_integrity():
    """Verify that benchmark dataset loads valid schemas and has test cases."""
    species_db, benchmarks = load_data()
    assert len(benchmarks) >= 2
    assert len(species_db) > 0

    for bm in benchmarks:
        assert "id" in bm
        assert "type" in bm
        assert bm["expected_csp_status"] in ["PASS", "REJECTED"]
        assert "aquarium" in bm
        assert "fish" in bm
        assert len(bm["fish"]) > 0


def test_csp_metrics_evaluation():
    """Verify CSP evaluation metrics computation and statistical accuracy."""
    metrics = run_csp_evaluation()

    assert metrics["total"] > 0
    assert metrics["fp"] == 0  # Zero False Positives (no invalid tanks dangerously approved)
    assert metrics["fn"] == 0  # Zero False Negatives (no valid tanks incorrectly rejected)
    assert metrics["accuracy"] >= 0.95  # Target accuracy >= 95%
