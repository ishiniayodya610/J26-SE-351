"""
Explainable AI (XAI) module for reasoning engine traceability and explanations.
Phase 7: The XAI Engine.
"""

from app.xai.explanation import (
    ExplanationGenerator,
    generate_csp_explanation,
    generate_fuzzy_explanation,
)
from app.xai.rule_trace import RuleTraceCollector, RuleTraceEvent
from app.xai.templates import (
    CSP_TEMPLATES,
    RECOMMENDATION_TEMPLATES,
    FUZZY_TEMPLATES,
    FUZZY_RECOMMENDATION_TEMPLATES,
    EXPLANATION_TEMPLATES,
)

__all__ = [
    "ExplanationGenerator",
    "generate_csp_explanation",
    "generate_fuzzy_explanation",
    "RuleTraceCollector",
    "RuleTraceEvent",
    "CSP_TEMPLATES",
    "RECOMMENDATION_TEMPLATES",
    "FUZZY_TEMPLATES",
    "FUZZY_RECOMMENDATION_TEMPLATES",
    "EXPLANATION_TEMPLATES",
]
