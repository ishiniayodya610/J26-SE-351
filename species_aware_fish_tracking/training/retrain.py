"""AquaGuard YOLO11n species retraining pipeline.

The current weights localise fish reasonably well but confuse species on real tank
footage (Betta -> Guppy, Guppy -> Swordtail). This script turns your own clips into a
YOLO dataset and fine-tunes from the existing weights.

Steps (run from the repo root with backend/venv/bin/python):

  1. extract  Sample frames from clips, skip near-duplicates, and pre-label every frame
              with the CURRENT model's boxes but the species YOU state for that clip.
              Clips without a species (mixed tanks) get boxes with the model's own class
              and must be corrected by hand.
  2. (manual) Open dataset/raw in CVAT or Roboflow (YOLO 1.1 format), fix wrong/missing
              boxes and classes, delete junk frames, export back into dataset/raw.
  3. split    Train/val split BY CLIP (frames from one clip never land in both sets,
              otherwise val accuracy is inflated) and write data.yaml.
  4. train    Fine-tune from aquaguard_yolo11n_best.pt. Never overwrites the old weights.
  5. compare  Evaluate old vs new weights on the same val set and print mAP side by side.

Example:
  python species_aware_fish_tracking/training/retrain.py extract \\
      --videos "~/Downloads/Fish Tracking" --out dataset \\
      --species Betta03.mp4=Betta Guppy04.mp4=Guppy
  python species_aware_fish_tracking/training/retrain.py split --data dataset
  python species_aware_fish_tracking/training/retrain.py train --data dataset --epochs 80
  python species_aware_fish_tracking/training/retrain.py compare --data dataset \\
      --new runs/aquaguard_retrain/weights/best.pt
"""

import argparse
import hashlib
import json
import os
import random
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
BASE_WEIGHTS = HERE.parent / "aquaguard_yolo11n_best.pt"
CLASS_NAMES = ["Betta", "Guppy", "Swordtail"]  # must match the existing model's index order
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
PRELABEL_CONF = 0.30


def _clip_id(path):
    """Short stable id per clip, used to keep a clip's frames in one split."""
    return hashlib.sha1(path.name.encode()).hexdigest()[:8]


def _thumb(frame):
    """Tiny grayscale thumbnail for near-duplicate detection."""
    g = cv2.cvtColor(cv2.resize(frame, (32, 32)), cv2.COLOR_BGR2GRAY)
    return g.astype(np.float32)


def _parse_species(pairs):
    mapping = {}
    for p in pairs or []:
        if "=" not in p:
            sys.exit(f"--species expects clip=Species, got '{p}'")
        clip, sp = p.split("=", 1)
        if sp not in CLASS_NAMES:
            sys.exit(f"Unknown species '{sp}'. Use one of {CLASS_NAMES}.")
        mapping[clip.strip()] = CLASS_NAMES.index(sp)
    return mapping


