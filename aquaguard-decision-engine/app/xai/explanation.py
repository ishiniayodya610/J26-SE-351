"""
Natural Language Explanation Generator for decisions and recommendations.
Phase 7: The XAI Engine.
"""

from typing import Dict, Any, Optional
from app.xai.templates import (
    CSP_TEMPLATES,
    RECOMMENDATION_TEMPLATES,
    FUZZY_TEMPLATES,
    FUZZY_RECOMMENDATION_TEMPLATES,
    EXPLANATION_TEMPLATES,
)


def generate_csp_explanation(csp_result: Dict[str, Any]) -> Dict[str, str]:
    """
    Generates natural language explanations for CSP evaluations based on rule mapping.
    """
    if csp_result.get("status") == "PASS":
        return {
            "summary": "Configuration approved.",
            "reason": "All hard biological and spatial constraints are met.",
            "recommendation": "Proceed with population optimization.",
        }

    rule_id = csp_result.get("rule_id")
    species_list = csp_result.get("species", [])

    # Format the species list neatly (e.g., "Betta and Guppy")
    species_str = " and ".join(species_list) if species_list else "The selected species"

    # Fetch and format templates
    reason_template = CSP_TEMPLATES.get(rule_id, "Configuration violates a core biological rule.")
    reason_text = reason_template.format(species=species_str)

    recommendation_text = RECOMMENDATION_TEMPLATES.get(
        rule_id, "Review aquarium parameters and fish compatibility."
    )

    return {
        "summary": "Configuration rejected.",
        "reason": reason_text,
        "recommendation": recommendation_text,
    }


def generate_fuzzy_explanation(fuzzy_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates natural language explanations for Fuzzy Logic ESI results.
    """
    status = fuzzy_result.get("stability_status", "Suboptimal")
    esi_score = fuzzy_result.get("esi_score", 0.5)

    reason_template = FUZZY_TEMPLATES.get(
        status, "Ecosystem stability index is {esi_score}."
    )
    reason_text = reason_template.format(status=status, esi_score=esi_score)

    recommendation_text = FUZZY_RECOMMENDATION_TEMPLATES.get(
        status, "Review water parameters and monitor aquatic behavior."
    )

    return {
        "summary": f"Ecosystem stability is {status.lower()}.",
        "status": status,
        "esi_score": esi_score,
        "reason": reason_text,
        "recommendation": recommendation_text,
    }


class ExplanationGenerator:
    """Class wrapper for generating explanations across reasoning engines."""

    def __init__(self, templates: Optional[Dict[str, str]] = None):
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

    def explain_csp(self, csp_result: Dict[str, Any]) -> Dict[str, str]:
        """Explain CSP gatekeeper evaluation result."""
        return generate_csp_explanation(csp_result)

    def explain_fuzzy(self, fuzzy_result: Dict[str, Any]) -> Dict[str, Any]:
        """Explain Fuzzy inference ESI result."""
        return generate_fuzzy_explanation(fuzzy_result)
