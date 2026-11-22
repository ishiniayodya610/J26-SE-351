"""Tests for multi-fish tracking (analyze_multi, /analyze-video v2, WS /api/comp2/live).

YOLO won't detect cv2-drawn blobs, so model.track() is mocked with a fake that
returns scripted ByteTrack-style boxes per call.
"""
import base64
import os
import sys

import cv2
import numpy as np
import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TRACKING_DIR = os.path.join(ROOT, "species_aware_fish_tracking")
if TRACKING_DIR not in sys.path:
    sys.path.insert(0, TRACKING_DIR)

from aquaguard_behavior_engine import AquaGuardBehaviorEngine  # noqa: E402
from multi_track import analyze_multi  # noqa: E402
from live_tracker import LiveTrackerSession  # noqa: E402

W, H, FPS = 320, 240, 10

LEGACY_KEYS = {
    "species_id", "common_name", "scientific_name", "confidence", "video_filename", "video_size_kb",
    "frames_processed", "average_speed_bl_s", "maximum_speed_bl_s", "stationary_percent",
    "swimming_activity_pct", "lethargy_index_pct", "position", "direction", "posture",
    "surface_piping", "feeding_response", "health_status", "behavior_status", "reasons",
    "target_parameters", "care_notes",
}
TRACK_KEYS = {
    "track_id", "species", "species_confidence", "first_t", "last_t", "frames", "avg_speed_bl_s",
    "max_speed_bl_s", "stationary_percent", "position", "direction", "behavior_status", "reason",
}
STATUSES = {"PROTOTYPE_NORMAL", "PROTOTYPE_ABNORMAL", "INSUFFICIENT_DATA", "UNKNOWN_SPECIES"}
DIRS = {"Left", "Right", "Up", "Down", "Stationary"}


class _Boxes:
    def __init__(self, rows):
        arr = np.array(rows, dtype=float).reshape(-1, 7)  # x1,y1,x2,y2,id,cls,conf
        self.xyxy, self.id, self.cls, self.conf = arr[:, :4], arr[:, 4], arr[:, 5], arr[:, 6]
        if len(arr) == 0:
            self.id = None

    def __len__(self):
        return len(self.xyxy)


class _Result:
    def __init__(self, rows):
        self.boxes = _Boxes(rows)


class FakeTrackModel:
    """Scripted stand-in for ultralytics YOLO.track(). script(call_idx) -> rows."""
    names = {0: "Betta", 1: "Guppy", 2: "Swordtail"}

    def __init__(self, script):
        self.script = script
        self.calls = 0
        self.persist_flags = []

    def track(self, source, persist=False, **kwargs):
        self.persist_flags.append(persist)
        rows = self.script(self.calls)
        self.calls += 1
        return [_Result(rows)]


def two_fish_script(i):
    # Track 1: Guppy swimming right at mid-height for the whole clip.
    # Track 2: Swordtail present only for 3 sampled calls (< 1 s) -> INSUFFICIENT_DATA.
    rows = [[20 + 6 * i, 100, 60 + 6 * i, 120, 1, 1, 0.9]]
    if i < 3:
        rows.append([200, 180, 240, 200, 2, 2, 0.8])
    return rows


def make_clip(path, n_frames=30):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    assert writer.isOpened()
    for i in range(n_frames):
        frame = np.full((H, W, 3), 40, np.uint8)
        cv2.circle(frame, (40 + 3 * i, 110), 12, (0, 200, 255), -1)
        writer.write(frame)
    writer.release()
    return path


@pytest.fixture
def engine():
    return AquaGuardBehaviorEngine(os.path.join(TRACKING_DIR, "species_behavior_profiles.json"))


@pytest.fixture
def clip(tmp_path):
    return make_clip(tmp_path / "fish.mp4")


def test_analyze_multi_schema_and_tracks(clip, engine):
    model = FakeTrackModel(two_fish_script)
    out = analyze_multi(clip, sample_every=1, model=model, behavior_engine=engine)

    assert set(out) >= {"video", "summary", "tracks", "timeline", "annotated_video_url"}
    assert out["annotated_video_url"] is None
    assert out["video"]["truncated"] is False
    assert out["video"]["width"] == W and out["video"]["height"] == H
    assert model.persist_flags[0] is False and all(model.persist_flags[1:])  # tracker reset per call

    tracks = {t["track_id"]: t for t in out["tracks"]}
    assert set(tracks) == {1, 2}
    for t in tracks.values():
        assert TRACK_KEYS <= set(t)
        assert t["behavior_status"] in STATUSES
        assert t["position"] in {"Top", "Middle", "Bottom"}
        assert t["direction"] in DIRS
    assert tracks[1]["species"] == "Guppy"
    assert tracks[1]["direction"] == "Right"
    assert tracks[1]["behavior_status"] != "INSUFFICIENT_DATA"
    assert tracks[2]["behavior_status"] == "INSUFFICIENT_DATA"
    assert tracks[2]["reason"] == ["Track too short"]
    assert out["summary"]["tracked"] == 2 and out["summary"]["insufficient"] == 1

    assert len(out["timeline"]) == 30
    for entry in out["timeline"]:
        for b in entry["boxes"]:
            assert set(b) == {"id", "xyxy", "species", "speed", "dir", "status"}
            assert len(b["xyxy"]) == 4 and all(0.0 <= v <= 1.0 for v in b["xyxy"])
            assert b["dir"] in DIRS
    late = [b for b in out["timeline"][-1]["boxes"] if b["id"] == 1][0]
    assert late["speed"] > 0 and late["dir"] == "Right"


