import sys
import os
import pytest

# Automatically add project root to sys.path for pytest
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

STATE_FILE = "/tmp/aquaguard_state.txt"

@pytest.fixture(autouse=True)
def reset_aquaguard_state():
    """Resets the persistent edge runner baseline before every test."""
    try:
        with open(STATE_FILE, "w") as f:
            f.write("28.500 6.800 150.000\n")
    except Exception:
        pass
    yield
    try:
        if os.path.exists(STATE_FILE):
            os.remove(STATE_FILE)
    except Exception:
        pass