def cmd_extract(args):
    from ultralytics import YOLO

    videos_dir = Path(os.path.expanduser(args.videos))
    raw = Path(args.out) / "raw"
    (raw / "images").mkdir(parents=True, exist_ok=True)
    (raw / "labels").mkdir(parents=True, exist_ok=True)
    species = _parse_species(args.species)
    model = YOLO(str(args.weights))

    clips = sorted(p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXT)
    if not clips:
        sys.exit(f"No videos found in {videos_dir}")

    seen_sizes = {}
    manifest = {}
    for clip in clips:
        size = clip.stat().st_size
        if size in seen_sizes:  # WhatsApp re-exports are byte-identical copies
            print(f"skip duplicate {clip.name} (same as {seen_sizes[size]})")
            continue
        seen_sizes[size] = clip.name
        forced = species.get(clip.name)
        cid = _clip_id(clip)
        cap = cv2.VideoCapture(str(clip))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        step = max(1, int(round(fps * args.every)))
        prev, kept, idx = None, 0, 0
        while kept < args.max_per_clip:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                th = _thumb(frame)
                if prev is None or float(np.mean(np.abs(th - prev))) > args.min_diff:
                    prev = th
                    name = f"{cid}_{idx:06d}"
                    lines = _prelabel(model, frame, forced)
                    # In a known-species clip an empty frame means the model MISSED the fish;
                    # saving it as a negative would teach "fish = background". Skip it.
                    if forced is None or lines:
                        cv2.imwrite(str(raw / "images" / f"{name}.jpg"), frame)
                        (raw / "labels" / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""))
                        kept += 1
            idx += 1
        cap.release()
        manifest[cid] = {"clip": clip.name, "frames": kept,
                         "species": CLASS_NAMES[forced] if forced is not None else "MIXED (fix by hand)"}
        print(f"{clip.name}: {kept} frames, species={manifest[cid]['species']}")

    (raw / "classes.txt").write_text("\n".join(CLASS_NAMES) + "\n")
    (Path(args.out) / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nPre-labelled frames in {raw}. Review them in CVAT/Roboflow (YOLO format) before 'split'.")


def _prelabel(model, frame, forced_cls):
    """YOLO label lines from the current model; class forced to the clip's species when known."""
    res = model.predict(frame, conf=PRELABEL_CONF, imgsz=640, verbose=False)[0]
    lines = []
    if res.boxes is not None:
        for (cx, cy, w, h), c in zip(res.boxes.xywhn.tolist(), res.boxes.cls.tolist()):
            cls = forced_cls if forced_cls is not None else int(c)
            lines.append(f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
    # An empty list in a MIXED clip is kept as a valid negative example (background, empty tank).
    return lines


def cmd_clean(args):
    """Remove pre-label boxes inside per-clip reject zones (wood, floor, sky) and oversized boxes."""
    zones = json.loads(Path(args.zones).read_text())
    max_w = zones.get("_global", {}).get("max_box_w", 1.0)
    for root in args.data:
        root = Path(root)
        manifest = json.loads((root / "manifest.json").read_text())
        for cid, info in manifest.items():
            clip_zones = zones.get(info["clip"], [])
            removed = kept = 0
            for lbl in sorted((root / "raw" / "labels").glob(f"{cid}_*.txt")):
                out = []
                for line in lbl.read_text().splitlines():
                    if not line.strip():
                        continue
                    _, cx, cy, w, h = map(float, line.split())
                    in_zone = any(x0 <= cx <= x1 and y0 <= cy <= y1 for x0, y0, x1, y1 in clip_zones)
                    if in_zone or w > max_w:
                        removed += 1
                    else:
                        out.append(line)
                        kept += 1
                lbl.write_text("\n".join(out) + ("\n" if out else ""))
            if removed:
                print(f"{root.name}/{info['clip']}: removed {removed} non-fish boxes, kept {kept}")
            if args.negatives and clip_zones:
                print(f"  + {_write_zone_negatives(root, cid, clip_zones, args.negatives)} hard-negative crops")


def _write_zone_negatives(root, cid, clip_zones, per_zone):
    """Crop reviewed non-fish zones (wood, floor, sky) into fish-free images with empty labels."""
    raw = root / "raw"
    frames = sorted((raw / "images").glob(f"{cid}_*.jpg"))
    picks = frames[:: max(1, len(frames) // per_zone)][:per_zone]
    n = 0
    for zi, (x0, y0, x1, y1) in enumerate(clip_zones):
        if (x1 - x0) * (y1 - y0) < 0.04:  # too small to be a useful image
            continue
        for f in picks:
            im = cv2.imread(str(f))
            h, w = im.shape[:2]
            crop = im[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
            name = f"neg_{f.stem}_z{zi}"
            cv2.imwrite(str(raw / "images" / f"{name}.jpg"), crop)
            (raw / "labels" / f"{name}.txt").write_text("")
            n += 1
    return n


def cmd_split(args):
    data = Path(args.data)
    raw = data / "raw"
    images = sorted((raw / "images").glob("*.jpg"))
    if not images:
        sys.exit(f"No images in {raw / 'images'} - run extract first.")
    by_clip = {}
    for img in images:
        by_clip.setdefault(img.stem.split("_")[0], []).append(img)

    clips = sorted(by_clip)
    rng = random.Random(args.seed)
    manifest_path = data / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    by_species = {}
    for cid in clips:
        by_species.setdefault(manifest.get(cid, {}).get("species", "MIXED (fix by hand)"), []).append(cid)
    if args.val_data:
        return _split_external_val(data, raw, images, Path(args.val_data))
    val_clips = set()
    # Stratified: hold out one clip per known species so val measures every class.
    for sp, cids in sorted(by_species.items()):
        if sp in CLASS_NAMES and len(cids) >= 2:
            val_clips.add(rng.choice(sorted(cids)))
    if not val_clips and len(clips) > 1:
        rng.shuffle(clips)
        val_clips = set(clips[:max(1, round(len(clips) * args.val_frac))])
    if not val_clips:
        print("WARNING: only one clip - val set will reuse train frames; metrics will be optimistic.")

    for split in ("train", "val"):
        for sub in ("images", "labels"):
            d = data / split / sub
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True)

    counts = {"train": 0, "val": 0}
    for cid, imgs in by_clip.items():
        splits = ["val"] if cid in val_clips else ["train"]
        if not val_clips:
            splits = ["train", "val"]
        for split in splits:
            for img in imgs:
                lbl = raw / "labels" / f"{img.stem}.txt"
                shutil.copy2(img, data / split / "images" / img.name)
                if lbl.exists():
                    shutil.copy2(lbl, data / split / "labels" / lbl.name)
                counts[split] += 1

    yaml = (f"path: {data.resolve()}\ntrain: train/images\nval: val/images\n"
            f"names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(CLASS_NAMES)))
    (data / "data.yaml").write_text(yaml)
    print(f"train={counts['train']} val={counts['val']} (val clips: {sorted(val_clips)})")
    print(f"wrote {data / 'data.yaml'}")


def _split_external_val(data, raw, images, val_raw_root):
    """All clips in `data` train; val comes from a separately extracted, never-trained set."""
    val_raw = val_raw_root / "raw"
    val_images = sorted((val_raw / "images").glob("*.jpg"))
    if not val_images:
        sys.exit(f"No images in {val_raw / 'images'} - run extract on the test clips first.")
    for split, src_raw, imgs in (("train", raw, images), ("val", val_raw, val_images)):
        for sub in ("images", "labels"):
            d = data / split / sub
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True)
        for img in imgs:
            shutil.copy2(img, data / split / "images" / img.name)
            lbl = src_raw / "labels" / f"{img.stem}.txt"
            if lbl.exists():
                shutil.copy2(lbl, data / split / "labels" / lbl.name)
    _write_data_yaml(data)
    print(f"train={len(images)} (all clips) val={len(val_images)} (external: {val_raw_root})")


def _write_data_yaml(data):
    yaml = (f"path: {data.resolve()}\ntrain: train/images\nval: val/images\n"
            f"names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(CLASS_NAMES)))
    (data / "data.yaml").write_text(yaml)
    print(f"wrote {data / 'data.yaml'}")


def cmd_train(args):
    from ultralytics import YOLO

    data_yaml = Path(args.data) / "data.yaml"
    if not data_yaml.exists():
        sys.exit("data.yaml missing - run split first.")
    model = YOLO(str(args.weights))
    model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=640,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name="aquaguard_retrain",
        exist_ok=True,
        patience=20,
        # Tank footage: colour is a key species cue, so keep hue jitter small.
        hsv_h=0.005,
        fliplr=0.5,
        mosaic=1.0,
        close_mosaic=10,
    )
    best = Path(args.project) / "aquaguard_retrain" / "weights" / "best.pt"
    print(f"\nNew weights: {best}\nOld weights untouched: {args.weights}")
    print("Run 'compare' before copying the new file over the deployed model.")


def cmd_compare(args):
    from ultralytics import YOLO

    data_yaml = str(Path(args.data) / "data.yaml")
    rows = []
    for label, w in (("old", args.weights), ("new", args.new)):
        m = YOLO(str(w)).val(data=data_yaml, imgsz=640, device=args.device, verbose=False, plots=False)
        # box.maps fills classes absent from val with the overall mAP, so report only present ones.
        per_cls = {CLASS_NAMES[int(i)]: round(float(m.box.maps[int(i)]), 3) for i in m.box.ap_class_index}
        rows.append((label, round(float(m.box.map50), 3), round(float(m.box.map), 3), per_cls))
    print(f"{'weights':8} {'mAP50':>6} {'mAP50-95':>9}  per-class mAP50-95")
    for label, m50, m, pc in rows:
        print(f"{label:8} {m50:>6} {m:>9}  {pc}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("extract", help="sample + pre-label frames from clips")
    e.add_argument("--videos", required=True)
    e.add_argument("--out", default="dataset")
    e.add_argument("--species", nargs="*", help="clip.mp4=Betta|Guppy|Swordtail (omit for mixed tanks)")
    e.add_argument("--every", type=float, default=0.5, help="seconds between sampled frames")
    e.add_argument("--max-per-clip", type=int, default=120)
    e.add_argument("--min-diff", type=float, default=6.0, help="near-duplicate threshold (0-255)")
    e.add_argument("--weights", default=BASE_WEIGHTS)

    s = sub.add_parser("split", help="train/val split by clip + data.yaml")
    s.add_argument("--data", default="dataset")
    s.add_argument("--val-frac", type=float, default=0.2)
    s.add_argument("--seed", type=int, default=42)
    s.add_argument("--val-data", help="use another extracted dataset (never trained on) as val; all --data clips train")

    cl = sub.add_parser("clean", help="drop pre-label boxes in reviewed non-fish zones")
    cl.add_argument("--data", nargs="+", default=["dataset"])
    cl.add_argument("--zones", default=str(HERE / "reject_zones.json"))
    cl.add_argument("--negatives", type=int, default=0, help="also save N fish-free crops per zone (training sets only)")

    t = sub.add_parser("train", help="fine-tune from current weights")
    t.add_argument("--data", default="dataset")
    t.add_argument("--epochs", type=int, default=80)
    t.add_argument("--batch", type=int, default=16)
    t.add_argument("--device", default=None, help="cpu, mps, 0 ... (default: auto)")
    t.add_argument("--project", default="runs")
    t.add_argument("--weights", default=BASE_WEIGHTS)

    c = sub.add_parser("compare", help="old vs new weights on the val set")
    c.add_argument("--data", default="dataset")
    c.add_argument("--new", required=True)
    c.add_argument("--device", default=None)
    c.add_argument("--weights", default=BASE_WEIGHTS)

    args = ap.parse_args()
    {"extract": cmd_extract, "clean": cmd_clean, "split": cmd_split, "train": cmd_train, "compare": cmd_compare}[args.cmd](args)


if __name__ == "__main__":
    main()
