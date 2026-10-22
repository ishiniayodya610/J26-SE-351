# AquaGuard (J26-SE-351)
### AI-Driven Smart Aquarium & Aquaculture Ecosystem

> **From multi-source data to explainable, optimal aquarium ecosystem decisions.**

AquaGuard is an end-to-end intelligent aquaculture management platform integrating Edge IoT hardware, mobile computer vision, an explainable hybrid decision engine, and cloud predictive intelligence.

---

## 👥 Research Team & System Architecture

AquaGuard is organized into four specialized research components:

| Member / Component | Domain | Responsibilities & Provisions |
| :--- | :--- | :--- |
| **Member 1 – Edge IoT** | Embedded Hardware & Actuation | Real-time sensor acquisition (Temp, pH, TDS), edge PID heating/dosing actuation, hardware fail-safes. |
| **Member 2 – Decision Engine** | Core AI Optimization & Reasoning | **Explainable Hybrid CSP-Fuzzy Dynamic Breeding Population Optimizer & Simulation Engine.** |
| **Member 3 – Mobile Vision** | Computer Vision & Edge AI | Mobile image-based fish identification, bounding-box detection, posture and lethargy analysis. |
| **Member 4 – Cloud Intelligence** | Cloud Analytics & Forecasting | Historical telemetry aggregation, ammonia spike prediction, disease outbreak risk modeling. |

---

## 🧠 Member 2: Explainable Hybrid CSP-Fuzzy Optimizer

The decision engine unifies multi-source data inputs into a deterministic 4-stage pipeline producing actionable hardware setpoints, biological vectors, and user-facing explanations.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                   MULTI-SOURCE INPUTS                  │
                    └────────────────────────────────────────────────────────┘
                       │                     │                    │
        ┌──────────────┴──────┐    ┌─────────┴─────────┐   ┌──────┴───────────────┐
        │ Member 1 – Edge IoT │    │ Member 3 – Vision │   │  Member 4 – Cloud    │
        │ Temp, pH, TDS, Edge │    │ Fish ID, Posture, │   │  Ammonia, Disease,   │
        │ Hardware Diagnostics│    │ Lethargy Index %  │   │  Trend Forecasts     │
        └──────────────┬──────┘    └─────────┬─────────┘   └──────┬───────────────┘
                       │                     │                    │
                       └───────────────────┬─┴────────────────────┘
                                           ▼
                       ┌───────────────────────────────────────┐
                       │           Species Database            │
                       │ Biological Limits, Aggression Matrix, │
                       │ Footprint, Social Compatibility Rules │
                       └───────────────────┬───────────────────┘
                                           ▼
═════════════════════════════════════════════════════════════════════════════════════════
                       FOUR-STAGE PROCESSING PIPELINE (Member 2)
═════════════════════════════════════════════════════════════════════════════════════════

  [Stage 1: CSP Gatekeeper]
    │   • Validates hard biological invariants (Predator/Prey, Tank Volume, Temp Shock).
    │   • Filters out infeasible and lethal stocking combinations early.
    ▼
  [Stage 2: Fuzzy Inference System]
    │   • Handles environmental uncertainty using Mamdani Fuzzy Logic (`scikit-fuzzy`).
    │   • Computes continuous Ecosystem Stability Index (ESI: 0.0 to 1.0).
    ▼
  [Stage 3: Mode-Aware Population Optimizer]
    │   • Ornamental Mode: Fast-path bypass (<5ms latency) preserving verified population.
    │   • Breeder Mode: DEAP Multi-Objective Genetic Algorithm optimizing sex ratios & bioload.
    ▼
  [Stage 4: XAI Simulation & Explanation]
    │   • Simulates ecosystem and counterfactual parameter shifts ("What-If" Sandbox).
    │   • Generates deterministic natural language explanations and husbandry advice.
    ▼
═════════════════════════════════════════════════════════════════════════════════════════
                              OUTPUTS & PROVISIONS
═════════════════════════════════════════════════════════════════════════════════════════
        │                                    │                                    │
        ▼                                    ▼                                    ▼
