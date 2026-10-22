# AquaGuard Decision Engine (J26-SE-351)

**An Explainable Hybrid CSP-Fuzzy Dynamic Breeding Population Optimizer for Aquarium Management**

AquaGuard is an AI-driven backend decision engine designed to process live IoT telemetry, evaluate biological constraints, compute ecosystem stability, and optimize aquatic breeding populations. It serves as the intelligent core between the ESP32 hardware edge and the React Native mobile application.

## 🧠 System Architecture

The decision engine operates on a strict, 4-stage pipeline:

1. **CSP Gatekeeper:** A Constraint Satisfaction Problem engine that filters out fatal biological mismatches (e.g., predator/prey conflicts, extreme temperature violations, volume capacity limits).
2. **Fuzzy Stability Engine:** A Mamdani Fuzzy Inference System (using `scikit-fuzzy`) that calculates a continuous Ecosystem Stability Index (ESI) based on live pH, TDS, temperature, and aggression metrics.
3. **Dynamic Population Optimizer:** A Genetic Algorithm (using `DEAP`) that recommends optimal stocking counts and breeding ratios while penalizing high bioloads.
4. **XAI Generator:** An Explainable AI module that translates mathematical rejections and stability scores into human-readable recommendations.

## 🚀 Installation & Setup

**1. Clone the repository and setup the environment:**
```bash
python -m venv venv
# On Windows: .\venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate
```

**2. Install dependencies:**

```bash
pip install -r requirements.txt
pip install pytest scipy networkx
```

**3. Configure Firebase:**
Download your `serviceAccountKey.json` from the Firebase Console and place it in the root directory. **(Do not commit this file to version control).**

## 🌐 Running the API Server

Start the FastAPI server locally:

```bash
uvicorn app.main:app --reload
```

Access the interactive API documentation (Swagger UI) at: `http://127.0.0.1:8000/docs`

## 🧪 Testing & Benchmarks

The system includes a comprehensive Pytest suite and automated benchmark scripts to validate the 100 required stocking permutations for evaluation.

**Run the Unit Test Suite:**

```bash
pytest -v
```

**Run the 100-Permutation Benchmark Evaluation:**

```bash
python scripts/evaluate_metrics.py
```

**Run the Millisecond Latency Profiler:**

```bash
python scripts/performance_test.py
```
