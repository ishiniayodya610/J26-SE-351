import os

EDGE_NODE_URL = os.getenv("EDGE_NODE_URL", "http://localhost:3000")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 8000))
SIMULATOR_BIN_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "simulator", "runner", "build", "custom")
)
