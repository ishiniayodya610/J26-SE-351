"""
Species management and catalog API routes.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_species():
    """
    List supported species and their biological requirement parameters.
    """
    return {
        "status": "success",
        "species": [],
    }
