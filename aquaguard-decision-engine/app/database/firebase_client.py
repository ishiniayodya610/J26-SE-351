"""
Firebase Realtime Database Client for AquaGuard Decision Engine.
Phase 15: Multi-Tenant Firebase & Trigger Sync with ESP32 Target Generation.
"""

import os
import json
from typing import Optional, Any, Dict
import firebase_admin
from firebase_admin import credentials, db
from app.csp.overlap import calculate_environmental_targets

# Initialize Firebase App
if not firebase_admin._apps:
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    cred_path = os.environ.get(
        "FIREBASE_CREDENTIALS_PATH",
        os.path.join(base_dir, "serviceAccountKey.json"),
    )
    db_url = os.environ.get(
        "FIREBASE_DATABASE_URL",
        "https://your-project-id-default-rtdb.firebaseio.com/",
    )

    if os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
            print("Firebase initialized successfully.")
        except Exception as e:
            print(f"Error initializing Firebase: {e}")
    else:
        print("Firebase Warning: serviceAccountKey.json not found. Running in offline mode.")


def load_species_db() -> Dict[str, Any]:
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    target_path = os.path.join(base_dir, "data", "species_seed.json")
    if not os.path.exists(target_path):
        target_path = os.path.join(base_dir, "app", "data", "species_seed.json")
    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        species_list = data["species"] if isinstance(data, dict) and "species" in data else data
        return {s["species_id"]: s for s in species_list}


def start_tank_listener():
    """Starts a background listener to automatically update ESP32 targets on fish changes."""
    if not firebase_admin._apps:
        return

    species_db = load_species_db()

    def on_snapshot(event):
        path = event.path

        # Only trigger recalculations if the current_fish array changes
        if "current_fish" in path:
            parts = path.strip("/").split("/")
            if len(parts) >= 3:
                user_id = parts[0]
                tank_id = parts[2]

                # Fetch the complete, updated fish list
                tank_ref = db.reference(f"users/{user_id}/tanks/{tank_id}")
                tank_data = tank_ref.get()
                if not tank_data:
                    return

                current_fish = tank_data.get("current_fish", [])

                # Run Phase 14 Overlap Algorithm
                success, targets, error = calculate_environmental_targets(current_fish, species_db)

                target_ref = db.reference(f"users/{user_id}/tanks/{tank_id}/esp32_targets")
                if success:
                    target_ref.set(targets)
                    print(f"ESP32 Targets updated for {user_id}/{tank_id}: {targets}")
                else:
                    target_ref.set({"error": error["explanation"], "status": "CONFLICT"})
                    print(f"Conflict detected for {user_id}/{tank_id}: {error['explanation']}")

    try:
        # Listen to the entire users node for real-time changes
        db.reference("users").listen(on_snapshot)
        print("Firebase Listener active: Watching for tank configuration changes...")
    except Exception as e:
        print(f"Failed to start Firebase listener: {e}")


# Helper functions for the REST API supporting both single-tenant and multi-tenant paths
def get_live_telemetry(user_or_aquarium_id: str, tank_id: Optional[str] = None):
    if not firebase_admin._apps:
        return None
    if tank_id is not None:
        return db.reference(f"users/{user_or_aquarium_id}/tanks/{tank_id}/telemetry").get()
    return db.reference(f"aquariums/{user_or_aquarium_id}/telemetry").get()


def save_decision_result(user_or_aquarium_id: str, tank_id_or_data: Any, decision_data: Optional[Dict[str, Any]] = None):
    if not firebase_admin._apps:
        return
    if decision_data is not None:
        user_id = user_or_aquarium_id
        tank_id = tank_id_or_data
        data = decision_data
        db.reference(f"users/{user_id}/tanks/{tank_id}/decisions").set(data)
    else:
        aquarium_id = user_or_aquarium_id
        data = tank_id_or_data
        db.reference(f"aquariums/{aquarium_id}/decisions").set(data)


def save_simulation_result(user_or_aquarium_id: str, tank_id_or_data: Any, simulation_data: Optional[Dict[str, Any]] = None):
    if not firebase_admin._apps:
        return
    if simulation_data is not None:
        user_id = user_or_aquarium_id
        tank_id = tank_id_or_data
        data = simulation_data
        db.reference(f"users/{user_id}/tanks/{tank_id}/simulations").set(data)
    else:
        aquarium_id = user_or_aquarium_id
        data = tank_id_or_data
        db.reference(f"aquariums/{aquarium_id}/simulations").set(data)
