"""
AquaGuard AI Central Gateway — main.py
Phase 2: Domain-driven architecture with Auth, Tanks, Devices, and MQTT.
All existing ML component routers are preserved.
"""
import sys
from pathlib import Path

# Ensure project root is in sys.path so 'backend.app.*' always resolves
_project_root = str(Path(__file__).resolve().parent.parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
_backend_dir = str(Path(__file__).resolve().parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.core.config import settings
from backend.app.domains.auth.router import router as auth_router
from backend.app.domains.tanks.router import router as tanks_router
from backend.app.domains.devices.router import router as devices_router
from backend.app.db import mongo as mongo_client

from backend.app.routers import (
    telemetry,
    fish_profile,
    comp2_vision,
    comp3_disease,
    comp4_xai,
    predictions,
    tank as legacy_tank,
)
from backend.app.services.database import db_manager

# ── App factory ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "AquaGuard Phase 2 — Multi-tenant IoT aquarium management platform. "
        "Auth, tank management, device provisioning, MQTT telemetry, and AI predictions."
    ),
    version=settings.APP_VERSION,
)

# CORS — allow all origins in dev; restrict in production via CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Phase 2 domain routers ────────────────────────────────────────────────────
app.include_router(auth_router)      # /auth/register, /auth/login, /auth/me …
app.include_router(tanks_router)     # /tanks, /tanks/{id} …
app.include_router(devices_router)   # /devices/provision, /devices/claim …

# ── Phase 1 legacy ML routers ─────────────────────────────────────────────────
app.include_router(telemetry.router)
app.include_router(fish_profile.router)
app.include_router(comp2_vision.router)
app.include_router(comp3_disease.router)
app.include_router(comp4_xai.router)
app.include_router(predictions.router)
app.include_router(legacy_tank.router)

# ── Static file mount for annotated videos ────────────────────────────────────
ANNOTATED_DIR = Path(__file__).resolve().parent.parent / "static" / "annotated"
ANNOTATED_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/annotated", StaticFiles(directory=str(ANNOTATED_DIR)), name="annotated")


# ── Lifecycle hooks ───────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    # Phase 2: Connect to MongoDB (Motor async)
    await mongo_client.connect()

    # Phase 1: Legacy SQLite/MongoDB bridge (kept for backward compat)
    await db_manager.connect_mongo()


@app.on_event("shutdown")
async def shutdown_event():
    await mongo_client.disconnect()


# ── Root health check ─────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    db_ok = mongo_client.get_db() is not None
    return {
        "project": "AquaGuard J26-SE-351",
        "version": settings.APP_VERSION,
        "status": "ONLINE",
        "mongodb": "connected" if db_ok else "not connected (set MONGODB_URI in .env)",
        "phase_2_domains": {
            "auth":    "/auth/register | /auth/login | /auth/me",
            "tanks":   "/tanks",
            "devices": "/devices/provision | /devices/claim",
        },
        "phase_1_ml_components": {
            "comp_1_edge_tinyml":    "READY",
            "comp_2_fish_vision":    "READY",
            "comp_3_disease_ammonia":"READY",
            "comp_4_xai_engine":     "READY",
            "comp_3_predictions":    "READY",
        },
        "docs": "/docs",
    }