┌───────────────────────────┐    ┌───────────────────────────┐    ┌───────────────────────────┐
│  Hardware Targets to IoT  │    │ Biological Vectors to Cl. │    │  XAI Alerts to Mobile App │
│ Strict safe median targets│    │ Approved species mix, ESI │    │ Natural language reasoning│
│ (Temp, pH, TDS) synced    │    │ stability indices, bioload│    │ warnings, breeding ratios,│
│ to Firebase for ESP32 edge│    │ vectors for cloud insights│    │ What-If recommendations.  │
└───────────────────────────┘    └───────────────────────────┘    └───────────────────────────┘
```

---

## 📥 Multi-Source Inputs Breakdown

1. **Member 1 – Edge IoT:**
   - Real-time aquarium sensor telemetry (`temperature_c`, `ph`, `tds_ppm`).
   - Edge hardware diagnostics (sensor fault flags, lockout statuses).
2. **Member 3 – Mobile Vision:**
   - Image-based fish species identification (`species_id`).
   - Observed behavioral parameters: confidence score, lethargy index %, surface piping, feeding response.
3. **Member 4 – Cloud Intelligence:**
   - Multi-hour predictive horizon forecasts: ammonia spike probability %, whitespot disease risk %, thermal rate-of-change.
4. **Species Knowledge Base (v2.0.0):**
   - Ichthyological data referenced from *Seriously Fish* scientific literature.
   - Exact thermal, pH, and hardness tolerance envelopes, adult standard length, swimming layers, and aggression indexes.

---

## ⚙️ Four-Stage Processing Pipeline

### Stage 1: CSP Gatekeeper
- Enforces hard biological constraints before running heuristic calculations.
- Early pruning of predator-prey pairings (e.g., Angelfish + Neon Tetra), volume capacity violations (e.g., adult bioload exceeding water volume), and thermal boundary violations.

### Stage 2: Fuzzy Inference System (ESI)
- Implements a Mamdani Fuzzy Inference System with Gaussian/trapezoidal membership functions.
- Fuzzifies temperature antecedent, pH antecedent, TDS antecedent, and population aggression into three linguistic categories: `Critical`, `Suboptimal`, and `Stable`.

### Stage 3: Mode-Aware Population Optimizer
- **Ornamental Mode:** Designed for instant IoT response (<5ms latency); bypasses heuristic mutation, validating and preserving the current fish community.
- **Breeder Mode:** Executes a multi-objective Genetic Algorithm (via `DEAP`) balancing reproductive yield, species-specific male-to-female sex ratios (e.g. 1:2 to 1:3 for livebearers), and carrying capacity bioload margins.

### Stage 4: XAI Simulation & Reasoning
- Translates rule violations and mathematical stability indexes into transparent, human-readable explanations.
- Powers the **What-If Simulation Sandbox**, computing stability deltas ($\Delta \text{ESI}$) and husbandry recommendations before introducing new fish to the aquarium.

---

## 📤 Outputs & Provisions

1. **Hardware Targets to IoT:**
   - Dynamic environmental overlap calculation ([Phase 14](aquaguard-decision-engine/app/csp/overlap.py)) computes the strictest safe median setpoints.
   - Pushes targets directly to Firebase Realtime Database (`users/{user_id}/tanks/{tank_id}/esp32_targets`) for ESP32 edge actuators.
2. **Biological Vectors to Cloud:**
   - Dispatches approved population matrices, sex ratios, and ESI health scores to Cloud Intelligence services for long-term health tracking.
3. **XAI Alerts to Mobile App:**
   - Provides plain-language explanations of approved and rejected states, violation notifications, and corrective steps for aquarists.

---

## 🚀 Quick Start (Decision Engine)

```bash
# 1. Navigate to the decision engine directory
cd aquaguard-decision-engine

# 2. Activate virtual environment
.\venv\Scripts\activate

# 3. Run the interactive server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Interactive Showcase Dashboard:** [http://127.0.0.1:8000/demo](http://127.0.0.1:8000/demo)
- **FastAPI OpenAPI Documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Run Complete Pytest Suite (61 tests):**
  ```bash
  pytest app/tests/ -v
  ```
- **Run 100-Permutation Benchmark Suite:**
  ```bash
  python scripts/evaluate_metrics.py
  ```
