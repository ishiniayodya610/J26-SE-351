from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.routers import (
    telemetry, 
    fish_profile, 
    comp2_vision, 
    comp3_disease, 
    comp4_xai,
    aquio
)
from backend.app.services.aquio_bridge import aquio_bridge

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

# Include All Component Routers + Knowledge Base + Remote Aquio Bridge
app.include_router(telemetry.router)
app.include_router(fish_profile.router)
app.include_router(comp2_vision.router)
app.include_router(comp3_disease.router)
app.include_router(comp4_xai.router)
app.include_router(aquio.router)

@app.on_event("startup")
async def startup_event():
    # Start Aquio remote sensor bridge if enabled in .env
    aquio_bridge.start()

@app.on_event("shutdown")
async def shutdown_event():
    # Gracefully stop remote bridge
    aquio_bridge.stop()

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
            "remote_aquio_bridge": aquio_bridge.get_status()
        },
        "endpoints": {
            "swagger_docs": "/docs",
            "telemetry_ws": "/api/telemetry/ws",
            "telemetry_latest": "/api/telemetry/latest",
            "fish_profiles": "/api/fish/profiles",
            "aquio_bridge_status": "/api/aquio/status",
            "aquio_sync_now": "/api/aquio/sync-now"
        }
    }
