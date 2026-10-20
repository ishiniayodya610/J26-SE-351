"""
Fuzzy rule base for evaluating risk levels from water parameter antecedents.
"""

from typing import List, Any

try:
    from skfuzzy import control as ctrl
except ImportError:
    ctrl = None


def build_fuzzy_rules(variables: dict) -> List[Any]:
    """
    Construct the fuzzy associative rules.
    """
    if ctrl is None or not variables:
        return []

    temp = variables["temperature"]
    ph = variables["ph"]
    ammonia = variables["ammonia"]
    risk = variables["risk"]

    rules = [
        ctrl.Rule(temp["optimal"] & ph["neutral"] & ammonia["safe"], risk["low"]),
        ctrl.Rule(temp["cold"] | temp["hot"] | ammonia["warning"], risk["moderate"]),
        ctrl.Rule(ammonia["toxic"] | ph["acidic"] | ph["alkaline"], risk["high"]),
    ]

    return rules
