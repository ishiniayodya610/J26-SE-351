import os
import json
from fastapi import APIRouter

router = APIRouter()


def _load_species_catalog():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    target_path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(target_path):
        target_path = os.path.join(base_dir, "app", "data", "species_seed.json")
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data["species"] if isinstance(data, dict) and "species" in data else data
    except Exception:
        return []


@router.get("/")
async def list_species():
    """
    List supported species and their biological requirement parameters.
    """
    return {
        "status": "success",
        "species": _load_species_catalog(),
    }
