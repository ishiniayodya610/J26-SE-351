"""
Fuzzy membership functions and linguistic variable definitions using scikit-fuzzy.
Phase 5: Fuzzy Stability Engine Antecedents & Consequents.
"""

import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl


def setup_fuzzy_variables():
    """Defines antecedents, consequents, and realistic membership functions."""
    # Antecedents (Inputs)
    temperature = ctrl.Antecedent(np.arange(15, 36, 1), 'temperature')
    ph = ctrl.Antecedent(np.arange(4.0, 10.1, 0.1), 'ph')
    tds = ctrl.Antecedent(np.arange(0, 601, 1), 'tds')
    aggression = ctrl.Antecedent(np.arange(0, 11, 1), 'aggression')

    # Consequent (Output: ESI 0.00 - 1.00)
    esi = ctrl.Consequent(np.arange(0, 1.01, 0.01), 'esi')

    # Temperature Memberships (Trapezoidal/Triangular)
    temperature['Cold'] = fuzz.trapmf(temperature.universe, [15, 15, 20, 23])
    temperature['Optimal'] = fuzz.trimf(temperature.universe, [22, 25, 28])
    temperature['Hot'] = fuzz.trapmf(temperature.universe, [27, 30, 35, 35])

    # pH Memberships
    ph['Acidic'] = fuzz.trapmf(ph.universe, [4.0, 4.0, 6.0, 6.8])
    ph['Neutral'] = fuzz.trimf(ph.universe, [6.5, 7.0, 7.5])
    ph['Alkaline'] = fuzz.trapmf(ph.universe, [7.2, 8.0, 10.0, 10.0])

    # TDS Memberships
    tds['Low'] = fuzz.trapmf(tds.universe, [0, 0, 80, 150])
    tds['Moderate'] = fuzz.trimf(tds.universe, [100, 200, 300])
    tds['High'] = fuzz.trapmf(tds.universe, [250, 400, 600, 600])

    # Aggression Memberships
    aggression['Calm'] = fuzz.trimf(aggression.universe, [0, 0, 3])
    aggression['Moderate'] = fuzz.trimf(aggression.universe, [2, 5, 8])
    aggression['Severe'] = fuzz.trapmf(aggression.universe, [6, 8, 10, 10])

    # ESI Output Memberships
    esi['Critical'] = fuzz.trimf(esi.universe, [0.0, 0.15, 0.35])
    esi['Suboptimal'] = fuzz.trimf(esi.universe, [0.30, 0.50, 0.70])
    esi['Stable'] = fuzz.trimf(esi.universe, [0.65, 0.85, 1.0])

    return temperature, ph, tds, aggression, esi
