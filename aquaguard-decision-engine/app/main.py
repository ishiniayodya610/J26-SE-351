"""
Main FastAPI Application Entry Point for AquaGuard Decision Engine API.
Phase 9: Decision & Simulation REST API Layer.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import decision_routes, simulation_routes, species_routes

app = FastAPI(title="AquaGuard Decision Engine API", version="1.0.0")

# Cross-Origin Resource Sharing (CORS) setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Endpoints
app.include_router(decision_routes.router, prefix="/api/v1")
app.include_router(simulation_routes.router, prefix="/api/v1")
app.include_router(species_routes.router, prefix="/api/v1/species", tags=["Species"])


@app.get("/", tags=["Health"])
def root():
    return {
        "service": "AquaGuard Decision Engine API",
        "status": "operational",
        "version": "1.0.0",
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "modules": {
            "csp_engine": "ready",
            "fuzzy_engine": "ready",
            "optimizer": "ready",
            "xai": "ready",
            "simulation": "ready",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
