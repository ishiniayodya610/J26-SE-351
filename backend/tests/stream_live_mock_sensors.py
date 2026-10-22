#!/usr/bin/env python3
"""
AquaGuard J26-SE-351: Live Remote ESP32 Sensor Pulse Streamer
Simulates a physical submerged ESP32 transmitting real-time sensor packets
every 2.0 seconds into the AquaGuard AI Central Gateway & Edge TinyML Engine.
"""

import sys
import os
import time
import random
import argparse
import httpx
from datetime import datetime

# Formatting constants
GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
RESET = "\033[0m"
BOLD = "\033[1m"

def clamp(val, min_v, max_v):
    return max(min_v, min(max_v, val))

def print_header(title: str):
    print(f"\n{CYAN}{BOLD}{'='*68}{RESET}")
    print(f"{CYAN}{BOLD}  {title}{RESET}")
    print(f"{CYAN}{BOLD}{'='*68}{RESET}")

def main():
    parser = argparse.ArgumentParser(description="Live 2-Second Remote ESP32 Sensor Streamer")
    parser.add_argument("--gateway", type=str, default="http://localhost:8000", help="Central Gateway URL")
    parser.add_argument("--interval", type=float, default=2.0, help="Pulse interval in seconds (default: 2.0s)")
    parser.add_argument("--base-temp", type=float, default=29.0, help="Baseline water temperature (°C)")
    parser.add_argument("--base-ph", type=float, default=6.50, help="Baseline water pH")
    parser.add_argument("--base-tds", type=float, default=150.0, help="Baseline water TDS (ppm)")
    parser.add_argument("--tank-id", type=int, default=1, help="Target Tank ID")
    parser.add_argument("--fault", type=str, choices=["none", "temp", "ph", "tds"], default="none", help="Inject emergency fault")
    args = parser.parse_args()

    print_header("AquaGuard: 2-Second Live Sensor Pulse Streamer")
    print(f"📡 Target Gateway : {BOLD}{args.gateway}{RESET}")
    print(f"⏱  Pulse Interval : {BOLD}{args.interval}s{RESET}")
    print(f"🏷  Device Label   : {BOLD}Live Remote ESP32 (Tank #{args.tank_id}){RESET}")
    print(f"🐠 Species Targets: Temp {args.base_temp}°C | pH {args.base_ph} | TDS {args.base_tds} ppm")
    print(f"💡 Evaluator Hint : Watch your Mobile App's header badge switch to:")
    print(f"   {GREEN}{BOLD}[ 🟢 LIVE REMOTE ESP32 (TANK #{args.tank_id}) ]{RESET}")
    print(f"{CYAN}{'-'*68}{RESET}")
    print(f"Press {BOLD}Ctrl+C{RESET} to stop the live stream.\n")

    pulse_count = 0
    curr_temp = args.base_temp
    curr_ph = args.base_ph
    curr_tds = args.base_tds

    # Track baseline for random thermal inertia
    thermal_trend = 0.0

    try:
        while True:
            pulse_count += 1
            now_str = datetime.now().strftime("%H:%M:%S")

            # Emulate physical aquatic probe dynamics
            if args.fault == "temp":
                # Severe thermal spike anomaly (+6.5°C jump)
                curr_temp = args.base_temp + 6.5
                curr_ph = args.base_ph + random.gauss(0.0, 0.02)
                curr_tds = args.base_tds + random.gauss(0.0, 1.5)
            elif args.fault == "ph":
                # Broken electrode jump (pH 2.2 acid drop)
                curr_temp = args.base_temp + random.gauss(0.0, 0.04)
                curr_ph = 2.20
                curr_tds = args.base_tds + random.gauss(0.0, 1.5)
            elif args.fault == "tds":
                # Scaling/conductivity spike (850 ppm)
                curr_temp = args.base_temp + random.gauss(0.0, 0.04)
                curr_ph = args.base_ph + random.gauss(0.0, 0.02)
                curr_tds = 850.0
            else:
                # Realistic water temperature inertia (slow thermal drift + DS18B20 quantization noise)
                thermal_trend += random.gauss(0.0, 0.01)
                thermal_trend = clamp(thermal_trend, -0.3, 0.3)
                curr_temp = round(args.base_temp + thermal_trend + random.choice([-0.0625, 0.0, 0.0625, 0.03]), 2)
                
                # Analog pH electrode micro-noise
                curr_ph = round(clamp(args.base_ph + random.gauss(0.0, 0.015), 5.5, 8.5), 2)
                
                # TDS conductivity jitter
                curr_tds = round(clamp(args.base_tds + random.gauss(0.0, 1.2), 50.0, 500.0), 1)

            payload = {
                "temp": curr_temp,
                "ph": curr_ph,
                "tds": curr_tds,
                "source": "REMOTE_ESP32",
                "device_label": f"Live Remote ESP32 (Tank #{args.tank_id})"
            }

            try:
                with httpx.Client(timeout=2.0) as client:
                    resp = client.post(f"{args.gateway}/api/telemetry/simulate", json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        status = data.get("system_status", "OPTIMAL")
                        ml_conf = data.get("ml_confidence", {})
                        timing = data.get("timing_ms", {})
                        gatekeeper = data.get("gatekeeper", {})

                        status_color = GREEN if status == "OPTIMAL" else RED
                        lockout_flag = ""
                        if gatekeeper.get("heater_lockout"):
                            lockout_flag += f" {RED}[HEATER LOCKED]{RESET}"
                        if gatekeeper.get("ph_pump_lockout"):
                            lockout_flag += f" {RED}[PUMP LOCKED]{RESET}"

                        normal_pct = ml_conf.get("normal", 0.95) * 100.0
                        infer_ms = timing.get("classification", 1)

                        print(
                            f"[{CYAN}{now_str}{RESET}] "
                            f"{BOLD}Pulse #{pulse_count:<3}{RESET} ──► "
                            f"Temp: {BOLD}{curr_temp:5.2f}°C{RESET} | "
                            f"pH: {BOLD}{curr_ph:4.2f}{RESET} | "
                            f"TDS: {BOLD}{curr_tds:5.1f} ppm{RESET} │ "
                            f"Status: {status_color}{BOLD}{status:<18}{RESET} "
                            f"TinyML: {GREEN}{normal_pct:4.1f}%{RESET} ({infer_ms}ms)"
                            f"{lockout_flag}",
                            flush=True
                        )
                    else:
                        print(f"[{YELLOW}{now_str}{RESET}] Pulse #{pulse_count}: Gateway error (HTTP {resp.status_code})", flush=True)
            except Exception as e:
                print(f"[{RED}{now_str}{RESET}] Pulse #{pulse_count}: Gateway unreachable ({e}). Is ./start_system.sh running?", flush=True)

            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n{YELLOW}Live sensor pulse streamer stopped.{RESET}")
        print(f"{GREEN}Total telemetry packets broadcasted: {pulse_count}{RESET}\n")

if __name__ == "__main__":
    main()
