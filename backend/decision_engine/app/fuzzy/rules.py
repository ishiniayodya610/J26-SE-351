"""
Fuzzy rule base for evaluating Ecosystem Stability Index (ESI).
Phase 5: Biological reasoning rules.
"""

from skfuzzy import control as ctrl


def get_fuzzy_rules(temperature, ph, tds, aggression, esi):
    """Defines the rule base for evaluating ecosystem stability."""

    # Rule 1: Perfect conditions
    rule1 = ctrl.Rule(
        temperature['Optimal'] & ph['Neutral'] & tds['Moderate'] & aggression['Calm'],
        esi['Stable']
    )

    # Rule 2: Extreme stress combinations
    rule2 = ctrl.Rule(
        temperature['Hot'] & aggression['Severe'],
        esi['Critical']
    )

    # Rule 3: Water chemistry imbalance
    rule3 = ctrl.Rule(
        ph['Acidic'] | tds['High'],
        esi['Suboptimal']
    )

    # Rule 4: Cold stress
    rule4 = ctrl.Rule(
        temperature['Cold'] & aggression['Moderate'],
        esi['Suboptimal']
    )

    # Rule 5: Severe water chemistry issues
    rule5 = ctrl.Rule(
        ph['Alkaline'] & tds['High'],
        esi['Critical']
    )

    return [rule1, rule2, rule3, rule4, rule5]
