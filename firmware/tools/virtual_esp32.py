#!/usr/bin/env python3
"""
AquaGuard Virtual ESP32 Hardware Emulator & Edge Digital Twin
Simulates a live ESP32-S3 microcontroller executing TinyML inference,
rendering OLED display frames, and streaming HTTP telemetry to the backend.

Usage:
    python3 firmware/tools/virtual_esp32.py
    python3 firmware/tools/virtual_esp32.py --url http://YOUR_VPS_IP:8000 --uid AG-ESP32-DEV01
"""

import sys
import os
import time
import json
import random
import argparse
import threading
import urllib.request
import urllib.error
import subprocess

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
CUSTOM_BINARY = os.path.join(PROJECT_ROOT, "simulator/runner/build/custom")

class VirtualESP32:
    def __init__(self, server_url: str, device_uid: str, tank_id: str):
        self.server_url = server_url.rstrip("/")
        self.device_uid = device_uid
        self.tank_id = tank_id
        
        # Target setpoints
        self.target_temp = 28.0
        self.target_ph = 6.80
        self.target_tds = 150

        # Current sensor baselines
        self.current_temp = 28.1
        self.current_ph = 6.82
        self.current_tds = 148.0

        # Previous anchors for 1s delta calculation
        self.prev_temp = self.current_temp
        self.prev_ph = self.current_ph
        self.prev_tds = self.current_tds

        # Actuator states
        self.heater_active = False
        self.pump_active = False
        self.heater_lockout = False
        self.pump_lockout = False
        self.thermal_runaway = False
        self.cloud_online = False

        self.running = True

    def clear_fault_lockouts(self):
        """Clears lockouts, resets runaway state, and re-anchors reference baseline."""
        self.heater_lockout = False
        self.pump_lockout = False
        self.thermal_runaway = False
        self.prev_temp = self.current_temp
        self.prev_ph = self.current_ph
        self.prev_tds = self.current_tds

    def display_registration_qr(self):
        """Displays registration QR and hardware information block."""
        print("\n" + "═" * 62)
        print("║            📷 AQUAGUARD HARDWARE REGISTRATION QR             ║")
        print("║    Point your AquaGuard Mobile App Camera at this screen:    ║")
        print("╠══════════════════════════════════════════════════════════════╣")
        print("║  ██████████████  ██    ██  ██████████████                    ║")
        print("║  ██          ██  ██    ██  ██          ██                    ║")
        print("║  ██  ██████  ██  ████  ██  ██  ██████  ██                    ║")
        print("║  ██  ██████  ██  ████████  ██  ██████  ██                    ║")
        print("║  ██  ██████  ██    ██  ██  ██  ██████  ██                    ║")
        print("║  ██          ██  ████  ██  ██          ██                    ║")
        print("║  ██████████████  ██  ████  ██████████████                    ║")
        print("║                  ████████                                    ║")
        print(f"║  DEVICE UID: {self.device_uid:<46}  ║")
        print(f"║  BACKEND   : {self.server_url:<46}  ║")
        print(f"║  TANK ID   : {self.tank_id:<46}  ║")
        print("║  STATUS    : Connected • Ready for Mobile App Provisioning   ║")
        print("╚" + "═" * 62 + "\n")

    def run_tinyml_gatekeeper(self, dt: float, dp: float, dd: float, raw_t: float):
        """Executes native C++ Edge Impulse INT8 model or software fallback."""
        if os.path.exists(CUSTOM_BINARY):
            try:
                cmd = [CUSTOM_BINARY, f"{dt:.4f}", f"{dp:.4f}", f"{dd:.4f}", f"{raw_t:.2f}"]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=1.0)
                if res.returncode == 0:
                    data = json.loads(res.stdout)
                    diag = data.get("diagnostics", {})
                    gate = data.get("gatekeeper", {})
                    conf = data.get("ml_confidence", {})
                    return {
                        "classification": data.get("system_status", "OPTIMAL"),
                        "temp_fault": diag.get("temperature", {}).get("fault_detected", False),
                        "ph_fault": diag.get("ph", {}).get("fault_detected", False),
                        "tds_fault": diag.get("tds", {}).get("fault_detected", False),
                        "thermal_runaway": gate.get("thermal_runaway", self.thermal_runaway),
                        "normal_conf": conf.get("normal", 0.98),
                        "infer_ms": data.get("timing_ms", {}).get("classification", 1)
                    }
            except Exception:
                pass

        # Resilient heuristic fallback if custom binary not compiled
        temp_fault = abs(dt) > 1.5 or raw_t > 38.0 or raw_t < 10.0
        ph_fault = abs(dp) > 0.8 or self.current_ph < 3.0 or self.current_ph > 11.0
        tds_fault = abs(dd) > 80.0

        classification = "OPTIMAL"
        if self.thermal_runaway:
            classification = "WELDED_RUNAWAY"
        elif temp_fault:
            classification = "TEMP_FAULT"
        elif ph_fault:
            classification = "PH_FAULT"
        elif tds_fault:
            classification = "TDS_FAULT"

        return {
            "classification": classification,
            "temp_fault": temp_fault,
            "ph_fault": ph_fault,
            "tds_fault": tds_fault,
            "thermal_runaway": self.thermal_runaway,
            "normal_conf": 0.20 if (temp_fault or ph_fault or tds_fault) else 0.98,
            "infer_ms": 1
        }

    def execute_actuation(self, clean_temp: float, clean_ph: float, ml: dict):
        """Simulates autonomous closed-loop heating and dosing pump relays."""
        if ml["thermal_runaway"]:
            self.heater_lockout = True
            self.pump_lockout = True
            self.heater_active = False
            self.pump_active = False
            return

        # Heater Control
        if ml["temp_fault"]:
            self.heater_lockout = True
            self.heater_active = False
        else:
            self.heater_lockout = False
            if clean_temp < (self.target_temp - 0.2):
                self.heater_active = True
            elif clean_temp >= self.target_temp:
                self.heater_active = False

        # pH Dosing Pump Control
        if ml["ph_fault"]:
            self.pump_lockout = True
            self.pump_active = False
        else:
            self.pump_lockout = False
            if clean_ph < (self.target_ph - 0.15):
                self.pump_active = True
            else:
                self.pump_active = False

    def uplink_telemetry(self, clean_t: float, clean_p: float, clean_d: float,
                         raw_t: float, raw_p: float, raw_d: float,
                         dt: float, dp: float, dd: float, ml: dict):
        """Pushes standard telemetry payload to central backend / VPS."""
        endpoint = f"{self.server_url}/api/telemetry/ingest"
        sys_status = "CRITICAL_THERMAL_RUNAWAY" if ml["thermal_runaway"] else (
            "DEGRADED_MITIGATED" if (ml["temp_fault"] or ml["ph_fault"] or ml["tds_fault"]) else "OPTIMAL"
        )

        payload = {
            "device_id": self.device_uid,
            "tank_id": self.tank_id,
            "firmware_version": "2.0.0-tinyml-virtual",
            "system_status": sys_status,
            "telemetry": {
                "temperature_c": clean_t,
                "ph": clean_p,
                "tds_ppm": clean_d,
                "raw_temp": raw_t,
                "raw_ph": raw_p,
                "raw_tds": raw_d
            },
            "deltas": {
                "delta_temp": dt,
                "delta_ph": dp,
                "delta_tds": dd
            },
            "actuators": {
                "heater_relay": self.heater_active,
                "ph_pump_relay": self.pump_active
            },
            "gatekeeper": {
                "heater_lockout": self.heater_lockout,
                "ph_pump_lockout": self.pump_lockout,
                "thermal_runaway": ml["thermal_runaway"],
                "classification": ml["classification"],
                "confidence": ml["normal_conf"]
            },
            "diagnostics": {
                "temperature": {"fault_detected": ml["temp_fault"], "imputed": ml["temp_fault"]},
                "ph": {"fault_detected": ml["ph_fault"], "imputed": ml["ph_fault"]},
                "tds": {"fault_detected": ml["tds_fault"], "imputed": ml["tds_fault"]}
            },
            "timing_ms": {"dsp": 0, "classification": ml["infer_ms"]},
            "ml_confidence": {
                "normal": ml["normal_conf"],
                "temp_fault": 0.85 if ml["temp_fault"] else 0.05,
                "ph_fault": 0.85 if ml["ph_fault"] else 0.05,
                "tds_fault": 0.85 if ml["tds_fault"] else 0.05
            },
            "target_params": {
                "target_temp": self.target_temp,
                "target_ph": self.target_ph,
                "target_tds": self.target_tds
            }
        }

        try:
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status in (200, 201):
                    self.cloud_online = True
                    resp_body = resp.read().decode("utf-8")
                    try:
                        resp_json = json.loads(resp_body)
                        # Check for downlink targets
                        targets = resp_json.get("target_params", {})
                        if "target_temp" in targets:
                            self.target_temp = float(targets["target_temp"])
                        
                        # Check for remote lockout clearance from Mobile App
                        cmds = resp_json.get("commands", {})
                        if cmds.get("clear_lockout"):
                            self.clear_fault_lockouts()
                    except Exception:
                        pass
                else:
                    self.cloud_online = False
        except Exception:
            self.cloud_online = False

    def render_oled_and_serial_dashboard(self, clean_t: float, clean_p: float, clean_d: float,
                                         dt: float, dp: float, dd: float, ml: dict):
        """Renders the physical 128x64 OLED simulation and ANSI monitor."""
        cloud_tag = "\033[92m[ONLINE ☁️]\033[0m" if self.cloud_online else "\033[93m[EDGE ⚡]\033[0m"
        
        # OLED Frame Simulation (128x64 Monochrome screen)
        print("\033[2J\033[H", end="") # Clear terminal screen
        print("╔════════════════════════════════════════════════════════════════════╗")
        print(f"║ 📟 ESP32 OLED 128x64 DISPLAY SIMULATOR           UID: {self.device_uid:<12} ║")
        print("╠════════════════════════════════════════════════════════════════════╣")
        print(f"║ ┌────────────────────────────────────────────────────────┐         ║")
        print(f"║ │ AquaGuard                                    {'[ONLINE]' if self.cloud_online else '[EDGE]  '} │         ║")
        print(f"║ ├────────────────────────────────────────────────────────┤         ║")
        print(f"║ │ TEMP : {clean_t:5.1f} C   (Target: {self.target_temp:4.1f})                        │         ║")
        print(f"║ │ pH   : {clean_p:5.2f}     (Target: {self.target_ph:4.2f})                        │         ║")
        print(f"║ │ TDS  : {clean_d:5.0f} ppm (Target: {self.target_tds:4d})                        │         ║")
        print(f"║ ├────────────────────────────────────────────────────────┤         ║")
        
        heat_str = "LOCK " if self.heater_lockout else ("ON*  " if self.heater_active else "OFF  ")
        pump_str = "LOCK" if self.pump_lockout else ("DOSE*" if self.pump_active else "IDLE")
        print(f"║ │ HEAT : [{heat_str}]   PUMP : [{pump_str}]                          │         ║")
        
        status_text = "STATUS: OK (99.8%)"
        if ml["thermal_runaway"]:
            status_text = "ALARM: RUNAWAY!!"
        elif ml["temp_fault"]:
            status_text = "WARN: TEMP FAULT"
        elif ml["ph_fault"]:
            status_text = "WARN: pH FAULT"
        elif ml["tds_fault"]:
            status_text = "WARN: TDS FAULT"
        print(f"║ │ {status_text:<54} │         ║")
        print(f"║ └────────────────────────────────────────────────────────┘         ║")
        print("╠════════════════════════════════════════════════════════════════════╣")
        print(f"║ 🌐 Telemetry Uplink: {self.server_url:<30} {cloud_tag}   ║")
        print(f"║ 🧠 TinyML Rate-of-Change: ΔT={dt:+.3f}°C | ΔpH={dp:+.3f} | ΔTDS={dd:+.1f} ppm  ║")
        print("╠════════════════════════════════════════════════════════════════════╣")
        print("║ ⌨️  Interactive Commands (Press Enter after typing):                 ║")
        print("║    t <val> : Set Temp (e.g. 't 33.5' to trigger spike fault)       ║")
        print("║    p <val> : Set pH   (e.g. 'p 2.5'  to trigger acid fault)        ║")
        print("║    d <val> : Set TDS  (e.g. 'd 450'  to trigger TDS jump)          ║")
        print("║    runaway : Toggle heater welded relay thermal runaway alarm      ║")
        print("║    reset   : Restore nominal water equilibrium                     ║")
        print("║    q       : Exit emulator                                         ║")
        print("╚════════════════════════════════════════════════════════════════════╝")
        print("Enter command > ", end="", flush=True)

    def input_listener(self):
        """Background thread handling interactive fault injection from terminal."""
        while self.running:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                cmd = line.strip().split()
                if not cmd:
                    continue
                op = cmd[0].lower()
                if op == "q":
                    self.running = False
                    break
                elif op == "t" and len(cmd) > 1:
                    self.current_temp = float(cmd[1])
                elif op == "p" and len(cmd) > 1:
                    self.current_ph = float(cmd[1])
                elif op == "d" and len(cmd) > 1:
                    self.current_tds = float(cmd[1])
                elif op in ("c", "clear"):
                    self.clear_fault_lockouts()
                elif op == "runaway":
                    self.thermal_runaway = not self.thermal_runaway
                elif op == "reset":
                    self.current_temp = self.target_temp
                    self.current_ph = self.target_ph
                    self.current_tds = float(self.target_tds)
                    self.prev_temp = self.current_temp
                    self.prev_ph = self.current_ph
                    self.prev_tds = self.current_tds
                    self.thermal_runaway = False
            except Exception:
                pass

    def run(self):
        """Main 1 Hz loop matching physical ESP32 firmware."""
        self.display_registration_qr()
        time.sleep(2.0)

        # Start interactive keyboard listener in background
        threading.Thread(target=self.input_listener, daemon=True).start()

        while self.running:
            # 1. Natural gentle thermal drift if no manual injection
            if not self.thermal_runaway and not self.heater_active:
                self.current_temp += random.uniform(-0.02, 0.01)
            elif self.heater_active:
                self.current_temp += 0.05
            
            raw_temp = self.current_temp
            raw_ph = self.current_ph
            raw_tds = self.current_tds

            # 2. 1-Second Rate of Change
            dt = raw_temp - self.prev_temp
            dp = raw_ph - self.prev_ph
            dd = raw_tds - self.prev_tds

            # 3. TinyML Gatekeeper
            ml = self.run_tinyml_gatekeeper(dt, dp, dd, raw_temp)

            # 4. Imputation
            clean_temp = self.prev_temp if ml["temp_fault"] else raw_temp
            clean_ph = self.prev_ph if ml["ph_fault"] else raw_ph
            clean_tds = self.prev_tds if ml["tds_fault"] else raw_tds

            if not ml["temp_fault"]: self.prev_temp = raw_temp
            if not ml["ph_fault"]: self.prev_ph = raw_ph
            if not ml["tds_fault"]: self.prev_tds = raw_tds

            # 5. Closed-loop actuation
            self.execute_actuation(clean_temp, clean_ph, ml)

            # 6. Uplink to Cloud VPS / localhost:8000
            self.uplink_telemetry(clean_temp, clean_ph, clean_tds,
                                  raw_temp, raw_ph, raw_tds,
                                  dt, dp, dd, ml)

            # 7. Render OLED screen & Serial monitor
            self.render_oled_and_serial_dashboard(clean_temp, clean_ph, clean_tds,
                                                  dt, dp, dd, ml)

            time.sleep(1.0)

        print("\n[Virtual ESP32] Emulator stopped.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AquaGuard Virtual ESP32 Hardware Emulator")
    parser.add_argument("--url", default="http://localhost:8000", help="Backend / VPS server URL")
    parser.add_argument("--uid", default="AG-ESP32-DEV01", help="Device Unique Identifier")
    parser.add_argument("--tank-id", default="default_tank_5", help="MongoDB Tank ID")
    args = parser.parse_args()

    emulator = VirtualESP32(server_url=args.url, device_uid=args.uid, tank_id=args.tank_id)
    emulator.run()
