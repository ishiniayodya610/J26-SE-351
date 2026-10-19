"""
Unit and integration tests for AquaGuard Prediction Endpoints.
Covers:
- POST /predict/ammonia
- POST /predict/whitespot
- Field flexibility and alias handling (temp, do, pH)
- Validation errors (422) for missing or invalid inputs
- Service unavailable error handling (503) for missing model files
- Inclusion in root endpoint and Swagger documentation
"""

import sys
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure workspace root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.main import app
import backend.app.routers.predictions as predictions_module


class TestPredictions(unittest.TestCase):
    def setUp(self):
        predictions_module.load_prediction_models()
        self.client = TestClient(app)

    def test_root_endpoint_lists_predictions(self):
        """Verify that GET / reports predictions component and endpoints."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("predict_ammonia", data["endpoints"])
        self.assertIn("predict_whitespot", data["endpoints"])
        self.assertEqual(data["endpoints"]["predict_ammonia"], "/predict/ammonia")
        self.assertEqual(data["endpoints"]["predict_whitespot"], "/predict/whitespot")

    def test_predict_ammonia_success_standard_body(self):
        """Verify POST /predict/ammonia with the standard example body."""
        payload = {
            "temperature": 27.5,
            "dissolved_oxygen": 6.2,
            "ph": 7.8,
            "turbidity": 3.5,
            "ammonia": 0.4,
            "nitrate": 15.0
        }
        response = self.client.post("/predict/ammonia", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("risk_probability", data)
        self.assertIsInstance(data["risk_probability"], float)
        self.assertGreaterEqual(data["risk_probability"], 0.0)
        self.assertLessEqual(data["risk_probability"], 1.0)
        self.assertIn(data["prediction"], ["high_risk", "low_risk"])
        self.assertEqual(data["model"], "random_forest")

    def test_predict_whitespot_success_standard_body(self):
        """Verify POST /predict/whitespot with the standard example body."""
        payload = {
            "temperature": 27.5,
            "dissolved_oxygen": 6.2,
            "ph": 7.8,
            "turbidity": 3.5,
            "ammonia": 0.4,
            "nitrate": 15.0
        }
        response = self.client.post("/predict/whitespot", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("risk_probability", data)
        self.assertIsInstance(data["risk_probability"], float)
        self.assertGreaterEqual(data["risk_probability"], 0.0)
        self.assertLessEqual(data["risk_probability"], 1.0)
        self.assertIn(data["prediction"], ["high_risk", "low_risk"])
        self.assertEqual(data["model"], "random_forest")

    def test_predict_ammonia_with_aliases(self):
        """Verify POST /predict/ammonia accepts 'temp', 'do', and 'pH' aliases."""
        payload = {
            "temp": 28.1,
            "turbidity": 4.2,
            "do": 5.9,
            "pH": 7.4,
            "nitrate": 18.5
        }
        response = self.client.post("/predict/ammonia", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("risk_probability", data)
        self.assertEqual(data["model"], "random_forest")

    def test_predict_whitespot_with_aliases(self):
        """Verify POST /predict/whitespot accepts 'temp', 'do', and 'pH' aliases."""
        payload = {
            "temp": 26.8,
            "do": 6.5,
            "pH": 8.0,
            "turbidity": 2.8
        }
        response = self.client.post("/predict/whitespot", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("risk_probability", data)
        self.assertEqual(data["model"], "random_forest")

    def test_predict_ammonia_missing_required_field(self):
        """Verify missing required field (e.g. nitrate) returns 422."""
        payload = {
            "temperature": 27.5,
            "dissolved_oxygen": 6.2,
            "ph": 7.8,
            "turbidity": 3.5
        }
        response = self.client.post("/predict/ammonia", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn("nitrate", response.json()["detail"].lower())

    def test_predict_whitespot_missing_required_field(self):
        """Verify missing required field (e.g. turbidity) returns 422."""
        payload = {
            "temperature": 27.5,
            "dissolved_oxygen": 6.2,
            "ph": 7.8
        }
        response = self.client.post("/predict/whitespot", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn("turbidity", response.json()["detail"].lower())

    def test_predict_invalid_data_type(self):
        """Verify passing non-numeric string returns 422."""
        payload = {
            "temperature": "very_hot",
            "dissolved_oxygen": 6.2,
            "ph": 7.8,
            "turbidity": 3.5,
            "nitrate": 15.0
        }
        response = self.client.post("/predict/ammonia", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_api_prefix_aliases_work(self):
        """Verify /api/predict/ammonia and /api/predict/whitespot also work."""
        payload = {
            "temperature": 27.5,
            "dissolved_oxygen": 6.2,
            "ph": 7.8,
            "turbidity": 3.5,
            "nitrate": 15.0
        }
        res_a = self.client.post("/api/predict/ammonia", json=payload)
        self.assertEqual(res_a.status_code, 200)
        res_w = self.client.post("/api/predict/whitespot", json=payload)
        self.assertEqual(res_w.status_code, 200)

    def test_missing_model_file_handling(self):
        """Verify 503 Service Unavailable when model is missing."""
        old_model = predictions_module.ammonia_model
        old_path = predictions_module.AMMONIA_MODEL_PATH
        try:
            predictions_module.ammonia_model = None
            predictions_module.AMMONIA_MODEL_PATH = Path("non_existent_model.pkl")
            payload = {
                "temperature": 27.5,
                "dissolved_oxygen": 6.2,
                "ph": 7.8,
                "turbidity": 3.5,
                "nitrate": 15.0
            }
            response = self.client.post("/predict/ammonia", json=payload)
            self.assertEqual(response.status_code, 503)
            self.assertIn("unavailable", response.json()["detail"].lower())
        finally:
            predictions_module.ammonia_model = old_model
            predictions_module.AMMONIA_MODEL_PATH = old_path


if __name__ == "__main__":
    unittest.main()
