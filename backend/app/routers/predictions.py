"""
Prediction Router for AquaGuard AI Central Gateway
--------------------------------------------------
NOTE:
The Random Forest models loaded and utilized in this module are temporary
proof-of-concept models trained on publicly available aquaculture datasets
(IoT pond monitoring data and white spot disease occurrence data).
These models serve as interim estimators for ammonia spike forecasting and
white spot disease outbreak risk. They will be replaced with real-world AquaGuard
multi-sensor calibrated models once dedicated pond telemetry collection is finalized.
"""

import os
import logging
import math
from pathlib import Path
from typing import Dict, Any, List, Optional

import joblib
import numpy as np
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, ConfigDict

logger = logging.getLogger("aquaguard.predictions")

router = APIRouter(tags=["AI Predictions"])

# Base paths for trained Random Forest models
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_AMMONIA_PATH = BASE_DIR / "models" / "ammonia" / "ammonia_spike_rf_model.pkl"
DEFAULT_WHITESPOT_PATH = BASE_DIR / "models" / "whitespot" / "disease_risk_rf_model.pkl"

AMMONIA_MODEL_PATH = Path(os.getenv("AMMONIA_MODEL_PATH", str(DEFAULT_AMMONIA_PATH)))
WHITESPOT_MODEL_PATH = Path(os.getenv("WHITESPOT_MODEL_PATH", str(DEFAULT_WHITESPOT_PATH)))

# Global model references loaded at startup
ammonia_model = None
whitespot_model = None
model_load_errors: Dict[str, str] = {}


def load_prediction_models() -> None:
    """
    Load both Random Forest models into memory using joblib.
    Provides graceful error logging if model files are missing or unreadable.
    """
    global ammonia_model, whitespot_model, model_load_errors
    model_load_errors.clear()

    # Load Ammonia Spike Random Forest Model
    try:
        if AMMONIA_MODEL_PATH.exists():
            ammonia_model = joblib.load(AMMONIA_MODEL_PATH)
            logger.info("Loaded Ammonia RF model from %s", AMMONIA_MODEL_PATH)
        else:
            err = f"Ammonia model file not found at: {AMMONIA_MODEL_PATH}"
            logger.warning(err)
            model_load_errors["ammonia"] = err
            ammonia_model = None
    except Exception as e:
        err = f"Failed to load Ammonia RF model from {AMMONIA_MODEL_PATH}: {e}"
        logger.exception(err)
        model_load_errors["ammonia"] = err
        ammonia_model = None

    # Load White Spot Disease Risk Random Forest Model
    try:
        if WHITESPOT_MODEL_PATH.exists():
            whitespot_model = joblib.load(WHITESPOT_MODEL_PATH)
            logger.info("Loaded Whitespot RF model from %s", WHITESPOT_MODEL_PATH)
        else:
            err = f"Whitespot model file not found at: {WHITESPOT_MODEL_PATH}"
            logger.warning(err)
            model_load_errors["whitespot"] = err
            whitespot_model = None
    except Exception as e:
        err = f"Failed to load Whitespot RF model from {WHITESPOT_MODEL_PATH}: {e}"
        logger.exception(err)
        model_load_errors["whitespot"] = err
        whitespot_model = None


# Initial model load on startup / module import
load_prediction_models()


# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class PredictionResponse(BaseModel):
    """Unified prediction response format for AquaGuard ML estimators."""
    risk_probability: float = Field(
        ...,
        description="Calculated risk probability (between 0.0 and 1.0)",
        examples=[0.87]
    )
    prediction: str = Field(
        ...,
        description="Qualitative risk classification: 'high_risk' or 'low_risk'",
        examples=["high_risk"]
    )
    model: str = Field(
        default="random_forest",
        description="Model architecture used for inference",
        examples=["random_forest"]
    )


