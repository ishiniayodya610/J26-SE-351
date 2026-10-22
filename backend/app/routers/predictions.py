"""
Prediction Router for AquaGuard AI Central Gateway
--------------------------------------------------
HYBRID PREDICTION ARCHITECTURE:
  Layer 1 – Random Forest (water parameters):
      Trained RF models provide the base risk probability using water quality
      features (temperature, pH, dissolved_oxygen, turbidity, nitrate/TDS).
      These models were trained on public aquaculture datasets as an interim solution.

  Layer 2 – Rule-Based Behavioural & Population Adjustments:
      TEMPORARY rule-based modifiers that adjust the RF base score using
      behavioural features from the Computer Vision tracker (swimming speed,
      position in water column, body posture) and population metadata
      (species type, fish count).

      These rules are grounded in published aquaculture stress-response
      literature and will be replaced with a unified multi-modal model
      once sufficient real-world training data is collected.

  Data Sources:
      - Water parameters: Real ESP32 sensors via Aquio bridge (/api/telemetry/latest)
      - Behavioural features: YOLO11n CV tracker (/api/comp2/analyze-video)
      - Population data: Active fish profile (/api/fish/active) + CV detection count

NOTE: All behavioural and population fields are OPTIONAL. The system falls
back to pure RF inference when these features are unavailable.
"""

import os
import logging
import math
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

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
class HybridPredictionResponse(BaseModel):
    """
    Extended prediction response for the hybrid RF + Rules architecture.
    Includes breakdown of base ML score vs. behavioural rule adjustments.
    """
    risk_probability: float = Field(
        ...,
        description="Final hybrid risk probability (between 0.0 and 1.0)",
        examples=[0.74]
    )
    prediction: str = Field(
        ...,
        description="Qualitative risk classification: 'high_risk' or 'low_risk'",
        examples=["high_risk"]
    )
    model: str = Field(
        default="random_forest+rules",
        description="Model architecture used for inference",
        examples=["random_forest+rules"]
    )
    base_rf_score: float = Field(
        default=0.0,
        description="Raw probability from the Random Forest model before rule adjustments",
        examples=[0.61]
    )
    behaviour_adjustment: float = Field(
        default=0.0,
        description="Net adjustment applied by behavioural and population rules",
        examples=[0.13]
    )
    active_features: List[str] = Field(
        default_factory=list,
        description="List of behavioural/population features that were available and used",
        examples=[["swimming_speed", "position", "species"]]
    )
    adjustment_details: List[str] = Field(
        default_factory=list,
        description="Human-readable explanations of each rule that fired",
        examples=[["Lethargic swimming detected (+12%)", "Surface piping detected (+15%)"]]
    )


# Keep backward-compatible alias
PredictionResponse = HybridPredictionResponse


