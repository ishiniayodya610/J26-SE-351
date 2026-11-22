"""
Multi-fish ByteTrack pipeline for uploaded videos (Phases 1-3 of
docs/multi-fish-tracking-plan.md).

analyze_multi() runs model.track(tracker=aquaguard_bytetrack.yaml, persist=True) over a
sampled frame loop, accumulates per-track centroid/bbox/body-length/class votes,
computes per-track kinematics with the same math the old single-fish pipeline
used, runs the behavior engine per track and returns {video, summary, tracks,
timeline, annotated_video_url}. Boxes are normalised 0-1 xyxy.

Track IDs are ByteTrack IDs, not physical fish identity ("Track #N").
"""

import os
import threading
import uuid
from collections import Counter, defaultdict

import cv2
import numpy as np

STATIONARY_BL_S = 0.12      # hand-tremor deadband, same as legacy pipeline
MIN_TRACK_SECONDS = 1.0     # shorter tracks -> INSUFFICIENT_DATA
ROLLING_WINDOW_S = 1.0      # timeline speed/dir window
TRACK_CONF = 0.25          # detector floor; was 0.10 -> boxes on posters/floor
TRACKER_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aquaguard_bytetrack.yaml")
MIN_TRACK_MEAN_CONF = 0.30  # tracks below this mean confidence are dropped as non-fish
MAX_FISH_ASPECT = 5.0       # w/h (or h/w) beyond this is a shelf edge / poster strip, not a fish
MAX_BOX_WIDTH_FRAC = 0.8    # a "fish" spanning >80% of the frame width is a false positive
TRACK_IMGSZ = 640

# Shared upload model is not re-entrant (tracker state lives on its predictor).
_track_lock = threading.Lock()


def _np(x):
    if x is None:
        return None
    if hasattr(x, "cpu"):
        x = x.cpu()
    if hasattr(x, "numpy"):
        x = x.numpy()
    return np.asarray(x)


def extract_tracked_boxes(result, names):
    """ultralytics Result -> [{id, xyxy(px), species, confidence}] (tracked boxes only)."""
    boxes = getattr(result, "boxes", None)
    if boxes is None or getattr(boxes, "id", None) is None or len(boxes) == 0:
        return []
    ids = _np(boxes.id).astype(int).tolist()
    xyxy = _np(boxes.xyxy).astype(float).tolist()
    cls = _np(boxes.cls).astype(int).tolist()
    conf = _np(boxes.conf).astype(float).tolist()
    out = []
    for tid, b, c, p in zip(ids, xyxy, cls, conf):
        out.append({
            "id": int(tid),
            "xyxy": [float(v) for v in b],
            "species": names.get(c, str(c)) if isinstance(names, dict) else str(names[c]),
            "confidence": float(p),
        })
    return out


def make_record(det, t):
    x1, y1, x2, y2 = det["xyxy"]
    w = max(1.0, x2 - x1)
    h = max(1.0, y2 - y1)
    return {
        "time_s": t,
        "cx": (x1 + x2) / 2.0,
        "cy": (y1 + y2) / 2.0,
        "w": w,
        "h": h,
        "body_length_px": max(w, h),
        "aspect_ratio": h / w,
        "species": det["species"],
        "confidence": det["confidence"],
        "xyxy": det["xyxy"],
    }


def _direction(dx, dy):
    if dx == 0 and dy == 0:
        return "Stationary"
    if abs(dx) >= abs(dy):
        return "Right" if dx >= 0 else "Left"
    return "Down" if dy >= 0 else "Up"


def _position(rel_y):
    if rel_y < 0.33:
        return "Top"
    if rel_y < 0.67:
        return "Middle"
    return "Bottom"


