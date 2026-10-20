"""
Natural Language Explanation Generator for decisions and recommendations.
"""

from typing import Dict, Any, List
from app.xai.templates import EXPLANATION_TEMPLATES


class ExplanationGenerator:
    def __init__(self, templates: Dict[str, str] = None):
        self.templates = templates or EXPLANATION_TEMPLATES

    def explain_recommendation(
        self, action: str, parameter: str, current_val: float, target_val: float, reason: str
    ) -> str:
        """
        Generate a human-readable justification for a recommended action.
        """
        template = self.templates.get(
            action,
            "Recommendation: {action} on {parameter}. Current: {current_val}, Target: {target_val}. Reason: {reason}",
        )
        return template.format(
            action=action,
            parameter=parameter,
            current_val=current_val,
            target_val=target_val,
            reason=reason,
        )
