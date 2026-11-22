# Phase 11: React Native Integration Guide

This document defines how the React Native frontend consumes data from the AquaGuard Decision Engine. The mobile application must filter out raw telemetry and show only the important processed results.

## 1. Main Dashboard UI Mapping
The main dashboard reads the latest evaluation result from Firebase (`aquariums/{aquarium_id}/decisions`) or via the `POST /api/v1/evaluate` response.

**Required UI Elements & Data Sources:**
* **Ecosystem Stability:** Map to `response.esi` (e.g., 0.84 converts to 84%).
* **Compatibility:** Map to `response.status` (displays as APPROVED or REJECTED).
* **Risk Level:** Map to `response.risk_level` (e.g., LOW, MODERATE, HIGH).
* **Recommended Population:** Iterate over `response.population` to show optimized counts (e.g., Guppy 2M/6F, Corydoras 4).
* **Why? (XAI Explanation):** Map to `response.xai[0].reason` (e.g., "The current water conditions are suitable...").

**Example React Native Fetch:**
```javascript
const fetchDecision = async () => {
  const response = await fetch('http://<YOUR_API_IP>:8000/api/v1/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(currentTankState)
  });
  const data = await response.json();
  setDashboardState(data);
};
```

## 2. What-If Simulation Screen Mapping

This screen allows users to input potential fish additions and press "SIMULATE" to see the impact before actually buying the fish. It uses the `POST /api/v1/simulate` endpoint.

**Required UI Elements & Data Sources:**
* **ESI Before:** Map to `response.before.esi` (e.g., 0.84).
* **ESI After:** Map to `response.after.esi` (e.g., 0.76).
* **Bioload / Stability Impact:** Map to `response.difference.stability_impact` (e.g., "Reduced").
* **Explanation:** Map to `response.recommendation` (e.g., "Adding 4 fish increases biological load...").

**Example React Native Fetch:**
```javascript
const runSimulation = async (proposedChanges) => {
  const response = await fetch('http://<YOUR_API_IP>:8000/api/v1/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aquarium: currentTank,
      telemetry: currentTelemetry,
      current_population: currentFish,
      proposed_population: proposedChanges
    })
  });
  const data = await response.json();
  setSimulationResults(data);
};
```
