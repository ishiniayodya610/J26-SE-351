# Multi-Fish Visual Tracking & Live Behavior Auditing — Plan

Goal: replace the "upload → one summary card" flow with per-track (ByteTrack) annotation,
per-track kinematics + species-aware behavior verdict, and a live camera overlay.

## Current state (verified)

- `backend/app/routers/comp2_vision.py` `POST /analyze-video` runs `model.predict()` per frame
  (no tracker), keeps the top detection, and treats the whole video as **one fish**.
- `species_aware_fish_tracking/aquaguard_video_analyzer.py` already has `analyze_single_fish()`
  using `model.track(tracker="bytetrack.yaml", persist=True)` — reusable.
- `aquaguard_behavior_engine.py` `evaluate(species, avg_speed_bl_s, stationary_percent,
  dominant_position, dominant_direction, posture)` — reusable per track, no change needed.
- `mobile/src/app/camera.tsx` (1640 lines) renders a single `VideoAnalysisData` result card.
  `expo-camera` + `reanimated` installed; no video player package (`expo-video`) yet.

## Design decisions

1. **Overlay rendered client-side, not burned into the MP4.** Backend returns per-frame boxes
   (`frames[t] -> [{track_id, bbox, ...}]`). App draws boxes on top of an `expo-video` player
   synced to `currentTime`. Same overlay component is reused in live mode.
   Optional: also write a burned-in `annotated_video.mp4` (OpenCV) for the report/evidence.
2. **Keep the old response fields** (`species_id`, `common_name`, `average_speed_bl_s`, …)
   filled from the dominant track, so existing UI / active-profile update don't break.
3. **"Track #N", never "Fish #N"** in UI and logs (ByteTrack IDs ≠ physical identity).
4. **Short tracks filtered** (< ~1 s of frames) → shown as "insufficient data", not judged.
5. **Live mode = sampled frames over WebSocket**, ~3–5 FPS analysis, preview stays 30 FPS,
   overlay boxes interpolated between updates. One tracker instance per WS session
   (`persist=True` state must not leak between clients).

## Response shape (`POST /analyze-video`, v2)

```json
{
  "success": true,
  "data": {
    "...legacy fields from dominant track...": "",
    "video": { "width": 1280, "height": 720, "fps": 30, "analyzed_fps": 10, "duration_s": 12.4 },
    "summary": { "tracked": 3, "normal": 2, "abnormal": 1, "insufficient": 0 },
    "tracks": [
      {
        "track_id": 18, "species": "Swordtail", "species_confidence": 0.89,
        "first_t": 0.4, "last_t": 11.9, "frames": 112,
        "avg_speed_bl_s": 0.91, "max_speed_bl_s": 1.4, "stationary_percent": 6.0,
        "position": "Bottom", "direction": "Up",
        "behavior_status": "PROTOTYPE_ABNORMAL",
        "reason": ["Speed above prototype range"]
      }
    ],
    "timeline": [
      { "t": 0.4, "boxes": [ { "id": 18, "xyxy": [0.31,0.62,0.44,0.71], "speed": 0.88, "dir": "Up" } ] }
    ],
    "annotated_video_url": "/static/annotated/<uuid>.mp4"
  }
}
```
Boxes normalised 0–1 so the app scales them to any player size.

## Phases

### Phase 1 — Backend: real multi-track pipeline
- New module `species_aware_fish_tracking/multi_track.py`:
  `analyze_multi(video_path, sample_every=N) -> {tracks, timeline, video}`.
  `model.track(..., tracker="bytetrack.yaml", persist=True)` frame loop; accumulate per `track_id`:
  centroid, bbox, body length px, class votes, confidence.
- Move existing speed/position/direction/stationary math from `comp2_vision.py` into a
  per-track function (same thresholds, e.g. 0.12 BL/s stationary cutoff).
- Species per track = majority vote of class over that track.
- `comp2_vision.py`: call `analyze_multi`, build legacy fields from longest track, add new fields.
- Tests: synthetic short clip / fixture video → ≥1 track, schema keys present; legacy keys unchanged.
- **Done when:** a 2-fish clip returns 2 tracks with distinct IDs and boxes in timeline.

### Phase 2 — Per-track kinematics in timeline
- Rolling speed (last ~1 s) + direction per timeline entry, so overlay values change while playing.

### Phase 3 — Per-track behavior verdict
- `behavior_engine.evaluate()` per track → `behavior_status` + `reason`.
- Terminal ANSI log prints one row per track.

