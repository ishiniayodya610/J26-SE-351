"""
Rule execution trace collector to track activated constraints and fuzzy rules.
"""

from typing import List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class RuleTraceEvent:
    rule_name: str
    engine: str  # 'csp', 'fuzzy', 'optimizer'
    inputs: Dict[str, Any]
    output: Any
    fired: bool
    timestamp: datetime = field(default_factory=datetime.utcnow)


class RuleTraceCollector:
    def __init__(self):
        self.events: List[RuleTraceEvent] = []

    def record(self, event: RuleTraceEvent):
        self.events.append(event)

    def get_traces(self) -> List[Dict[str, Any]]:
        return [
            {
                "rule_name": e.rule_name,
                "engine": e.engine,
                "inputs": e.inputs,
                "output": e.output,
                "fired": e.fired,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in self.events
        ]

    def clear(self):
        self.events.clear()