def compute_kinematics(records, frame_h, median_bl=None):
    """Legacy speed/stationary/direction/posture/position math, applied to one track."""
    if median_bl is None:
        median_bl = float(np.median([r["body_length_px"] for r in records]))
    median_bl = max(10.0, median_bl)

    speeds = []
    stationary_count = 0
    dx_total = 0.0
    dy_total = 0.0
    for prev, curr in zip(records, records[1:]):
        dt = curr["time_s"] - prev["time_s"]
        if dt <= 0:
            continue
        dx = curr["cx"] - prev["cx"]
        dy = curr["cy"] - prev["cy"]
        inst = float(np.hypot(dx, dy)) / (median_bl * dt)
        if inst < STATIONARY_BL_S:
            stationary_count += 1
            speeds.append(0.0)
        else:
            speeds.append(inst)
            dx_total += dx
            dy_total += dy

    if speeds:
        avg_speed = round(float(np.mean(speeds)), 3)
        max_speed = round(float(np.max(speeds)), 3)
        stationary_pct = round(stationary_count / len(speeds) * 100.0, 1)
    else:
        avg_speed, max_speed, stationary_pct = 0.0, 0.0, 100.0

    mean_ar = float(np.mean([r["aspect_ratio"] for r in records]))
    if mean_ar > 1.35 and abs(dy_total) > abs(dx_total) * 1.5:
        posture = "Head-Up (Surface Piping)" if dy_total < 0 else "Head-Down (Head-Standing)"
    else:
        posture = "Horizontal (Normal)"

    mean_cy = float(np.mean([r["cy"] for r in records]))
    return {
        "avg_speed_bl_s": avg_speed,
        "max_speed_bl_s": max_speed,
        "stationary_percent": stationary_pct,
        "direction": _direction(dx_total, dy_total),
        "position": _position(mean_cy / max(1.0, frame_h)),
        "posture": posture,
    }


def rolling_speed_dir(records, idx, median_bl, window_s=ROLLING_WINDOW_S):
    """Speed (BL/s) and direction over the last `window_s` ending at records[idx]."""
    end = records[idx]
    start_i = idx
    while start_i > 0 and end["time_s"] - records[start_i - 1]["time_s"] <= window_s + 1e-9:
        start_i -= 1
    if start_i == idx:
        return 0.0, "Stationary"
    start = records[start_i]
    span = end["time_s"] - start["time_s"]
    path = sum(
        float(np.hypot(b["cx"] - a["cx"], b["cy"] - a["cy"]))
        for a, b in zip(records[start_i:idx], records[start_i + 1:idx + 1])
    )
    speed = path / (max(10.0, median_bl) * span) if span > 0 else 0.0
    if speed < STATIONARY_BL_S:
        return 0.0, "Stationary"
    return round(speed, 3), _direction(end["cx"] - start["cx"], end["cy"] - start["cy"])


def summarize_track(tid, records, frame_h, behavior_engine, min_seconds=MIN_TRACK_SECONDS):
    """Per-track summary dict (contract `tracks[]` entry) plus internal median_bl."""
    votes = Counter(r["species"] for r in records)
    species = votes.most_common(1)[0][0]
    sp_confs = [r["confidence"] for r in records if r["species"] == species]
    median_bl = max(10.0, float(np.median([r["body_length_px"] for r in records])))
    kin = compute_kinematics(records, frame_h, median_bl)
    first_t = records[0]["time_s"]
    last_t = records[-1]["time_s"]

    track = {
        "track_id": tid,
        "species": species,
        "species_confidence": round(float(np.mean(sp_confs)), 4),
        "first_t": round(first_t, 3),
        "last_t": round(last_t, 3),
        "frames": len(records),
        **kin,
    }
    if last_t - first_t < min_seconds:
        track["behavior_status"] = "INSUFFICIENT_DATA"
        track["reason"] = ["Track too short"]
    else:
        ev = behavior_engine.evaluate(
            species=species,
            avg_speed_bl_s=kin["avg_speed_bl_s"],
            stationary_percent=kin["stationary_percent"],
            dominant_position=kin["position"],
            dominant_direction=kin["direction"],
            posture=kin["posture"],
        )
        track["behavior_status"] = ev.get("behavior_status", "UNKNOWN_SPECIES")
        track["reason"] = list(ev.get("reason", []))
    return track, median_bl


