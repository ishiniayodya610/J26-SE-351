"""
Firebase Realtime Database Client for AquaGuard Decision Engine.
Phase 10: Firebase Integration for mobile app data synchronization.
"""

import os
import firebase_admin
from firebase_admin import credentials, db

# Prevent double initialization if hot-reloading
if not firebase_admin._apps:
    # IMPORTANT: Ensure serviceAccountKey.json is downloaded from Firebase Console
    # and placed in the root directory. NEVER commit this file to version control.
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
        print("Firebase Warning: serviceAccountKey.json not found. Running in offline/mock mode.")


def get_live_telemetry(aquarium_id: str):
    """Fetches the latest ESP32 telemetry from Firebase."""
    if not firebase_admin._apps:
        return None
    ref = db.reference(f"aquariums/{aquarium_id}/telemetry")
    return ref.get()


def save_decision_result(aquarium_id: str, decision_data: dict):
    """Pushes the CSP/Fuzzy/Optimizer results back to Firebase for the mobile app."""
    if not firebase_admin._apps:
        return
    ref = db.reference(f"aquariums/{aquarium_id}/decisions")
    ref.set(decision_data)


def save_simulation_result(aquarium_id: str, sim_data: dict):
    """Saves What-If simulation results."""
    if not firebase_admin._apps:
        return
    ref = db.reference(f"aquariums/{aquarium_id}/simulations")
    ref.set(sim_data)
