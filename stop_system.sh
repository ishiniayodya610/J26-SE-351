#!/bin/bash

# AquaGuard J26-SE-351: Multi-Service Stopper
# Gracefully stops all Edge Simulator, Central Gateway, and Expo Mobile processes

echo "=================================================="
echo "   Stopping AquaGuard Ecosystem Services          "
echo "=================================================="

STOPPED=0

for PORT in 3000 8000 8081; do
    PIDS=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "Stopping service on Port $PORT (PID $PIDS)..."
        kill -9 $PIDS 2>/dev/null || true
        STOPPED=1
    fi
done

# Kill any stray uvicorn or simulator python processes if still alive
pkill -f "simulator/server.py" 2>/dev/null && STOPPED=1
pkill -f "uvicorn backend.app.main:app" 2>/dev/null && STOPPED=1

if [ $STOPPED -eq 1 ]; then
    echo "✅ All AquaGuard services (Ports 3000, 8000, 8081) stopped successfully."
else
    echo "ℹ️  No active AquaGuard services were running."
fi
