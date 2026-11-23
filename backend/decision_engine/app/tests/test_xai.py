"""
Unit tests for Explainable AI (XAI) traces and natural language explanations (Test Group D).
Phase 7: The XAI Engine.
"""

import pytest
from app.xai.rule_trace import RuleTraceCollector, RuleTraceEvent
from app.xai.explanation import (
    ExplanationGenerator,
    generate_csp_explanation,
    generate_fuzzy_explanation,
)


def test_rule_trace_collector():
    collector = RuleTraceCollector()
    event = RuleTraceEvent(
        rule_name="temp_check",
        engine="csp",
        inputs={"temp": 28.5},
        output={"status": "compatible"},
        fired=True,
    )
    collector.record(event)
    traces = collector.get_traces()
    assert len(traces) == 1
    assert traces[0]["rule_name"] == "temp_check"


def test_explanation_generator():
    generator = ExplanationGenerator()
    explanation = generator.explain_recommendation(
        action="adjust_temperature",
        parameter="temperature",
        current_val=21.0,
        target_val=25.0,
        reason="Target species requires warmer tropical water.",
    )
    assert "21.0" in explanation
    assert "25.0" in explanation
    assert "tropical water" in explanation


def test_csp_001_explanation():
    """Check that XAI generates the correct human-readable reason for aggression (CSP-001)."""
    mock_csp_result = {
        "status": "REJECTED",
        "rule_id": "CSP-001",
        "species": ["Betta", "Guppy"],
    }

    xai_output = generate_csp_explanation(mock_csp_result)

    assert xai_output["summary"] == "Configuration rejected."
    assert "Betta and Guppy" in xai_output["reason"]
    assert "territorial" in xai_output["reason"]
    assert "remove the territorial species" in xai_output["recommendation"]


def test_csp_003_explanation():
    """Check that XAI correctly formats single-species temperature violations."""
    mock_csp_result = {
        "status": "REJECTED",
        "rule_id": "CSP-003",
        "species": ["Neon Tetra"],
    }

    xai_output = generate_csp_explanation(mock_csp_result)

    assert xai_output["summary"] == "Configuration rejected."
    assert "Neon Tetra" in xai_output["reason"]
    assert "temperature" in xai_output["reason"]
    assert "heater" in xai_output["recommendation"]


def test_csp_002_explanation():
    """Check that XAI correctly explains biological volume capacity violations (CSP-002)."""
    mock_csp_result = {
        "status": "REJECTED",
        "rule_id": "CSP-002",
        "species": ["Guppy", "Swordtail"],
    }

    xai_output = generate_csp_explanation(mock_csp_result)

    assert xai_output["summary"] == "Configuration rejected."
    assert "carrying capacity" in xai_output["reason"]
    assert "Reduce the number of fish or upgrade" in xai_output["recommendation"]


def test_csp_pass_explanation():
    """Check that XAI generates approval message when CSP passes."""
    mock_csp_result = {
        "status": "PASS",
        "reason_code": "ALL_CONSTRAINTS_MET",
    }

    xai_output = generate_csp_explanation(mock_csp_result)

    assert xai_output["summary"] == "Configuration approved."
    assert "All hard biological and spatial constraints are met." in xai_output["reason"]
    assert "Proceed with population optimization." in xai_output["recommendation"]


def test_csp_unknown_rule_fallback():
    """Check fallback behavior when an unrecognized rule ID is encountered."""
    mock_csp_result = {
        "status": "REJECTED",
        "rule_id": "UNKNOWN_RULE_999",
        "species": ["Mystery Snail"],
    }

    xai_output = generate_csp_explanation(mock_csp_result)

    assert xai_output["summary"] == "Configuration rejected."
    assert "violates a core biological rule" in xai_output["reason"]
    assert "Review aquarium parameters" in xai_output["recommendation"]


def test_fuzzy_explanation():
    """Check fuzzy logic ESI explanations across stability statuses."""
    stable_result = {"esi_score": 0.88, "stability_status": "Stable"}
    stable_xai = generate_fuzzy_explanation(stable_result)
    assert stable_xai["summary"] == "Ecosystem stability is stable."
    assert "optimal" in stable_xai["reason"]
    assert stable_xai["esi_score"] == 0.88

    critical_result = {"esi_score": 0.22, "stability_status": "Critical"}
    critical_xai = generate_fuzzy_explanation(critical_result)
    assert critical_xai["summary"] == "Ecosystem stability is critical."
    assert "critical" in critical_xai["reason"].lower()
    assert "immediate corrective action" in critical_xai["recommendation"].lower()


def test_explanation_generator_class_wrapper():
    """Verify class wrapper methods for CSP and Fuzzy explanations."""
    generator = ExplanationGenerator()

    csp_res = generator.explain_csp({"status": "PASS"})
    assert csp_res["summary"] == "Configuration approved."

    fuzzy_res = generator.explain_fuzzy({"esi_score": 0.65, "stability_status": "Suboptimal"})
    assert fuzzy_res["status"] == "Suboptimal"
