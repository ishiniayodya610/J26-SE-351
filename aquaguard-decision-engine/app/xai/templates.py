"""
Explanation templates for translating reasoning traces to human-interpretable explanations.
"""

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
