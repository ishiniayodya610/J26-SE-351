import os
from pathlib import Path
from dotenv import load_dotenv

# Automatically locate and load .env from project root or backend folder
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
dotenv_path = ROOT_DIR / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)
else:
    load_dotenv()

# System Networking Ports
EDGE_NODE_URL = os.getenv("EDGE_NODE_URL", "http://localhost:3000")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
SIMULATOR_BIN_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "simulator", "runner", "build", "custom")
)

# Remote Aquio ESP32 Backend Configuration (Swagger: https://api.aquio.smartaquamarket.com/api/v1/docs#/)
AQUIO_ENABLED = os.getenv("AQUIO_ENABLED", "false").lower() in ("true", "1", "yes")
AQUIO_API_URL = os.getenv("AQUIO_API_URL", "https://api.aquio.smartaquamarket.com/api/v1").rstrip("/")
AQUIO_EMAIL = os.getenv("AQUIO_EMAIL", "").strip()
AQUIO_PASSWORD = os.getenv("AQUIO_PASSWORD", "").strip()
AQUIO_TANK_ID = int(os.getenv("AQUIO_TANK_ID", "1"))
AQUIO_POLL_INTERVAL_SEC = float(os.getenv("AQUIO_POLL_INTERVAL_SEC", "2.0"))