class AmmoniaPredictionInput(BaseModel):
    """
    Input schema for ammonia spike risk prediction.

    Required features used by the Random Forest model:
      - temperature (or temp) [°C]
      - turbidity [NTU]
      - dissolved_oxygen (or do) [mg/L or g/ml]
      - ph (or pH)
      - nitrate [mg/L or g/ml]

    Optional parameters:
      - ammonia: Accepted for payload flexibility; not used as an input feature
                 because ammonia spike is the prediction target.
      - readings: Optional sequence of recent readings (up to 30) for time-series context.
    """
    model_config = ConfigDict(extra="allow")

    temperature: Optional[float] = Field(None, description="Water temperature in °C (Required, alias: 'temp')")
    temp: Optional[float] = Field(None, description="Alias for temperature in °C")
    turbidity: Optional[float] = Field(None, description="Water turbidity in NTU (Required)")
    dissolved_oxygen: Optional[float] = Field(None, description="Dissolved oxygen in mg/L (Required, alias: 'do')")
    do: Optional[float] = Field(None, description="Alias for dissolved_oxygen")
    ph: Optional[float] = Field(None, description="Water pH level (Required, alias: 'pH')")
    pH: Optional[float] = Field(None, description="Alias for ph")
    nitrate: Optional[float] = Field(None, description="Nitrate concentration in mg/L (Required)")
    ammonia: Optional[float] = Field(None, description="Current ammonia reading (Optional, ignored in model input)")
    readings: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional list of historical readings (up to 30 readings)"
    )


class WhitespotPredictionInput(BaseModel):
    """
    Input schema for white spot disease risk prediction.

    Required features used by the Random Forest model:
      - temperature (or temp) [°C]
      - dissolved_oxygen (or do) [mg/L]
      - ph (or pH)
      - turbidity [NTU]

    Optional parameters:
      - ammonia: Accepted for payload flexibility; not used in whitespot inference.
      - nitrate: Accepted for payload flexibility; not used in whitespot inference.
    """
    model_config = ConfigDict(extra="allow")

    temperature: Optional[float] = Field(None, description="Water temperature in °C (Required, alias: 'temp')")
    temp: Optional[float] = Field(None, description="Alias for temperature in °C")
    dissolved_oxygen: Optional[float] = Field(None, description="Dissolved oxygen in mg/L (Required, alias: 'do')")
    do: Optional[float] = Field(None, description="Alias for dissolved_oxygen")
    ph: Optional[float] = Field(None, description="Water pH level (Required, alias: 'pH')")
    pH: Optional[float] = Field(None, description="Alias for ph")
    turbidity: Optional[float] = Field(None, description="Water turbidity in NTU (Required)")
    ammonia: Optional[float] = Field(None, description="Current ammonia reading (Optional, ignored in model input)")
    nitrate: Optional[float] = Field(None, description="Nitrate level in mg/L (Optional, ignored in model input)")


# ---------------------------------------------------------------------------
# Helper Validation Functions
# ---------------------------------------------------------------------------
def _validate_numeric(name: str, value: Any) -> float:
    """Validate that a field exists, is numeric, and not NaN or infinite."""
    if value is None:
        raise HTTPException(
            status_code=422,
            detail=f"Field '{name}' is required."
        )
    try:
        val_float = float(value)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=422,
            detail=f"Field '{name}' must be a valid number, got {value}."
        )
    if math.isnan(val_float) or math.isinf(val_float):
        raise HTTPException(
            status_code=422,
            detail=f"Field '{name}' cannot be NaN or infinite."
        )
    return val_float


def _extract_ammonia_reading(data: Dict[str, Any]) -> List[float]:
    """
    Extract and validate the 5 core features for ammonia spike prediction:
    [temp, turbidity, do, ph, nitrate].
    """
    temp_val = data.get("temperature") if data.get("temperature") is not None else data.get("temp")
    temp = _validate_numeric("temperature (or temp)", temp_val)

    turb_val = data.get("turbidity")
    turbidity = _validate_numeric("turbidity", turb_val)

    do_val = data.get("dissolved_oxygen") if data.get("dissolved_oxygen") is not None else data.get("do")
    do = _validate_numeric("dissolved_oxygen (or do)", do_val)

    ph_val = data.get("ph") if data.get("ph") is not None else data.get("pH")
    ph = _validate_numeric("ph", ph_val)

    nitrate_val = data.get("nitrate")
    nitrate = _validate_numeric("nitrate", nitrate_val)

    return [temp, turbidity, do, ph, nitrate]


def _extract_whitespot_reading(data: Dict[str, Any]) -> List[float]:
    """
    Extract and validate the 4 core features for white spot disease prediction:
    [temp, do, ph, turbidity].
    """
    temp_val = data.get("temperature") if data.get("temperature") is not None else data.get("temp")
    temp = _validate_numeric("temperature (or temp)", temp_val)

    do_val = data.get("dissolved_oxygen") if data.get("dissolved_oxygen") is not None else data.get("do")
    do = _validate_numeric("dissolved_oxygen (or do)", do_val)

    ph_val = data.get("ph") if data.get("ph") is not None else data.get("pH")
    ph = _validate_numeric("ph", ph_val)

    turb_val = data.get("turbidity")
    turbidity = _validate_numeric("turbidity", turb_val)

    return [temp, do, ph, turbidity]


