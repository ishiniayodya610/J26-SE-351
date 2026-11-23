import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api import decision_routes, simulation_routes, species_routes, benchmark_routes
from app.database.firebase_client import start_tank_listener

app = FastAPI(title="AquaGuard Decision Engine API", version="1.1.0")

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
app.include_router(benchmark_routes.router, prefix="/api/v1/benchmarks", tags=["Benchmarks"])


@app.on_event("startup")
async def startup_event():
    # Initialize the Firebase realtime background listener
    start_tank_listener()

# Static Files & Demo Dashboard
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/demo", include_in_schema=False)
@app.get("/dashboard", include_in_schema=False)
def serve_demo():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "AquaGuard Demo UI loading. Please ensure index.html exists in app/static."}


@app.get("/", tags=["Health"])
def root():
    return {
        "service": "AquaGuard Decision Engine API",
        "status": "operational",
        "version": "1.1.0",
        "demo_url": "/demo",
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