def is_plausible_fish(records, frame_w):
    """Reject static false positives: low mean confidence, strip-shaped or frame-wide boxes."""
    mean_conf = float(np.mean([r["confidence"] for r in records]))
    if mean_conf < MIN_TRACK_MEAN_CONF:
        return False
    ar = float(np.median([r["aspect_ratio"] for r in records]))  # h / w
    if ar > MAX_FISH_ASPECT or ar < 1.0 / MAX_FISH_ASPECT:
        return False
    widths = [r["xyxy"][2] - r["xyxy"][0] for r in records if "xyxy" in r]
    if widths and frame_w and float(np.median(widths)) > MAX_BOX_WIDTH_FRAC * frame_w:
        return False
    return True


def _reset_tracker(model):
    """Drop ByteTrack state so IDs/history never leak between calls."""
    predictor = getattr(model, "predictor", None)
    if predictor is not None and hasattr(predictor, "trackers"):
        try:
            del predictor.trackers
        except AttributeError:
            pass


_STATUS_TEXT = {"PROTOTYPE_NORMAL": "NORMAL", "PROTOTYPE_ABNORMAL": "ABNORMAL"}
_ARROWS = {"Up": "^", "Down": "v", "Left": "<", "Right": ">", "Stationary": "-"}


def _draw(frame, boxes, status_by_id):
    """Burn boxes + readable labels: size scales with frame, filled label background."""
    colors = {"PROTOTYPE_NORMAL": (60, 190, 60), "PROTOTYPE_ABNORMAL": (50, 50, 230)}
    fh, fw = frame.shape[:2]
    scale = max(0.5, min(fh, fw) / 720.0 * 0.75)
    thick = max(2, int(round(scale * 2)))
    font = cv2.FONT_HERSHEY_SIMPLEX
    for b in boxes:
        x1, y1, x2, y2 = [int(v) for v in b["xyxy"]]
        status = status_by_id.get(b["id"])
        color = colors.get(status, (150, 150, 150))
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thick)
        lines = [
            f"#{b['id']} {b['species']}",
            f"{b['speed']:.2f} BL/s {_ARROWS.get(b.get('dir'), '')}  {_STATUS_TEXT.get(status, 'ANALYSING')}",
        ]
        sizes = [cv2.getTextSize(l, font, scale, thick)[0] for l in lines]
        line_h = max(s[1] for s in sizes) + int(8 * scale)
        box_w = max(s[0] for s in sizes) + int(12 * scale)
        box_h = line_h * len(lines) + int(4 * scale)
        ly = y1 - box_h if y1 - box_h >= 0 else min(fh - box_h, y2)  # flip below box at top edge
        lx = max(0, min(x1, fw - box_w))
        cv2.rectangle(frame, (lx, ly), (lx + box_w, ly + box_h), color, -1)
        for i, l in enumerate(lines):
            org = (lx + int(6 * scale), ly + line_h * (i + 1) - int(4 * scale))
            cv2.putText(frame, l, org, font, scale, (255, 255, 255), thick, cv2.LINE_AA)


