from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    from backend.app.routers import (
        telemetry,
        fish_profile,
        comp2_vision,
        comp3_disease,
        comp4_xai,
        predictions,
    )
except ImportError:
    from app.routers import (
        telemetry,
        fish_profile,
        comp2_vision,
        comp3_disease,
        comp4_xai,
        predictions,
    )

app = FastAPI(
    title="AquaGuard AI Central Gateway",
    description="Multi-Modal Backend linking Edge TinyML, Vision, Disease Prediction, and XAI with Expo Mobile App",
    version="1.0.0"
)

# Enable Full CORS for Expo React Native and Web Browsers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include All Component Routers + Prediction Router
app.include_router(telemetry.router)
app.include_router(fish_profile.router)
app.include_router(comp2_vision.router)
app.include_router(comp3_disease.router)
app.include_router(comp4_xai.router)
app.include_router(predictions.router)

@app.get("/")
async def root():
    return {
        "project": "AquaGuard J26-SE-351",
        "status": "ONLINE",
        "active_components": {
            "comp_1_edge_tinyml": "READY (Edge Impulse C++ Binary Connected)",
            "comp_2_fish_vision": "READY (Hook Active)",
            "comp_3_disease_ammonia": "READY (Risk Synthesizer Active)",
            "comp_4_xai_engine": "READY (Causality Synthesizer Active)",
            "comp_3_predictions": "READY (Random Forest Inference Active)"
        },
        "endpoints": {
            "swagger_docs": "/docs",
            "telemetry_ws": "/api/telemetry/ws",
            "telemetry_latest": "/api/telemetry/latest",
            "fish_profiles": "/api/fish/profiles",
            "predict_ammonia": "/predict/ammonia",
            "predict_whitespot": "/predict/whitespot"
        }
    }

