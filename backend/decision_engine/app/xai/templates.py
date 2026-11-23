"""
Explanation templates for translating reasoning traces and evaluation outputs to human-interpretable explanations.
Phase 7: The XAI Engine.
"""

# Rule ID to Reason mapping for CSP hard constraints
CSP_TEMPLATES = {
    "CSP-001": "{species} have a high territorial and fin-conflict risk under the configured biological rule.",
    "CSP-002": "The proposed population exceeds the biological carrying capacity (volume) of the aquarium.",
    "CSP-003": "The current temperature is outside the strict biological boundaries for {species}.",
    "CSP-004": "Environmental requirements (temperature, pH, or TDS) do not overlap safely for {species}."
}

# Rule ID to Recommendation mapping for CSP hard constraints
RECOMMENDATION_TEMPLATES = {
    "CSP-001": "Choose a compatible community species or remove the territorial species.",
    "CSP-002": "Reduce the number of fish or upgrade to a larger aquarium.",
    "CSP-003": "Adjust the aquarium heater to match the safe parameters for all housed species.",
    "CSP-004": "Select species with compatible water chemistry parameters (temperature, pH, and hardness)."
}

# Fuzzy ESI Stability reason mapping
FUZZY_TEMPLATES = {
    "Stable": "Ecosystem stability is optimal (ESI score: {esi_score}). Water parameters and behavioral metrics are well-balanced.",
    "Suboptimal": "Ecosystem stability is suboptimal (ESI score: {esi_score}). Minor stress indicators or parameter shifts detected.",
    "Critical": "Ecosystem stability is critical (ESI score: {esi_score}). Extreme stress or severe water quality degradation detected."
}

# Fuzzy ESI Stability recommendation mapping
FUZZY_RECOMMENDATION_TEMPLATES = {
    "Stable": "Maintain current water parameters and regular maintenance routine.",
    "Suboptimal": "Monitor water parameters closely, verify filtration, and perform a partial water change if needed.",
    "Critical": "Take immediate corrective action: inspect filter, verify heater/aeration, and perform emergency water test."
}

# Legacy/parameter recommendation templates
EXPLANATION_TEMPLATES = {
    "adjust_temperature": (
        "Adjust temperature from {current_val}°C toward {target_val}°C. "
        "Biological justification: {reason}"
    ),
    "adjust_ph": (
        "Buffer water pH from {current_val} to {target_val}. "
        "Biological justification: {reason}"
    ),
    "water_change": (
        "Perform a {target_val}% partial water change. "
        "Reason: {reason}"
    ),
    "incompatible_species": (
        "Warning: Species cohabitation conflict detected between {parameter}. "
        "Reason: {reason}"
    ),
}