def test_analyze_multi_truncates_and_samples(clip, engine):
    model = FakeTrackModel(two_fish_script)
    out = analyze_multi(clip, sample_every=3, max_seconds=2, model=model, behavior_engine=engine)
    assert out["video"]["truncated"] is True
    assert model.calls == 7  # frames 0..19, every 3rd
    assert out["video"]["analyzed_fps"] == pytest.approx(FPS / 3, rel=1e-3)


def test_analyze_multi_annotated_video(clip, engine, tmp_path):
    out = analyze_multi(clip, sample_every=2, annotate=True, model=FakeTrackModel(two_fish_script),
                        behavior_engine=engine, annotate_dir=str(tmp_path / "ann"))
    url = out["annotated_video_url"]
    assert url and url.startswith("/static/annotated/")
    assert os.path.getsize(tmp_path / "ann" / os.path.basename(url)) > 0


def test_analyze_multi_no_frames(tmp_path, engine):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(ValueError):
        analyze_multi(bad, model=FakeTrackModel(lambda i: []), behavior_engine=engine)


# ---------------- router-level tests ----------------

@pytest.fixture
def vision(monkeypatch, engine):
    from backend.app.routers import comp2_vision

    class _Analyzer:
        model = FakeTrackModel(two_fish_script)
        behavior_engine = engine
        device = "cpu"

    async def _noop(_sid):
        return None

    monkeypatch.setattr(comp2_vision, "_video_analyzer", _Analyzer())
    monkeypatch.setattr(comp2_vision, "set_active_profile", _noop)
    monkeypatch.setattr(comp2_vision, "UPLOAD_SAMPLE_EVERY", 1)
    return comp2_vision


def _client():
    from fastapi.testclient import TestClient
    from backend.app.main import app
    return TestClient(app)


def test_analyze_video_endpoint_keeps_legacy_fields(vision, clip):
    with open(clip, "rb") as f:
        resp = _client().post("/api/comp2/analyze-video", files={"file": ("fish.mp4", f, "video/mp4")})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert LEGACY_KEYS <= set(data)
    assert {"video", "summary", "tracks", "timeline", "annotated_video_url"} <= set(data)
    assert data["common_name"] == "Guppy"  # dominant = longest judged track
    assert data["behavior_status"] == [t for t in data["tracks"] if t["track_id"] == 1][0]["behavior_status"]


def test_live_ws_tracks_and_errors(vision, monkeypatch, engine):
    script = lambda i: [[20 + 10 * i, 50, 60 + 10 * i, 70, 7, 0, 0.9]]  # noqa: E731
    monkeypatch.setattr(vision, "_new_live_session",
                        lambda: LiveTrackerSession(FakeTrackModel(script), engine))
    ok, jpg = cv2.imencode(".jpg", np.full((240, 320, 3), 60, np.uint8))
    b64 = base64.b64encode(jpg.tobytes()).decode()

    with _client().websocket_connect("/api/comp2/live") as ws:
        ws.send_text("not json")
        assert ws.receive_json() == {"type": "error", "detail": "Invalid JSON message"}

        ws.send_json({"type": "frame", "t": 1000, "jpeg_b64": "@@@"})
        assert ws.receive_json()["type"] == "error"

        msgs = []
        for k in range(5):  # one frame per second -> history reaches 4 s
            ws.send_json({"type": "frame", "t": 2000 + 1000 * k, "jpeg_b64": b64})
            msgs.append(ws.receive_json())

        first, last = msgs[0], msgs[-1]
        assert first["type"] == "tracks" and first["frame_w"] == 320 and first["frame_h"] == 240
        assert set(first) >= {"t", "analysis_fps", "boxes"}
        box = first["boxes"][0]
        assert set(box) >= {"id", "xyxy", "species", "confidence", "speed", "position", "dir", "status", "reason"}
        assert box["status"] == "ANALYSING"
        assert all(0.0 <= v <= 1.0 for v in box["xyxy"])
        assert last["boxes"][0]["status"] in {"PROTOTYPE_NORMAL", "PROTOTYPE_ABNORMAL"}

        ws.send_json({"type": "reset"})
        ws.send_json({"type": "frame", "t": 9000, "jpeg_b64": b64})
        assert ws.receive_json()["boxes"][0]["status"] == "ANALYSING"
