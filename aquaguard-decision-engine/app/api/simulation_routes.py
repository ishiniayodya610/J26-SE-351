"""
Simulation API routes for running what-if counterfactual scenarios.
"""

from fastapi import APIRouter

router = APIRouter()


@router.post("/what-if")
async def run_what_if_simulation():
    """
    Simulate changes to water parameters or species introductions.
    """
    return {
        "status": "success",
        "message": "What-if simulation pipeline placeholder",
        "simulation_result": {},
    }
