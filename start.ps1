# ============================================================
# AquaGuard J26-SE-351: Windows PowerShell Multi-Service Launcher
# ============================================================

$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   AquaGuard: 4-in-1 AI Ecosystem Launcher       " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Edge IoT Simulator (Port 3000)
Write-Host "[1/3] Starting Edge IoT Device Simulator (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PROJECT_ROOT'; Write-Host 'SIMULATOR (Port 3000)' -ForegroundColor Green; .\backend\venv\Scripts\python.exe simulator\server.py"

Start-Sleep -Seconds 1

# 2. FastAPI Backend (Port 8000)
Write-Host "[2/3] Starting Central Gateway Backend (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PROJECT_ROOT'; `$env:PYTHONPATH = '$PROJECT_ROOT\backend;$PROJECT_ROOT'; Write-Host 'BACKEND API (Port 8000)' -ForegroundColor Green; .\backend\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload"

Start-Sleep -Seconds 2

# 3. Expo Mobile App (Port 8081)
Write-Host "[3/3] Starting Expo Mobile App (Port 8081)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PROJECT_ROOT\mobile'; Write-Host 'EXPO MOBILE APP (Port 8081)' -ForegroundColor Green; npx expo start"

Write-Host ""
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "  All services launched in separate windows!     " -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Simulator  : http://localhost:3000             " -ForegroundColor White
Write-Host "  Backend    : http://localhost:8000             " -ForegroundColor White
Write-Host "  Swagger    : http://localhost:8000/docs        " -ForegroundColor White
Write-Host "  Mobile App : http://localhost:8081             " -ForegroundColor White
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Press 'w' in Expo window to open browser app  " -ForegroundColor Yellow
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
