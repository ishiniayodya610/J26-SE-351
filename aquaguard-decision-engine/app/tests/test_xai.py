"""
Unit tests for Explainable AI (XAI) traces and natural language explanations.
"""

from app.xai.rule_trace import RuleTraceCollector, RuleTraceEvent
from app.xai.explanation import ExplanationGenerator


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
