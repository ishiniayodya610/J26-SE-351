"""
Fuzzy Logic Inference module for evaluating aquarium water quality and health risks.
Phase 5: Fuzzy Stability Engine.
"""

from app.fuzzy.fuzzy_engine import FuzzyEngine, calculate_esi
from app.fuzzy.membership import setup_fuzzy_variables
from app.fuzzy.rules import get_fuzzy_rules

__all__ = ["FuzzyEngine", "calculate_esi", "setup_fuzzy_variables", "get_fuzzy_rules"]
