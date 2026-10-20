"""
Main FastAPI Application Entry Point for AquaGuard Decision Engine.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.decision_routes import router as decision_router
from app.api.simulation_routes import router as simulation_router
from app.api.species_routes import router as species_router

app = FastAPI(
    title="AquaGuard Decision Engine",
    description="Central reasoning engine for smart aquarium ecosystem integrating CSP, Fuzzy Logic, GA Optimizer, and XAI.",
    version="1.0.0",
)

# Cross-Origin Resource Sharing (CORS) setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(decision_router, prefix="/api/v1/decisions", tags=["Decisions"])
app.include_router(simulation_router, prefix="/api/v1/simulations", tags=["Simulations"])
app.include_router(species_router, prefix="/api/v1/species", tags=["Species"])


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "AquaGuard Decision Engine",
        "status": "operational",
        "version": "1.0.0",
    }


@app.get("/health", tags=["Health"])
async def health_check():
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
