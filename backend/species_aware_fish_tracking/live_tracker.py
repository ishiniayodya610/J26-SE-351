"""
Per-connection live tracking session for WS /api/comp2/live (Phase 5 backend).

Each LiveTrackerSession owns its own YOLO model instance, so ByteTrack state
(persist=True) never leaks between clients. Keeps a rolling ~3 s per-track
history; a track reports status ANALYSING until it has >= 3 s of history, then
the behavior engine verdict (PROTOTYPE_NORMAL / PROTOTYPE_ABNORMAL / UNKNOWN_SPECIES).
"""

import time
from collections import Counter, deque

import numpy as np

from multi_track import (
    TRACKER_CFG,
    compute_kinematics,
    extract_tracked_boxes,
    make_record,
    rolling_speed_dir,
)

HISTORY_S = 3.0
STALE_TRACK_S = 5.0
LIVE_CONF = 0.25
LIVE_IMGSZ = 480


class LiveTrackerSession:
    def __init__(self, model, behavior_engine, device="cpu", imgsz=LIVE_IMGSZ):
        self.model = model
        self.behavior_engine = behavior_engine
        self.device = device
        self.imgsz = imgsz
        self._proc_times = deque(maxlen=10)
        self.reset()

    def reset(self):
        self._fresh = True
        self.history = {}        # track_id -> deque[record]
        self.votes = {}          # track_id -> Counter(species)
        self._proc_times.clear()

    def _analysis_fps(self):
        if len(self._proc_times) < 2:
            return 0.0
        span = self._proc_times[-1] - self._proc_times[0]
        return round((len(self._proc_times) - 1) / span, 2) if span > 0 else 0.0

    def process(self, frame, t_ms):
        """Run tracker on one BGR frame captured at client time t_ms; returns a `tracks` message."""
        h, w = frame.shape[:2]
        t = t_ms / 1000.0
        res = self.model.track(
            source=frame,
            persist=not self._fresh,
            tracker=TRACKER_CFG,
            conf=LIVE_CONF,
            imgsz=self.imgsz,
            device=self.device,
            agnostic_nms=True,  # one box per fish even when two classes fire on it
            verbose=False,
        )
        self._fresh = False
        self._proc_times.append(time.monotonic())
        dets = extract_tracked_boxes(res[0], getattr(self.model, "names", {}) or {}) if res else []

        boxes = []
        for d in dets:
            hist = self.history.setdefault(d["id"], deque())
            hist.append(make_record(d, t))
            while hist and t - hist[0]["time_s"] > HISTORY_S + 0.5:
                hist.popleft()
            self.votes.setdefault(d["id"], Counter())[d["species"]] += 1
            boxes.append(self._box(d, list(hist), w, h))

        # Forget tracks not seen for a while.
        for tid in [k for k, v in self.history.items() if v and t - v[-1]["time_s"] > STALE_TRACK_S]:
            self.history.pop(tid, None)
            self.votes.pop(tid, None)

        return {
            "type": "tracks",
            "t": t_ms,
            "analysis_fps": self._analysis_fps(),
            "frame_w": w,
            "frame_h": h,
            "boxes": boxes,
        }

    def _box(self, d, recs, w, h):
        tid = d["id"]
        species = self.votes[tid].most_common(1)[0][0]
        median_bl = max(10.0, float(np.median([r["body_length_px"] for r in recs])))
        speed, direction = rolling_speed_dir(recs, len(recs) - 1, median_bl)
        kin = compute_kinematics(recs, h, median_bl)
        span = recs[-1]["time_s"] - recs[0]["time_s"]
        if span < HISTORY_S:
            status, reason = "ANALYSING", [f"Collecting history ({span:.1f}/{HISTORY_S:.0f} s)"]
        else:
            ev = self.behavior_engine.evaluate(
                species=species,
                avg_speed_bl_s=kin["avg_speed_bl_s"],
                stationary_percent=kin["stationary_percent"],
                dominant_position=kin["position"],
                dominant_direction=kin["direction"],
                posture=kin["posture"],
            )
            status, reason = ev.get("behavior_status", "UNKNOWN_SPECIES"), list(ev.get("reason", []))
        x1, y1, x2, y2 = d["xyxy"]
        return {
            "id": tid,
            "xyxy": [
                round(min(1.0, max(0.0, x1 / w)), 4),
                round(min(1.0, max(0.0, y1 / h)), 4),
                round(min(1.0, max(0.0, x2 / w)), 4),
                round(min(1.0, max(0.0, y2 / h)), 4),
            ],
            "species": species,
            "confidence": round(d["confidence"], 4),
            "speed": speed,
            "position": kin["position"],
            "dir": direction,
            "status": status,
            "reason": reason,
        }
