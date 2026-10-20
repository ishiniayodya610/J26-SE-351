"""
Unit tests for Fuzzy Logic inference engine and membership functions.
"""

from app.fuzzy.fuzzy_engine import FuzzyEngine


def test_fuzzy_engine_instantiation():
    engine = FuzzyEngine()
    assert engine is not None


def test_fuzzy_engine_evaluation_fallback_or_run():
    engine = FuzzyEngine()
    result = engine.evaluate(temperature=24.0, ph=7.0, ammonia=0.0)
    assert "risk_score" in result
    assert "status" in result
