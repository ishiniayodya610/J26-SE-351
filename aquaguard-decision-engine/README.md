# AquaGuard Decision Engine

The **AquaGuard Decision Engine** is the central reasoning core for the AquaGuard ecosystem. It integrates Constraint Satisfaction Problems (CSP), Fuzzy Logic Inference, Genetic Algorithms (GA), and Explainable AI (XAI) to ensure aquatic species biocompatibility and optimal water quality management.

---

## 🏛️ Directory Structure

```text
aquaguard-decision-engine/
├── app/
│   ├── main.py                     # FastAPI entry point & route mounting
│   ├── api/                        # REST API routing endpoints
│   │   ├── decision_routes.py      # Telemetry evaluation & decision endpoints
│   │   ├── simulation_routes.py    # Counterfactual what-if simulation endpoints
│   │   └── species_routes.py       # Species catalog & biological profiles
│   ├── models/                     # Pydantic data schemas
│   │   ├── species.py              # Biological parameters & ranges
│   │   ├── aquarium.py             # Tank setup, equipment, and current stock
│   │   ├── telemetry.py            # Real-time sensor readings (pH, Temp, NH3)
│   │   └── decision.py             # Decision outputs, recommendations & XAI schemas
│   ├── database/                   # Persistence layer
│   │   ├── mongodb.py              # PyMongo connection management
│   │   └── repositories.py         # Repositories for species & telemetry
│   ├── csp/                        # Constraint Satisfaction Problem Engine
│   │   ├── constraints.py          # Biocompatibility and parameter constraints
│   │   └── csp_engine.py           # python-constraint solver
│   ├── fuzzy/                      # Fuzzy Logic Inference System
│   │   ├── membership.py           # Linguistic variables & membership curves
│   │   ├── rules.py                # Fuzzy associative matrix & rules
│   │   └── fuzzy_engine.py         # scikit-fuzzy inference & defuzzification
│   ├── optimizer/                  # Genetic Algorithm (GA) Optimization
│   │   ├── fitness.py              # Multi-objective fitness functions
│   │   ├── constraints.py          # Biological viability checks
│   │   └── optimizer.py            # DEAP evolutionary algorithm engine
│   ├── xai/                        # Explainable AI (XAI)
│   │   ├── rule_trace.py           # Trace collector for rule firings
│   │   ├── explanation.py          # Natural language explanation generator
│   │   └── templates.py            # Explanation formatting templates
│   ├── simulation/                 # Predictive Simulation
│   │   └── what_if_engine.py       # What-if counterfactual scenario simulator
│   ├── tests/                      # Test Suite
│   │   ├── test_csp.py             # CSP engine tests
│   │   ├── test_fuzzy.py           # Fuzzy logic tests
│   │   ├── test_optimizer.py       # Genetic algorithm tests
│   │   ├── test_xai.py             # XAI and explanation tests
│   │   └── test_api.py             # FastAPI integration tests
│   └── data/                       # Data Assets
│       ├── species_seed.json       # Seed catalog of fish species & parameters
│       └── test_scenarios.json     # Evaluation scenarios (normal, spikes, conflicts)
├── requirements.txt                # Python 3.11 environment dependencies
└── README.md
```

---

## 🚀 Getting Started

### 1. Environment Setup

```bash
# Create and activate virtual environment
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Run Development Server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 3. Run Test Suite

```bash
pytest app/tests/ -v
```