class AmmoniaPredictionInput(BaseModel):
    """
    Input schema for ammonia spike risk prediction (Hybrid RF + Rules).

    Required features (for RF model):
      - temperature (or temp) [°C]
      - turbidity [NTU]
      - dissolved_oxygen (or do) [mg/L or g/ml]
      - ph (or pH)
      - nitrate [mg/L or g/ml]

    Optional behavioural features (for rule-based adjustment layer):
      - tds: Total dissolved solids [ppm]
      - swimming_speed: Average swimming speed [BL/s] from CV tracker
      - position: Water column position (surface/middle/bottom) from CV tracker
      - posture: Body posture (horizontal/head-up/head-down) from CV tracker
      - species: Fish species (guppy/swordtail/betta)
      - fish_count: Number of fish detected by CV tracker

    Optional parameters:
      - ammonia: Accepted for payload flexibility; not used as an input feature
      - readings: Optional sequence of recent readings (up to 30) for time-series context
      - auto_enrich: If true, automatically pull latest CV and telemetry data (default: true)
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

    # Behavioural & population features (Layer 2 - Rule-Based)
    tds: Optional[float] = Field(None, description="Total dissolved solids in ppm")
    swimming_speed: Optional[float] = Field(None, description="Average swimming speed in BL/s from CV tracker")
    position: Optional[str] = Field(None, description="Water column position: 'surface', 'top', 'middle', 'bottom'")
    posture: Optional[str] = Field(None, description="Body posture: 'horizontal', 'head-up', 'head-down'")
    species: Optional[str] = Field(None, description="Fish species: 'guppy', 'swordtail', 'betta'")
    fish_count: Optional[int] = Field(None, description="Number of fish detected by CV tracker")

    # Auto-enrich from live system state
    auto_enrich: Optional[bool] = Field(True, description="Auto-pull latest CV and telemetry data if fields not provided")


class WhitespotPredictionInput(BaseModel):
    """
    Input schema for white spot disease risk prediction (Hybrid RF + Rules).

    Required features (for RF model):
      - temperature (or temp) [°C]
      - dissolved_oxygen (or do) [mg/L]
      - ph (or pH)
      - turbidity [NTU]

    Optional behavioural features (for rule-based adjustment layer):
      - tds: Total dissolved solids [ppm]
      - swimming_speed: Average swimming speed [BL/s] from CV tracker
      - position: Water column position from CV tracker
      - posture: Body posture from CV tracker
      - species: Fish species
      - fish_count: Number of fish detected

    Optional parameters:
      - ammonia, nitrate: Accepted for payload flexibility; not used in whitespot inference
      - auto_enrich: If true, auto-pull latest CV and telemetry data (default: true)
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

    # Behavioural & population features (Layer 2 - Rule-Based)
    tds: Optional[float] = Field(None, description="Total dissolved solids in ppm")
    swimming_speed: Optional[float] = Field(None, description="Average swimming speed in BL/s from CV tracker")
    position: Optional[str] = Field(None, description="Water column position: 'surface', 'top', 'middle', 'bottom'")
    posture: Optional[str] = Field(None, description="Body posture: 'horizontal', 'head-up', 'head-down'")
    species: Optional[str] = Field(None, description="Fish species: 'guppy', 'swordtail', 'betta'")
    fish_count: Optional[int] = Field(None, description="Number of fish detected by CV tracker")

    # Auto-enrich from live system state
    auto_enrich: Optional[bool] = Field(True, description="Auto-pull latest CV and telemetry data if fields not provided")


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
# Auto-Enrichment: Pull live data from telemetry + CV tracker
# ---------------------------------------------------------------------------
def _auto_enrich_features(data_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Automatically enrich the prediction input with live data from:
    1. Latest telemetry state (real ESP32 sensor readings via Aquio bridge)
    2. Latest CV behavioural analysis (from last video upload via YOLO11n tracker)
    3. Active fish profile (species identification)

    Only fills in fields that were NOT already provided by the caller.
    """
    enriched = dict(data_dict)

    # --- Pull from latest telemetry (real ESP32 sensors) ---
    try:
        from backend.app.routers.telemetry import latest_telemetry_state
        tel = latest_telemetry_state.get("telemetry", {})
        if enriched.get("tds") is None and tel.get("tds_ppm") is not None:
            enriched["tds"] = tel["tds_ppm"]
    except ImportError:
        pass

    # --- Pull from latest CV behavioural analysis ---
    try:
        from backend.app.routers.comp2_vision import latest_cv_behavior
        if latest_cv_behavior:
            if enriched.get("swimming_speed") is None and latest_cv_behavior.get("average_speed_bl_s") is not None:
                enriched["swimming_speed"] = latest_cv_behavior["average_speed_bl_s"]
            if enriched.get("position") is None and latest_cv_behavior.get("position") is not None:
                enriched["position"] = latest_cv_behavior["position"]
            if enriched.get("posture") is None and latest_cv_behavior.get("posture") is not None:
                enriched["posture"] = latest_cv_behavior["posture"]
            if enriched.get("fish_count") is None and latest_cv_behavior.get("frames_processed") is not None:
                # Use frames_processed as a proxy; real fish_count would come from multi-detection
                enriched["fish_count"] = None  # Don't fabricate count from frame count
    except ImportError:
        pass

    # --- Pull from active fish profile ---
    try:
        from backend.app.routers.fish_profile import active_profile
        if enriched.get("species") is None and active_profile is not None:
            enriched["species"] = active_profile.species_id.lower()
    except ImportError:
        pass

    return enriched


# ---------------------------------------------------------------------------
# TEMPORARY RULE-BASED ADJUSTMENT LAYER
# ---------------------------------------------------------------------------
# These adjustments are based on published aquaculture stress-response
# literature. Each rule is individually bounded and clearly documented.
# This layer will be replaced with a unified multi-modal neural network
# once sufficient real-world AquaGuard training data is collected from
# the Computer Vision tracker and ESP32 sensor bridge.
# ---------------------------------------------------------------------------

def _apply_ammonia_behaviour_rules(
    base_score: float,
    data: Dict[str, Any]
) -> tuple:
    """
    TEMPORARY RULE-BASED ADJUSTMENT for ammonia spike prediction.

    Applies bounded behavioural and population adjustments on top of the
    Random Forest base score. Returns (final_score, adjustment, active_features, details).

    Scientific rationale for each rule:
    - Lethargy (low speed): Direct ammonia stress response; fish become listless
      as ammonia damages gill epithelia (Randall & Tsui, 2002).
    - Surface piping: Fish at surface gasping indicates hypoxia or ammonia
      toxicity disrupting O2 transport (Francis-Floyd, 2003).
    - Head-up/tail-down posture: Abnormal posture signals gill distress and
      osmoregulatory failure from ammonia exposure (Shirer et al., 1968).
    - Overcrowding: Higher fish density increases nitrogenous waste production
      directly proportional to ammonia generation (Timmons & Ebeling, 2010).
    - Species sensitivity: Bettas have lower ammonia tolerance (0.02 mg/L)
      compared to guppies (0.05 mg/L) and swordtails (0.06 mg/L).
    - High TDS: Elevated dissolved solids correlate with accumulated waste.
    - Active swimming: Healthy active fish indicate good water quality.
    """
    adjustment = 0.0
    active_features: List[str] = []
    details: List[str] = []

    # --- Swimming Speed ---
    speed = data.get("swimming_speed")
    if speed is not None:
        active_features.append("swimming_speed")
        if speed < 0.5:
            adj = 0.12
            adjustment += adj
            details.append(f"Lethargic swimming ({speed:.2f} BL/s < 0.5 threshold) → +{adj*100:.0f}%")
        elif speed > 2.0:
            adj = -0.05
            adjustment += adj
            details.append(f"Active healthy swimming ({speed:.2f} BL/s) → {adj*100:.0f}%")

    # --- Water Column Position ---
    position = (data.get("position") or "").lower().strip()
    if position:
        active_features.append("position")
        if position in ("surface", "top"):
            adj = 0.15
            adjustment += adj
            details.append(f"Surface piping detected (position: {position}) → +{adj*100:.0f}%")
        elif position == "bottom":
            adj = 0.05
            adjustment += adj
            details.append(f"Bottom-dwelling detected (position: {position}) → +{adj*100:.0f}%")

    # --- Body Posture ---
    posture = (data.get("posture") or "").lower().strip()
    if posture:
        active_features.append("posture")
        if "head-up" in posture or "head up" in posture:
            adj = 0.10
            adjustment += adj
            details.append(f"Head-up/tail-down posture detected → +{adj*100:.0f}%")
        elif "head-down" in posture or "head down" in posture:
            adj = 0.06
            adjustment += adj
            details.append(f"Head-down posture detected → +{adj*100:.0f}%")

    # --- Fish Count (Overcrowding) ---
    fish_count = data.get("fish_count")
    if fish_count is not None and isinstance(fish_count, (int, float)):
        active_features.append("fish_count")
        if fish_count > 20:
            adj = 0.08
            adjustment += adj
            details.append(f"Overcrowding detected ({fish_count} fish > 20) → +{adj*100:.0f}%")
        elif fish_count > 10:
            adj = 0.04
            adjustment += adj
            details.append(f"Moderate density ({fish_count} fish) → +{adj*100:.0f}%")

    # --- Species Sensitivity ---
    species = (data.get("species") or "").lower().strip()
    if species:
        active_features.append("species")
        if species == "betta":
            adj = 0.05
            adjustment += adj
            details.append(f"Betta species (high ammonia sensitivity) → +{adj*100:.0f}%")
        elif species == "guppy":
            adj = 0.03
            adjustment += adj
            details.append(f"Guppy species (moderate ammonia sensitivity) → +{adj*100:.0f}%")

    # --- TDS (Dissolved Waste Load) ---
    tds = data.get("tds")
    if tds is not None:
        active_features.append("tds")
        if tds > 500:
            adj = 0.08
            adjustment += adj
            details.append(f"High TDS ({tds:.0f} ppm > 500) indicates waste load → +{adj*100:.0f}%")
        elif tds > 350:
            adj = 0.04
            adjustment += adj
            details.append(f"Elevated TDS ({tds:.0f} ppm) → +{adj*100:.0f}%")

    final_score = max(0.0, min(1.0, base_score + adjustment))
    return final_score, adjustment, active_features, details


def _apply_whitespot_behaviour_rules(
    base_score: float,
    data: Dict[str, Any]
) -> tuple:
    """
    TEMPORARY RULE-BASED ADJUSTMENT for white spot (Ich) disease prediction.

    Scientific rationale:
    - Lethargy: Infected fish become lethargic as trophonts damage skin and
      gills (Dickerson, 2006).
    - Head-down/tail-up posture: Classic Ich stress response; fish attempt
      to dislodge parasites by rubbing against substrate (Matthews, 2005).
    - Bottom-sitting: Immune-stressed fish hide at substrate level.
    - Guppy susceptibility: Guppies lack robust mucus layer protection
      making them highly vulnerable to Ich attachment (Colorni & Burgess, 1997).
    - Dense populations: Higher density accelerates Ich theront transmission
      between hosts (Jorgensen, 2017).
    - Low TDS: Unstable mineral content weakens osmoregulation and immunity.
    - Active swimming: Vigorous swimming indicates healthy immune response.
    """
    adjustment = 0.0
    active_features: List[str] = []
    details: List[str] = []

    # --- Swimming Speed ---
    speed = data.get("swimming_speed")
    if speed is not None:
        active_features.append("swimming_speed")
        if speed < 0.5:
            adj = 0.10
            adjustment += adj
            details.append(f"Lethargic swimming ({speed:.2f} BL/s < 0.5 threshold) → +{adj*100:.0f}%")
        elif speed > 2.0:
            adj = -0.05
            adjustment += adj
            details.append(f"Active healthy swimming ({speed:.2f} BL/s) → {adj*100:.0f}%")

    # --- Body Posture ---
    posture = (data.get("posture") or "").lower().strip()
    if posture:
        active_features.append("posture")
        if "head-down" in posture or "head down" in posture:
            adj = 0.12
            adjustment += adj
            details.append(f"Head-down/tail-up posture (Ich rubbing behaviour) → +{adj*100:.0f}%")
        elif "head-up" in posture or "head up" in posture:
            adj = 0.06
            adjustment += adj
            details.append(f"Head-up posture detected → +{adj*100:.0f}%")

    # --- Water Column Position ---
    position = (data.get("position") or "").lower().strip()
    if position:
        active_features.append("position")
        if position == "bottom":
            adj = 0.10
            adjustment += adj
            details.append(f"Bottom-sitting detected (immune-stressed hiding) → +{adj*100:.0f}%")
        elif position in ("surface", "top"):
            adj = 0.05
            adjustment += adj
            details.append(f"Surface dwelling detected → +{adj*100:.0f}%")

    # --- Species Susceptibility ---
    species = (data.get("species") or "").lower().strip()
    if species:
        active_features.append("species")
        if species == "guppy":
            adj = 0.08
            adjustment += adj
            details.append(f"Guppy species (high Ich susceptibility) → +{adj*100:.0f}%")
        elif species == "betta":
            adj = 0.04
            adjustment += adj
            details.append(f"Betta species (moderate Ich susceptibility) → +{adj*100:.0f}%")

    # --- Fish Count (Transmission Density) ---
    fish_count = data.get("fish_count")
    if fish_count is not None and isinstance(fish_count, (int, float)):
        active_features.append("fish_count")
        if fish_count > 15:
            adj = 0.06
            adjustment += adj
            details.append(f"Dense population ({fish_count} fish > 15) increases parasite spread → +{adj*100:.0f}%")
        elif fish_count > 8:
            adj = 0.03
            adjustment += adj
            details.append(f"Moderate population ({fish_count} fish) → +{adj*100:.0f}%")

    # --- TDS (Low mineral = weak immunity) ---
    tds = data.get("tds")
    if tds is not None:
        active_features.append("tds")
        if tds < 100:
            adj = 0.05
            adjustment += adj
            details.append(f"Low TDS ({tds:.0f} ppm < 100) weakens osmoregulation → +{adj*100:.0f}%")
        elif tds > 500:
            adj = 0.03
            adjustment += adj
            details.append(f"High TDS ({tds:.0f} ppm) indicates degraded water → +{adj*100:.0f}%")

    final_score = max(0.0, min(1.0, base_score + adjustment))
    return final_score, adjustment, active_features, details


# ---------------------------------------------------------------------------
# Prediction Endpoints
# ---------------------------------------------------------------------------
@router.post(
    "/predict/ammonia",
    response_model=HybridPredictionResponse,
    summary="Predict Ammonia Spike Risk (Hybrid RF + Behavioural Rules)",
    description=(
        "Evaluates water-quality parameters using a Random Forest model, then applies "
        "rule-based behavioural and population adjustments from CV tracker data.\n\n"
        "**Required fields**: `temperature` (or `temp`), `turbidity`, `dissolved_oxygen` (or `do`), `ph`, and `nitrate`.\n\n"
        "**Optional behavioural fields**: `swimming_speed`, `position`, `posture`, `species`, `fish_count`, `tds`.\n\n"
        "**Auto-enrich**: Set `auto_enrich: true` (default) to automatically pull latest CV and telemetry data.\n\n"
        "**Model**: Random Forest Classifier + Rule-Based Behavioural Adjustment Layer.\n\n"
        "*Note: RF model trained on public data; behavioural rules are temporary and literature-grounded.*"
    )
)
@router.post("/api/predict/ammonia", response_model=HybridPredictionResponse, include_in_schema=False)
async def predict_ammonia(payload: AmmoniaPredictionInput):
    """
    Endpoint for ammonia spike forecasting using hybrid RF + behavioural rules.
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

        # Auto-enrich with live telemetry + CV data if enabled
        if payload.auto_enrich:
            data_dict = _auto_enrich_features(data_dict)

        # --- Layer 1: Random Forest Base Inference ---
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
        base_rf_score = float(proba[1]) if len(proba) > 1 else float(proba[0])
        base_rf_score = max(0.0, min(1.0, base_rf_score))

        # --- Layer 2: Rule-Based Behavioural Adjustments ---
        final_score, adjustment, active_features, details = _apply_ammonia_behaviour_rules(
            base_rf_score, data_dict
        )

        prediction = "high_risk" if final_score >= 0.5 else "low_risk"
        model_tag = "random_forest+rules" if active_features else "random_forest"

        logger.info(
            "Ammonia prediction: RF=%.2f, adj=%.2f, final=%.2f, features=%s",
            base_rf_score, adjustment, final_score, active_features
        )

        return HybridPredictionResponse(
            risk_probability=round(final_score, 2),
            prediction=prediction,
            model=model_tag,
            base_rf_score=round(base_rf_score, 2),
            behaviour_adjustment=round(adjustment, 2),
            active_features=active_features,
            adjustment_details=details
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
    response_model=HybridPredictionResponse,
    summary="Predict White Spot Disease Risk (Hybrid RF + Behavioural Rules)",
    description=(
        "Evaluates water-quality parameters using a Random Forest model, then applies "
        "rule-based behavioural and population adjustments from CV tracker data.\n\n"
        "**Required fields**: `temperature` (or `temp`), `dissolved_oxygen` (or `do`), `ph`, and `turbidity`.\n\n"
        "**Optional behavioural fields**: `swimming_speed`, `position`, `posture`, `species`, `fish_count`, `tds`.\n\n"
        "**Auto-enrich**: Set `auto_enrich: true` (default) to automatically pull latest CV and telemetry data.\n\n"
        "**Model**: Random Forest Classifier + Rule-Based Behavioural Adjustment Layer.\n\n"
        "*Note: RF model trained on public data; behavioural rules are temporary and literature-grounded.*"
    )
)
@router.post("/api/predict/whitespot", response_model=HybridPredictionResponse, include_in_schema=False)
async def predict_whitespot(payload: WhitespotPredictionInput):
    """
    Endpoint for white spot disease risk forecasting using hybrid RF + behavioural rules.
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

        # Auto-enrich with live telemetry + CV data if enabled
        if payload.auto_enrich:
            data_dict = _auto_enrich_features(data_dict)

        # --- Layer 1: Random Forest Base Inference ---
        features = _extract_whitespot_reading(data_dict)
        feature_vector = np.array(features).reshape(1, -1)

        # Run model inference
        proba = whitespot_model.predict_proba(feature_vector)[0]
        # Binary classification: class 1 is disease risk
        base_rf_score = float(proba[1]) if len(proba) > 1 else float(proba[0])
        base_rf_score = max(0.0, min(1.0, base_rf_score))

        # --- Layer 2: Rule-Based Behavioural Adjustments ---
        final_score, adjustment, active_features, details = _apply_whitespot_behaviour_rules(
            base_rf_score, data_dict
        )

        prediction = "high_risk" if final_score >= 0.5 else "low_risk"
        model_tag = "random_forest+rules" if active_features else "random_forest"

        logger.info(
            "Whitespot prediction: RF=%.2f, adj=%.2f, final=%.2f, features=%s",
            base_rf_score, adjustment, final_score, active_features
        )

        return HybridPredictionResponse(
            risk_probability=round(final_score, 2),
            prediction=prediction,
            model=model_tag,
            base_rf_score=round(base_rf_score, 2),
            behaviour_adjustment=round(adjustment, 2),
            active_features=active_features,
            adjustment_details=details
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error executing whitespot prediction: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error during white spot disease prediction: {str(exc)}"
        )