# ---------------------------------------------------------------------------
# Prediction Endpoints
# ---------------------------------------------------------------------------
@router.post(
    "/predict/ammonia",
    response_model=PredictionResponse,
    summary="Predict Ammonia Spike Risk",
    description=(
        "Evaluates water-quality parameters to predict the probability of an ammonia spike.\n\n"
        "**Required fields**: `temperature` (or `temp`), `turbidity`, `dissolved_oxygen` (or `do`), `ph`, and `nitrate`.\n\n"
        "**Model**: Random Forest Classifier trained on pond telemetry.\n\n"
        "*Note: This is a temporary model trained on public data and will be replaced with real AquaGuard data later.*"
    )
)
@router.post("/api/predict/ammonia", response_model=PredictionResponse, include_in_schema=False)
async def predict_ammonia(payload: AmmoniaPredictionInput):
    """
    Endpoint for ammonia spike forecasting using Random Forest inference.
    """
    global ammonia_model
    if ammonia_model is None:
        load_prediction_models()

    if ammonia_model is None:
        error_msg = model_load_errors.get("ammonia", f"Model file not found at {AMMONIA_MODEL_PATH}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Ammonia prediction model is currently unavailable: {error_msg}"
        )

    try:
        data_dict = payload.model_dump()
        readings_seq = payload.readings

        if readings_seq and isinstance(readings_seq, list) and len(readings_seq) > 0:
            extracted_readings = [_extract_ammonia_reading(r) for r in readings_seq]
            # Model expects 30 time steps (150 features flattened)
            if len(extracted_readings) < 30:
                first_reading = extracted_readings[0]
                padding = [first_reading] * (30 - len(extracted_readings))
                extracted_readings = padding + extracted_readings
            else:
                extracted_readings = extracted_readings[-30:]
            feature_vector = np.array(extracted_readings).flatten().reshape(1, -1)
        else:
            single_reading = _extract_ammonia_reading(data_dict)
            # Replicate single reading across 30 timesteps to match model input shape
            feature_vector = np.array(single_reading * 30).reshape(1, -1)

        # Run model inference
        proba = ammonia_model.predict_proba(feature_vector)[0]
        # Binary classification: class 1 is spike risk
        risk_probability = float(proba[1]) if len(proba) > 1 else float(proba[0])
        risk_probability = max(0.0, min(1.0, risk_probability))
        prediction = "high_risk" if risk_probability >= 0.5 else "low_risk"

        return PredictionResponse(
            risk_probability=round(risk_probability, 2),
            prediction=prediction,
            model="random_forest"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error executing ammonia prediction: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error during ammonia spike prediction: {str(exc)}"
        )


@router.post(
    "/predict/whitespot",
    response_model=PredictionResponse,
    summary="Predict White Spot Disease Risk",
    description=(
        "Evaluates water-quality parameters to predict the probability of white spot disease outbreak.\n\n"
        "**Required fields**: `temperature` (or `temp`), `dissolved_oxygen` (or `do`), `ph`, and `turbidity`.\n\n"
        "**Model**: Random Forest Classifier trained on aquaculture disease occurrence records.\n\n"
        "*Note: This is a temporary model trained on public data and will be replaced with real AquaGuard data later.*"
    )
)
@router.post("/api/predict/whitespot", response_model=PredictionResponse, include_in_schema=False)
async def predict_whitespot(payload: WhitespotPredictionInput):
    """
    Endpoint for white spot disease risk forecasting using Random Forest inference.
    """
    global whitespot_model
    if whitespot_model is None:
        load_prediction_models()

    if whitespot_model is None:
        error_msg = model_load_errors.get("whitespot", f"Model file not found at {WHITESPOT_MODEL_PATH}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"White spot disease prediction model is currently unavailable: {error_msg}"
        )

    try:
        data_dict = payload.model_dump()
        features = _extract_whitespot_reading(data_dict)
        feature_vector = np.array(features).reshape(1, -1)

        # Run model inference
        proba = whitespot_model.predict_proba(feature_vector)[0]
        # Binary classification: class 1 is disease risk
        risk_probability = float(proba[1]) if len(proba) > 1 else float(proba[0])
        risk_probability = max(0.0, min(1.0, risk_probability))
        prediction = "high_risk" if risk_probability >= 0.5 else "low_risk"

        return PredictionResponse(
            risk_probability=round(risk_probability, 2),
            prediction=prediction,
            model="random_forest"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error executing whitespot prediction: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error during white spot disease prediction: {str(exc)}"
        )