### Phase 4 — Mobile: annotated player + track list
- Add `expo-video`. New components (split out of camera.tsx, don't grow it):
  - `components/vision/TrackOverlay.tsx` — absolutely positioned boxes (green NORMAL / red
    ABNORMAL / grey insufficient), label `#18 Swordtail · 0.91 BL/s ↑`.
  - `components/vision/AnnotatedVideoPlayer.tsx` — player + overlay; picks nearest timeline
    entry for `currentTime` (binary search), letterbox-aware scaling.
  - `components/vision/TrackSummary.tsx` — "Tracked: 3 · Normal: 2 · Abnormal: 1" + per-track cards w/ reasons.
- Update `services/api.ts` types (`VideoAnalysisData` += `tracks`, `timeline`, `summary`, `video`).
- `camera.tsx` result view: replace single card with Vision Monitor screen; keep old card as
  fallback when `tracks` absent.
- **Done when:** uploaded clip plays with boxes following fish, tap track → its card.

### Phase 5 — Live camera mode
- Backend: `WS /comp2/live` — client sends JPEG frames (~480 px wide, q≈0.6) + timestamp;
  server runs `track()` with per-connection model/tracker state, keeps rolling per-track
  history (~3 s window), returns `{t, boxes:[{id, xyxy, species, speed, pos, dir, status}]}`.
  Drop frames if busy (only process latest) → no backlog latency.
- Mobile: `CameraView` preview + `takePictureAsync({quality:0.4, skipProcessing:true})` loop
  at target FPS (or web: canvas grab, already exists at camera.tsx:297), send over WS,
  render `TrackOverlay` with reanimated tweening between updates. "LIVE" badge + analysis FPS.
- Status in live mode needs a minimum window (e.g. 3 s) before NORMAL/ABNORMAL shows; before
  that show "ANALYSING".
- **Done when:** 2 fish in front of phone show stable track boxes updating ≥3 FPS on the Windows CPU box.

## Risks
- CPU speed: YOLO11n CPU ≈ 8–20 FPS at 640; use `imgsz=480/416`, `sample_every=2–3` for uploads.
- ID switches on overlap → mitigated by "Track" wording and min-length filter; mention in report.
- `takePictureAsync` loop on iOS can be slow (~150–300 ms) → acceptable for 3–5 FPS; if not,
  move to `react-native-vision-camera` frame processor (needs dev build, larger change).
- Response size: timeline for 60 s @10 FPS × 5 fish ≈ manageable (<300 KB); cap video length.

## Resolved defaults (2026-10-22)
1. Client overlay is primary. Burned-in MP4 only when `POST /analyze-video?annotate=true`
   → `annotated_video_url` (served from `/static/annotated/`); otherwise `null`.
2. Live transport: WebSocket.
3. Max upload: 60 s analysed (longer clips truncated, `video.truncated: true`).

## Locked contract (backend + mobile build against this)

Upload: `POST /analyze-video` multipart `file`, optional query `annotate=true|false`.
Response = `{success, message, data}` where `data` = legacy fields **plus** `video`, `summary`,
`tracks`, `timeline`, `annotated_video_url` exactly as in "Response shape" above, with:
- `behavior_status` ∈ `PROTOTYPE_NORMAL | PROTOTYPE_ABNORMAL | INSUFFICIENT_DATA | UNKNOWN_SPECIES`
- `position` ∈ `Top | Middle | Bottom`; `direction` ∈ `Left | Right | Up | Down | Stationary`
- `timeline[].boxes[]` = `{id, xyxy:[x1,y1,x2,y2] (0–1), species, speed, dir, status}`
- `video.truncated: bool`. Track with < 1 s of frames → `INSUFFICIENT_DATA`, `reason: ["Track too short"]`.

Fixture: `mobile/src/features/vision/__fixtures__/analyze-video-v2.json` (2 tracks, 1 normal 1 abnormal).

Live: `WS /api/comp2/live` (same `/api/comp2` router prefix as `/api/comp2/analyze-video`; clarified 2026-10-22 by mobile-vision)
- client → server text JSON: `{"type":"frame","t":<ms>,"jpeg_b64":"..."}`; `{"type":"reset"}`
- server → client: `{"type":"tracks","t":<ms>,"analysis_fps":4.2,"frame_w":480,"frame_h":360,
  "boxes":[{id, xyxy (0–1), species, confidence, speed, position, dir, status, reason:[...]}]}`
- `status` is `ANALYSING` until the track has ≥ 3 s history, then the engine verdict:
  `PROTOTYPE_NORMAL | PROTOTYPE_ABNORMAL | UNKNOWN_SPECIES` (same enum as upload).
- server: `{"type":"error","detail":"..."}`. Busy server drops older frames (latest-wins).
