#!/bin/bash

# AquaGuard J26-SE-351: Multi-Service Launcher
# Launches the Edge IoT Node, Central Gateway, and Expo Mobile App

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=================================================="
echo "   AquaGuard: 4-in-1 AI Ecosystem Launcher        "
echo "=================================================="

# Function to clean up background processes on CTRL+C
cleanup() {
    echo ""
    echo "Stopping all AquaGuard background services..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

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
