# YOLO11n species retraining

Script: `retrain.py` (run from the repo root with `backend/venv/bin/python`).
Class order is fixed: `0 Betta, 1 Guppy, 2 Swordtail`.

## Current model

| File | What |
|---|---|
| `../aquaguard_yolo11n_best.pt` | deployed model (round 4, 2026-10-22) |
| `../aquaguard_yolo11n_best_v1.pt` | original model (rollback) |
| `aquaguard_retrain_r{1..4}_best.pt` | each retraining round |

Round 4 on the Testing 2 holdout: species 84% of tracks correct; known weakness: hands and
mats in front of / under the tank are still detected as fish.

## Recording clips

**Fish clips**: one species per clip, 10–30 s, name the file after the species
(`Guppy05.mp4`). Vary tanks, lighting and distance.

**No-fish clips (negatives)**: the cheapest way to stop false positives. Record 5–15 s each,
no fish anywhere in the frame:

- your hand moving in front of an empty tank / near the glass
- an empty tank (with and without plants, gravel, decorations)
- the stand, floor, wood, mats and room around the tank
- reflections on the glass, tank lid / top strip

## Workflow

```bash
R=species_aware_fish_tracking/training/retrain.py
D=species_aware_fish_tracking/training/dataset

# 1. Add clips. Species per clip; NONE = no fish (every frame becomes background).
backend/venv/bin/python $R extract --videos ~/Downloads/new_clips --out $D \
    --weights species_aware_fish_tracking/aquaguard_yolo11n_best.pt \
    --species Guppy05.mp4=Guppy Hand01.mp4=NONE EmptyTank01.mp4=NONE

# 2. Remove pre-label boxes on non-fish areas. Add a zone for each new fish clip
#    that shows wood/floor/sky in reject_zones.json (normalised x0,y0,x1,y1), then:
backend/venv/bin/python $R clean --data $D --negatives 12

# 3. Split: all clips train, val = an extracted set that was NEVER trained on.
backend/venv/bin/python $R split --data $D --val-data species_aware_fish_tracking/training/dataset_t2

# 4. Train (Mac GPU). Use an absolute --project path.
backend/venv/bin/python $R train --data $D --epochs 100 --device mps --project "$PWD/species_aware_fish_tracking/training/runs"

# 5. Compare against the deployed model before replacing it.
backend/venv/bin/python $R compare --data $D --new species_aware_fish_tracking/training/runs/aquaguard_retrain/weights/best.pt
```

`compare` scores against auto-made labels, so also run the new weights through the tracking
pipeline on holdout clips and count correct-species tracks, as done for rounds 1–4
(see `agent/SESSION_LOG.md`).

## Pitfalls

- Pre-labels copy the current model's mistakes. Always review a few frames per clip and
  run `clean` before training.
- Don't test on footage that is also in training. Known duplicates: `codex/Swordtail01` =
  WhatsApp 14.25.32, `Swordtail02` = WhatsApp 14.37.57, `Betta01` = WhatsApp 14.11.19.
- Keep species balanced; round 2 had too many Betta and called Swordtails "Betta".
