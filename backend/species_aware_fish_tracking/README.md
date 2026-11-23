# Species-Aware Multi-Fish Tracking & Behavior Auditing

## Supported Species
- Betta
- Guppy
- Swordtail

## Pipeline
Video → YOLO11n → ByteTrack → Fish ID → Speed → Position → Direction → Behavior Classification

## Outputs
- Fish ID
- Species
- Average Speed (BL/s)
- Stationary Percentage
- Position
- Direction
- PROTOTYPE_NORMAL / PROTOTYPE_ABNORMAL
- Reason

## Model
aquaguard_yolo11n_best.pt

## Install
pip install -r requirements.txt

## Notes
Behavior results are prototype classifications and are not validated biological or medical diagnoses.