def analyze_multi(
    video_path,
    sample_every=2,
    max_seconds=60,
    annotate=False,
    *,
    model,
    behavior_engine,
    device="cpu",
    annotate_dir=None,
    imgsz=TRACK_IMGSZ,
):
    """
    Track every fish in `video_path`. Returns
    {video, summary, tracks, timeline, annotated_video_url, total_frames}.
    Raises ValueError when the file has no readable frames.
    """
    sample_every = max(1, int(sample_every))
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or np.isnan(fps):
        fps = 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    max_frames = int(round(max_seconds * fps)) if max_seconds else None

    records = defaultdict(list)       # track_id -> [record]
    frame_dets = []                   # [(t, [det(px)], frame_idx)]
    f_idx = 0
    truncated = False
    names = getattr(model, "names", {}) or {}

    with _track_lock:
        _reset_tracker(model)
        first = True
        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break
                if max_frames is not None and f_idx >= max_frames:
                    truncated = True
                    break
                if f_idx % sample_every == 0:
                    t = f_idx / fps
                    res = model.track(
                        source=frame,
                        persist=not first,
                        tracker=TRACKER_CFG,
                        conf=TRACK_CONF,
                        imgsz=imgsz,
                        device=device,
                        agnostic_nms=True,  # one box per fish even when two classes fire on it
                        verbose=False,
                    )
                    first = False
                    dets = extract_tracked_boxes(res[0], names) if res else []
                    for d in dets:
                        records[d["id"]].append(make_record(d, t))
                    frame_dets.append((t, dets, f_idx))
                f_idx += 1
        finally:
            cap.release()
            _reset_tracker(model)

    if f_idx == 0:
        raise ValueError("No readable video frames found. Try an MP4 or MOV clip.")

    filtered_ids = {tid for tid, recs in records.items() if not is_plausible_fish(recs, width)}
    for tid in filtered_ids:
        del records[tid]
    frame_dets = [(t, [d for d in dets if d["id"] not in filtered_ids], fi) for t, dets, fi in frame_dets]

    tracks = []
    medians = {}
    for tid in sorted(records):
        tr, mbl = summarize_track(tid, records[tid], height, behavior_engine)
        tracks.append(tr)
        medians[tid] = mbl
    status_by_id = {tr["track_id"]: tr["behavior_status"] for tr in tracks}
    species_by_id = {tr["track_id"]: tr["species"] for tr in tracks}

    # Index of each (track, time) inside its record list, for rolling kinematics.
    rec_idx = {tid: {round(r["time_s"], 6): i for i, r in enumerate(recs)} for tid, recs in records.items()}

    timeline = []
    draw_boxes = {}
    for t, dets, fi in frame_dets:
        boxes = []
        for d in dets:
            i = rec_idx[d["id"]][round(t, 6)]
            speed, direction = rolling_speed_dir(records[d["id"]], i, medians[d["id"]])
            x1, y1, x2, y2 = d["xyxy"]
            boxes.append({
                "id": d["id"],
                "xyxy": [
                    round(min(1.0, max(0.0, x1 / width)), 4),
                    round(min(1.0, max(0.0, y1 / height)), 4),
                    round(min(1.0, max(0.0, x2 / width)), 4),
                    round(min(1.0, max(0.0, y2 / height)), 4),
                ],
                "species": species_by_id[d["id"]],
                "speed": speed,
                "dir": direction,
                "status": status_by_id[d["id"]],
            })
            if annotate:
                draw_boxes.setdefault(fi, []).append({**d, "species": species_by_id[d["id"]], "speed": speed, "dir": direction})
        timeline.append({"t": round(t, 3), "boxes": boxes})

    annotated_url = None
    if annotate and annotate_dir:
        annotated_url = _write_annotated(video_path, annotate_dir, fps, width, height, f_idx, sample_every, draw_boxes, status_by_id)

    duration = f_idx / fps
    summary = {
        "tracked": len(tracks),
        "normal": sum(1 for tr in tracks if tr["behavior_status"] == "PROTOTYPE_NORMAL"),
        "abnormal": sum(1 for tr in tracks if tr["behavior_status"] == "PROTOTYPE_ABNORMAL"),
        "insufficient": sum(1 for tr in tracks if tr["behavior_status"] == "INSUFFICIENT_DATA"),
        "filtered": len(filtered_ids),  # dropped as non-fish (low confidence / implausible shape)
    }
    return {
        "video": {
            "width": width,
            "height": height,
            "fps": round(float(fps), 3),
            "analyzed_fps": round(float(fps) / sample_every, 3),
            "duration_s": round(duration, 3),
            "truncated": truncated,
        },
        "summary": summary,
        "tracks": tracks,
        "timeline": timeline,
        "annotated_video_url": annotated_url,
        "total_frames": f_idx,
    }


def _write_annotated(video_path, out_dir, fps, width, height, n_frames, sample_every, draw_boxes, status_by_id):
    """Burn boxes into an MP4 copy (frames between samples reuse the last sample's boxes)."""
    os.makedirs(out_dir, exist_ok=True)
    name = f"{uuid.uuid4().hex}.mp4"
    out_path = os.path.join(out_dir, name)
    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        return None
    cap = cv2.VideoCapture(str(video_path))
    last = []
    try:
        for fi in range(n_frames):
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            if fi % sample_every == 0:
                last = draw_boxes.get(fi, [])
            if frame.shape[1] != width or frame.shape[0] != height:
                frame = cv2.resize(frame, (width, height))
            _draw(frame, last, status_by_id)
            writer.write(frame)
    finally:
        cap.release()
        writer.release()
    return f"/static/annotated/{name}"
