
import os
import json


class AquaGuardBehaviorEngine:

    def __init__(self, profile_path=None):

        if profile_path is None:
            profile_path = os.path.join(
                os.path.dirname(__file__),
                "species_behavior_profiles.json"
            )

        with open(profile_path, "r") as f:
            self.behavior_profiles = json.load(f)


    def get_available_species(self):
        return list(self.behavior_profiles.keys())


    def evaluate(
        self,
        species,
        avg_speed_bl_s,
        stationary_percent,
        dominant_position,
        dominant_direction,
        posture="Horizontal (Normal)"
    ):

        if species not in self.behavior_profiles:

            return {
                "species": species,
                "behavior_status": "UNKNOWN_SPECIES",
                "reason": [
                    f"No behavior profile available for {species}."
                ]
            }


        profile = self.behavior_profiles[species]

        speed_min = (
            profile["speed"]["normal_min_bl_s"]
        )

        speed_max = (
            profile["speed"]["normal_max_bl_s"]
        )

        stationary_max = (
            profile["stationary"]
            ["maximum_reference_percent"]
        )

        represented_zones = (
            profile["position"]
            ["represented_zones"]
        )

        reasons = []


        # -----------------------------
        # Speed
        # -----------------------------

        if avg_speed_bl_s < speed_min:

            reasons.append(
                f"Average speed {avg_speed_bl_s:.3f} BL/s "
                f"is below the {species} prototype minimum "
                f"{speed_min:.3f} BL/s."
            )

        elif avg_speed_bl_s > speed_max:

            reasons.append(
                f"Average speed {avg_speed_bl_s:.3f} BL/s "
                f"is above the {species} prototype maximum "
                f"{speed_max:.3f} BL/s."
            )


        # -----------------------------
        # Stationary
        # -----------------------------

        if stationary_percent > stationary_max:

            reasons.append(
                f"Stationary percentage "
                f"{stationary_percent:.2f}% is above "
                f"the {species} prototype maximum "
                f"{stationary_max:.2f}%."
            )


        # -----------------------------
        # Position
        # -----------------------------

        if dominant_position not in represented_zones:

            reasons.append(
                f"Dominant position {dominant_position} "
                f"was not represented in the current "
                f"{species} prototype reference."
            )


        # -----------------------------
        # Posture Tilt (Head-Down / Head-Up)
        # -----------------------------

        if "Head-Down" in posture:
            reasons.append(
                f"Head-down vertical swimming posture detected ({posture}). "
                "Clinical alert: possible Swim Bladder Disorder (SBD), internal parasite pressure, or negative buoyancy shock."
            )
        elif "Head-Up" in posture:
            reasons.append(
                f"Head-up surface piping posture detected ({posture}). "
                "Clinical alert: possible acute hypoxia (low dissolved O2), gill flukes, or nitrite poisoning."
            )


        # -----------------------------
        # Final behavior status
        # -----------------------------

        if reasons:

            behavior_status = (
                "PROTOTYPE_ABNORMAL"
            )

        else:

            behavior_status = (
                "PROTOTYPE_NORMAL"
            )

            reasons.append(
                "Speed, stationary percentage and "
                "dominant position are within the "
                f"current {species} prototype reference."
            )


        return {

            "species":
                species,

            "average_speed_bl_s":
                round(avg_speed_bl_s, 3),

            "stationary_percent":
                round(stationary_percent, 2),

            "position":
                dominant_position,

            "direction":
                dominant_direction,

            "posture":
                posture,

            "behavior_status":
                behavior_status,

            "reason":
                reasons,

            "reference_status":
                profile.get("status"),

            "reference_speed_range_bl_s": [
                speed_min,
                speed_max
            ],

            "reference_stationary_max_percent":
                stationary_max,

            "warning":
                profile.get("warning")
        }
