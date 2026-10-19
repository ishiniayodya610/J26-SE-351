#!/bin/bash

# AquaGuard J26-SE-351: Multi-Service Launcher
# Launches the Edge IoT Node, Central Gateway, and Expo Mobile App

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=================================================="
echo "   AquaGuard: 4-in-1 AI Ecosystem Launcher        "
echo "=================================================="

# Function to clean up background processes on CTRL+C or exit
cleanup() {
    echo ""
    echo "Stopping all AquaGuard background services..."
    [ -n "$EDGE_PID" ] && kill -9 $EDGE_PID 2>/dev/null || true
    [ -n "$BACKEND_PID" ] && kill -9 $BACKEND_PID 2>/dev/null || true
    kill $(jobs -p) 2>/dev/null || true
    for PORT in 3000 8000 8081; do
        PIDS=$(lsof -ti :$PORT 2>/dev/null)
        if [ -n "$PIDS" ]; then
            kill -9 $PIDS 2>/dev/null || true
        fi
    done
}
trap cleanup EXIT INT TERM

# Proactively free ports 3000, 8000, and 8081 if previously occupied
for PORT in 3000 8000 8081; do
    PIDS=$(lsof -ti :$PORT 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "Clearing port $PORT (PID $PIDS)..."
        kill -9 $PIDS 2>/dev/null || true
    fi
done
sleep 1

# Ensure C++ TinyML runner binary is compiled
if [ ! -f "$PROJECT_ROOT/simulator/runner/build/custom" ]; then
    echo "Compiling C++ Edge Impulse runner binary..."
    make -C "$PROJECT_ROOT/simulator/runner" -j4 APP_CUSTOM=1
fi

# 1. Start the Standalone Edge IoT Device Simulator (Port 3000)
echo "[1/3] Starting Edge IoT Device Simulator (Port 3000)..."
python3 "$PROJECT_ROOT/simulator/server.py" &
EDGE_PID=$!

# Wait briefly for Edge Simulator to bind
sleep 1

# 2. Start Central Gateway Backend (Port 8000)
echo "[2/3] Starting Central Gateway Backend (Port 8000)..."
"$PROJECT_ROOT/backend/venv/bin/uvicorn" backend.app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait briefly for Backend to bind
sleep 2

# 3. Start Expo Mobile App (Port 8081)
echo "[3/3] Starting Expo Mobile Application..."
echo "--------------------------------------------------"
echo "💻 Evaluator Web Studio: http://localhost:3000"
echo "🌐 Central Gateway API : http://localhost:8000"
echo "📄 Swagger API Docs    : http://localhost:8000/docs"
echo "📱 Mobile App (iPhone) : Safari -> exp://192.168.1.107:8081"
echo "--------------------------------------------------"
echo "Scan the QR code below using Expo Go on your phone"
echo "Or press 'w' to open the mobile app in your browser!"
echo "--------------------------------------------------"

cd "$PROJECT_ROOT/mobile"
npx expo start
