
import os
from collections import Counter, defaultdict

import cv2
import numpy as np
import pandas as pd
from ultralytics import YOLO

from aquaguard_behavior_engine import AquaGuardBehaviorEngine


class AquaGuardVideoAnalyzer:

    def __init__(
        self,
        model_path=None,
        profile_path=None,
        device="cpu"
    ):

        base_dir = os.path.dirname(__file__)

        if model_path is None:
            model_path = os.path.join(
                base_dir,
                "aquaguard_yolo11n_best.pt"
            )

        if profile_path is None:
            profile_path = os.path.join(
                base_dir,
                "species_behavior_profiles.json"
            )

        self.model = YOLO(model_path)

        self.behavior_engine = (
            AquaGuardBehaviorEngine(
                profile_path=profile_path
            )
        )

        self.device = device


    def analyze_single_fish(
        self,
        video_path,
        tank_top,
        tank_bottom,
        target_id=None,
        species_override=None,
        vid_stride=2,
        min_track_observations=10
    ):

        cap = cv2.VideoCapture(video_path)

        fps = cap.get(cv2.CAP_PROP_FPS)

        cap.release()

        if fps <= 0:
            raise ValueError(
                "Could not read video FPS."
            )

        if tank_bottom <= tank_top:
            raise ValueError(
                "tank_bottom must be greater than tank_top."
            )


        # --------------------------------
        # Tracking
        # --------------------------------

        track_records = defaultdict(list)

        results = self.model.track(
            source=video_path,
            tracker="bytetrack.yaml",
            conf=0.10,
            imgsz=640,
            vid_stride=vid_stride,
            device=self.device,
            persist=True,
            stream=True,
            verbose=False
        )

        for processed_frame, result in enumerate(results):

            if (
                result.boxes is None
                or result.boxes.id is None
            ):
                continue

            ids = (
                result.boxes.id
                .int()
                .cpu()
                .tolist()
            )

            classes = (
                result.boxes.cls
                .int()
                .cpu()
                .tolist()
            )

            confidences = (
                result.boxes.conf
                .cpu()
                .tolist()
            )

            boxes = (
                result.boxes.xyxy
                .cpu()
                .tolist()
            )

            original_frame = (
                processed_frame * vid_stride
            )

            for fish_id, cls_id, confidence, box in zip(
                ids,
                classes,
                confidences,
                boxes
            ):

                x1, y1, x2, y2 = box

                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2

                w = max(1.0, float(x2 - x1))
                h = max(1.0, float(y2 - y1))
                body_length_px = max(w, h)
                aspect_ratio = h / w

                track_records[fish_id].append({
                    "frame": original_frame,
                    "cx": cx,
                    "cy": cy,
                    "w": w,
                    "h": h,
                    "aspect_ratio": aspect_ratio,
                    "body_length_px": body_length_px,
                    "class_name":
                        self.model.names[cls_id],
                    "confidence":
                        confidence
                })


        if not track_records:

            raise ValueError(
                "No tracked fish detected."
            )


        # --------------------------------
        # Fish ID selection
        # --------------------------------

        if target_id is None:

            valid_tracks = {
                fish_id: records
                for fish_id, records
                in track_records.items()
                if len(records)
                >= min_track_observations
            }

            if not valid_tracks:

                raise ValueError(
                    "No sufficiently long track found."
                )

            target_id = max(
                valid_tracks,
                key=lambda fish_id:
                    len(valid_tracks[fish_id])
            )

            track_selection = (
                "AUTO_LONGEST_TRACK"
            )

        else:

            if target_id not in track_records:

                raise ValueError(
                    f"Fish ID {target_id} not found."
                )

            track_selection = (
                "MANUAL_TRACK_ID"
            )


        df = pd.DataFrame(
            track_records[target_id]
        )


        # --------------------------------
        # Species
        # --------------------------------

        species_votes = Counter(
            df["class_name"]
        )

        detected_species = (
            species_votes
            .most_common(1)[0][0]
        )

        vote_count = (
            species_votes[detected_species]
        )

        species_consistency = (
            vote_count / len(df) * 100
        )

        average_confidence = float(
            df["confidence"].mean()
        )

        if species_override is None:

            species = detected_species
            species_assignment = (
                "YOLO_TOP_VOTE"
            )

        else:

            species = species_override
            species_assignment = (
                "MANUAL_OVERRIDE"
            )


        # --------------------------------
        # Body length
        # --------------------------------

        median_body_length = float(
            df["body_length_px"].median()
        )

        if median_body_length <= 0:

            raise ValueError(
                "Invalid body-length proxy."
            )


        # --------------------------------
        # Speed + Direction
        # --------------------------------

        speeds = []
        directions = []
        postures = []

        for i in range(len(df)):

            if i == 0:

                speeds.append(np.nan)
                directions.append("Unknown")
                postures.append("Horizontal (Normal)")
                continue


            dx = (
                df.iloc[i]["cx"]
                - df.iloc[i - 1]["cx"]
            )

            dy = (
                df.iloc[i]["cy"]
                - df.iloc[i - 1]["cy"]
            )

            frame_gap = (
                df.iloc[i]["frame"]
                - df.iloc[i - 1]["frame"]
            )


            if frame_gap <= 0:

                speeds.append(np.nan)
                directions.append("Unknown")
                postures.append("Horizontal (Normal)")
                continue


            dt = frame_gap / fps

            distance_px = np.sqrt(
                dx**2 + dy**2
            )

            speed_bl_s = (
                distance_px
                / median_body_length
                / dt
            )

            speeds.append(
                speed_bl_s
            )


            if speed_bl_s < 0.05:

                direction = "Stationary"

            elif abs(dx) >= abs(dy):

                direction = (
                    "Right"
                    if dx > 0
                    else "Left"
                )

            else:

                direction = (
                    "Down"
                    if dy > 0
                    else "Up"
                )

            directions.append(
                direction
            )

            # Posture Tilt Analysis (Height vs Width aspect ratio & vertical displacement)
            ar = df.iloc[i].get("aspect_ratio", 0.5)
            if ar >= 1.20:
                if dy < -0.3:
                    postures.append("Head-Up (Piping)")
                elif dy > 0.3:
                    postures.append("Head-Down (Sinking/Foraging)")
                else:
                    postures.append("Vertical Posture")
            else:
                postures.append("Horizontal (Normal)")


        df["speed_bl_s"] = speeds
        df["direction"] = directions
        df["posture"] = postures


        # --------------------------------
        # Position
        # --------------------------------

        tank_height = (
            tank_bottom - tank_top
        )

        top_middle = (
            tank_top
            + tank_height / 3
        )

        middle_bottom = (
            tank_top
            + tank_height * 2 / 3
        )


        def classify_position(y):

            if (
                y < tank_top
                or y > tank_bottom
            ):

                return "Outside"

            if y < top_middle:
                return "Top"

            if y < middle_bottom:
                return "Middle"

            return "Bottom"


        df["position"] = (
            df["cy"]
            .apply(classify_position)
        )


        # --------------------------------
        # Summary
        # --------------------------------

        valid_speed = (
            df["speed_bl_s"]
            .dropna()
        )

        average_speed = float(
            valid_speed.mean()
        )

        maximum_speed = float(
            valid_speed.max()
        )


        valid_direction = df[
            df["direction"] != "Unknown"
        ]

        stationary_percent = float(
            (
                valid_direction["direction"]
                == "Stationary"
            ).mean() * 100
        )

        dominant_direction = (
            valid_direction["direction"]
            .value_counts()
            .idxmax()
        )


        valid_position = df[
            df["position"] != "Outside"
        ]

        if len(valid_position) == 0:

            dominant_position = (
                "Outside"
            )

        else:

            dominant_position = (
                valid_position["position"]
                .value_counts()
                .idxmax()
            )


        # --------------------------------
        # Posture evaluation
        # --------------------------------
        posture_counts = df["posture"].value_counts()
        total_p = len(df)
        head_down_ratio = posture_counts.get("Head-Down (Sinking/Foraging)", 0) / total_p
        head_up_ratio = posture_counts.get("Head-Up (Piping)", 0) / total_p

        if head_down_ratio >= 0.20 or (dominant_position == "Bottom" and stationary_percent > 20.0 and (df["aspect_ratio"] > 1.15).mean() > 0.3):
            dominant_posture = "Head-Down (Head-Standing)"
        elif head_up_ratio >= 0.20 or (dominant_position == "Top" and (df["aspect_ratio"] > 1.15).mean() > 0.3):
            dominant_posture = "Head-Up (Surface Piping)"
        else:
            dominant_posture = "Horizontal (Normal)"


        # --------------------------------
        # Behavior evaluation
        # --------------------------------

        behavior = (
            self.behavior_engine.evaluate(
                species=species,
                avg_speed_bl_s=
                    average_speed,
                stationary_percent=
                    stationary_percent,
                dominant_position=
                    dominant_position,
                dominant_direction=
                    dominant_direction,
                posture=
                    dominant_posture
            )
        )


        # --------------------------------
        # Final result
        # --------------------------------

        report = {

            "source_video":
                os.path.basename(
                    video_path
                ),

            "fish_id":
                int(target_id),

            "track_selection":
                track_selection,

            "species":
                species,

            "detected_species":
                detected_species,

            "species_assignment":
                species_assignment,

            "species_vote_consistency_percent":
                round(
                    species_consistency,
                    2
                ),

            "average_detection_confidence":
                round(
                    average_confidence,
                    3
                ),

            "tracked_observations":
                len(df),

            "average_speed_bl_s":
                round(
                    average_speed,
                    3
                ),

            "maximum_speed_bl_s":
                round(
                    maximum_speed,
                    3
                ),

            "stationary_percent":
                round(
                    stationary_percent,
                    2
                ),

            "position":
                dominant_position,

            "direction":
                dominant_direction,

            "posture":
                dominant_posture,

            "behavior_status":
                behavior[
                    "behavior_status"
                ],

            "reason":
                behavior["reason"],

            "reference_status":
                behavior.get(
                    "reference_status"
                ),

            "warning":
                behavior.get(
                    "warning"
                )
        }

        return report, df
