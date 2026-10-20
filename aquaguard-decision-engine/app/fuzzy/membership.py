"""
Fuzzy membership functions and linguistic variable definitions using scikit-fuzzy.
"""

from typing import Dict, Any

try:
    import numpy as np
    import skfuzzy as fuzz
    from skfuzzy import control as ctrl
except ImportError:
    np = None
    fuzz = None
    ctrl = None


def setup_water_quality_variables() -> Dict[str, Any]:
    """
    Define antecedent and consequent fuzzy variables for water quality parameters.
    """
    if ctrl is None:
        return {}

    # Inputs: Antecedents
    temperature = ctrl.Antecedent(np.arange(15, 35, 0.5), "temperature")
    ph = ctrl.Antecedent(np.arange(5.0, 9.5, 0.1), "ph")
    ammonia = ctrl.Antecedent(np.arange(0.0, 5.0, 0.05), "ammonia")

    # Output: Consequent
    risk = ctrl.Consequent(np.arange(0, 101, 1), "risk")

    # Membership functions
    temperature["cold"] = fuzz.trimf(temperature.universe, [15, 15, 22])
    temperature["optimal"] = fuzz.trimf(temperature.universe, [21, 25, 27])
    temperature["hot"] = fuzz.trimf(temperature.universe, [26, 35, 35])

    ph["acidic"] = fuzz.trimf(ph.universe, [5.0, 5.0, 6.8])
    ph["neutral"] = fuzz.trimf(ph.universe, [6.5, 7.2, 7.8])
    ph["alkaline"] = fuzz.trimf(ph.universe, [7.5, 9.5, 9.5])

    ammonia["safe"] = fuzz.trimf(ammonia.universe, [0.0, 0.0, 0.25])
    ammonia["warning"] = fuzz.trimf(ammonia.universe, [0.1, 0.5, 1.0])
    ammonia["toxic"] = fuzz.trimf(ammonia.universe, [0.8, 5.0, 5.0])

    risk["low"] = fuzz.trimf(risk.universe, [0, 0, 30])
    risk["moderate"] = fuzz.trimf(risk.universe, [25, 50, 75])
    risk["high"] = fuzz.trimf(risk.universe, [65, 100, 100])

    return {
        "temperature": temperature,
        "ph": ph,
        "ammonia": ammonia,
        "risk": risk,
    }
