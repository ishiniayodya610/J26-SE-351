"""
Fuzzy Inference Engine executing water quality evaluation via scikit-fuzzy control systems.
"""

from typing import Dict, Any

try:
    from skfuzzy import control as ctrl
    from app.fuzzy.membership import setup_water_quality_variables
    from app.fuzzy.rules import build_fuzzy_rules
except ImportError:
    ctrl = None


class FuzzyEngine:
    def __init__(self):
        self.simulation = None
        self._initialize()

    def _initialize(self):
        if ctrl is None:
            return
        variables = setup_water_quality_variables()
        if not variables:
            return
        rules = build_fuzzy_rules(variables)
        control_system = ctrl.ControlSystem(rules)
        self.simulation = ctrl.ControlSystemSimulation(control_system)

    def evaluate(self, temperature: float, ph: float, ammonia: float = 0.0) -> Dict[str, Any]:
        """
        Compute defuzzified water quality risk score.
        """
        if self.simulation is None:
            return {"risk_score": 0.0, "status": "engine_uninitialized"}

        self.simulation.input["temperature"] = temperature
        self.simulation.input["ph"] = ph
        self.simulation.input["ammonia"] = ammonia
        self.simulation.compute()

        risk = self.simulation.output.get("risk", 0.0)
        return {
            "risk_score": float(risk),
            "status": "evaluated",
        }
