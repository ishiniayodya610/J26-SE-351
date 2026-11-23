# Explainable Hybrid CSP-Fuzzy Optimizer (J26-SE-351)

> **From multi-source data to explainable, optimal aquarium ecosystem decisions.**

The **AquaGuard Decision Engine** is an intelligent reasoning and dynamic population optimization core developed for the J26-SE-351 research project. It processes multi-source data from Edge IoT sensors, Mobile Vision observations, Cloud predictive forecasts, and ichthyological knowledge to generate optimal environmental actuation targets, balanced population structures, and transparent explanations.

---

## 📥 Multi-Source Inputs

The decision engine continuously synthesizes inputs from three peer research subsystems and a validated knowledge base:

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│   Member 1 – Edge IoT   │    │  Member 3 – Mobile Vis. │    │   Member 4 – Cloud Int. │
│ • Temperature, pH, TDS  │    │ • Species Identification│    │ • Ammonia Spike Risk %  │
│ • Sensor Fault Signals  │    │ • Posture / Lethargy %  │    │ • Disease Risk Horizon  │
│ • Edge Hardware Status  │    │ • Surface Piping State  │    │ • Thermal Trend Curves  │
└────────────┬────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
             │                              │                              │
             └──────────────────────┬───────┴──────────────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │      Species Database       │
                     │ • Tolerance Envelopes       │
                     │ • Aggression & Fin-Nipping  │
                     │ • Base Footprint & Layers   │
                     │ • Sex Ratios & Breeding Bio │
                     └──────────────┬──────────────┘
                                    │
                                    ▼
                [ FOUR-STAGE HYBRID OPTIMIZATION PIPELINE ]
```

1. **Member 1 – Edge IoT:** Real-time aquarium telemetry (`temperature_c`, `ph`, `tds_ppm`) and edge diagnostic telemetry.
2. **Member 3 – Mobile Vision:** Real-time visual species identification, individual count, male/female distribution, and behavioral metrics (`lethargy_index_pct`, `surface_piping`, `feeding_response`).
3. **Member 4 – Cloud Intelligence:** Predictive analytics, multi-hour forecasting (`ammonia_spike_risk_pct`, `whitespot_disease_risk_pct`, `temperature_trend_c`), and historical trends.
4. **Species Database (v2.0.0):** Biological profiles referenced from peer-reviewed ichthyological literature (*Seriously Fish*), defining strict environmental ranges, minimum footprint volumes, aggression indices, and reproduction metrics.

---

## ⚙️ Four-Stage Processing Pipeline

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 🛡️ STAGE 1: CSP GATEKEEPER (Hard Biological Invariants)                │
  │ • Validates hard biological invariants (Predator/Prey, Volume, Temp).  │
  │ • Filters out infeasible combinations early (fail-fast architecture). │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │ (Pass)
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 🌊 STAGE 2: FUZZY INFERENCE SYSTEM (Ecosystem Stability Index)         │
  │ • Mamdani Fuzzy System (scikit-fuzzy) handling parameter uncertainty.  │
  │ • Computes continuous multivariate ESI score (0.0 to 1.0).             │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 🧬 STAGE 3: MODE-AWARE POPULATION OPTIMIZER (Phase 16)                │
  │ • Ornamental Mode: Ultra-low latency fast-path (<5ms, skips GA).       │
  │ • Breeder Mode: DEAP Multi-Objective Genetic Algorithm for sex ratios. │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 💡 STAGE 4: XAI SIMULATION & EXPLANATION (Decision Reasoning)          │
  │ • Counterfactual What-If simulation engine with delta stability.       │
  │ • Generates deterministic human-readable explanations & recommendations│
  └────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: CSP Gatekeeper
- Enforces non-negotiable biological laws:
  - **Rule CSP-001:** Incompatible temperaments and predator/prey pairings (e.g., Angelfish consuming Neon Tetras).
  - **Rule CSP-002:** Minimum aquarium base volume and adult carrying capacity limits.
  - **Rule CSP-003:** Absolute thermal boundary tolerances (preventing thermal shock).

### Stage 2: Fuzzy Inference System (ESI)
- Fuzzifies continuous telemetry (temperature, pH, TDS) and derived maximum aggression.
- Evaluates 6 active Mamdani rules and defuzzifies via centroid calculation into the **Ecosystem Stability Index (ESI)**:
  - `0.70 – 1.00`: **Stable** (Optimal conditions)
  - `0.35 – 0.69`: **Suboptimal** (Water chemistry or social tension)
  - `0.00 – 0.34`: **Critical** (High physiological stress)

### Stage 3: Mode-Aware Population Optimizer (Phase 16)
- **Ornamental Mode:** Bypasses evolutionary heuristic search to achieve sub-5ms response times. Validates and preserves the existing population structure.
- **Breeder Mode:** Executes a Genetic Algorithm using `DEAP` (10 generations, crossover probability 0.7, mutation probability 0.2) optimizing for ideal male-to-female sex ratios, breeding compatibility, and fry bioload headroom.

### Stage 4: XAI Simulation & Reasoning
- Translates mathematical rule states into plain-language reasoning with actionable husbandry advice.
- Powers the counterfactual **What-If Simulation Sandbox**, evaluating hypothetical additions against a baseline tank and calculating stability impact ($\Delta \text{ESI}$).

---

## 📤 Outputs & Provisions

The pipeline converts evaluation decisions into three distributed deliverables:

### 1. Hardware Targets to IoT
- **Phase 14 Environmental Overlap Algorithm:** Dynamically intersects the environmental tolerance ranges of all coexisting species, computing the exact mathematical median for edge actuators:
  $$\text{Target} = \frac{\max(\min_i) + \min(\max_i)}{2}$$
- **Phase 15 Multi-Tenant Realtime Sync:** Automatically synchronizes target setpoints to Firebase Realtime Database at:
  `users/{user_id}/tanks/{tank_id}/esp32_targets`

### 2. Biological Vectors to Cloud
- Transmits approved stocking distributions, male/female ratios, and ESI health scores to Cloud Intelligence services for longitudinal health monitoring and predictive training.

### 3. XAI Alerts to Mobile App
- Delivers plain-language summaries, violation breakdowns, and corrective steps directly to the React Native mobile user interface.

---

## 🚀 Installation & Local Execution

### 1. Environment Setup
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
pip install pytest scipy networkx
```

### 2. Start Decision Engine Server
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Interactive Showcase Demo:** [http://127.0.0.1:8000/demo](http://127.0.0.1:8000/demo)
- **API Documentation (Swagger UI):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **System Health:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## 🧪 Benchmark Verification & Metrics

The decision engine was benchmarked against 100 formal stocking permutations ([`data/benchmark_100.json`](data/benchmark_100.json)) testing Predator/Prey, Tank Volume, Territorial Conflict, and Temperature limits.

### Quantitative Metrics:
- **System Accuracy:** **100.0%**
- **True Positives (TP):** 30
- **True Negatives (TN):** 70
- **False Positives (FP):** 0
- **False Negatives (FN):** 0

### Automated Evaluation Commands:
```bash
# Run the 61-test unit & integration test suite
pytest app/tests/ -v

# Run the 100-permutation benchmark evaluation
python scripts/evaluate_metrics.py

# Run latency profiling across all 4 stages
python scripts/performance_test.py
```
