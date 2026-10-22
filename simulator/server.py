import http.server
import socketserver
import json
import subprocess
import os
import sys
import time
from datetime import datetime
import urllib.request
import urllib.error

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
GATEWAY_UPLINK_URL = "http://localhost:8000/api/telemetry/ingest"

def format_tinyml_terminal_log(parsed: dict, source_type: str = "SIMULATED_TESTBED") -> tuple:
    """
    Generates a high-visibility, forensic C++ TinyML inference execution log.
    Returns: (plain_log_string_for_ui, ansi_colored_log_string_for_cli)
    """
    timing = parsed.get("timing_ms", {})
    deltas = parsed.get("deltas", {})
    confidence = parsed.get("ml_confidence", {})
    gatekeeper = parsed.get("gatekeeper", {})
    telem = parsed.get("telemetry", {})
    status = parsed.get("system_status", "OPTIMAL")

    dt = deltas.get("delta_temp", 0.0)
    dp = deltas.get("delta_ph", 0.0)
    dd = deltas.get("delta_tds", 0.0)

    dsp_ms = timing.get("dsp", 0)
    infer_ms = timing.get("classification", 1)
    anomaly_ms = timing.get("anomaly", 0)

    heater_locked = gatekeeper.get("heater_lockout", False)
    pump_locked = gatekeeper.get("ph_pump_lockout", False)
    runaway = gatekeeper.get("thermal_runaway", False)

    now_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]

    # ANSI Color Escapes for Host Terminal
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"

    is_alarm = (status != "OPTIMAL") or runaway
    box_color = RED if is_alarm else CYAN
    status_color = RED if is_alarm else GREEN

    # Format softmax bars
    scores_plain = []
    scores_ansi = []
    for k, v in confidence.items():
        pct = v * 100.0
        bar = "█" * int(round(pct / 10))
        scores_plain.append(f"{k}: {pct:5.1f}%")
        k_color = RED if (k != "normal" and v > 0.5) else (GREEN if k == "normal" and v > 0.5 else DIM)
        scores_ansi.append(f"{k_color}{k}: {pct:5.1f}% {bar}{RESET}")

    scores_plain_str = " | ".join(scores_plain)
    scores_ansi_str = " | ".join(scores_ansi)

    raw_t = telem.get("raw_temp", 0.0)
    raw_p = telem.get("raw_ph", 0.0)
    raw_d = telem.get("raw_tds", 0.0)
    clean_t = telem.get("temperature_c", 0.0)
    clean_p = telem.get("ph", 0.0)
    clean_d = telem.get("tds_ppm", 0.0)

    imputed = (raw_t != clean_t) or (raw_p != clean_p) or (raw_d != clean_d)

    # Clean UI Monospace Log Line
    plain_log = (
        f"[{now_str}] [TFLM INT8] Δ=[{dt:+.2f}°C, {dp:+.2f}, {dd:+.0f}ppm] | "
        f"Exec: DSP={dsp_ms}ms Infer={infer_ms}ms | "
        f"ML: {scores_plain_str} | "
        f"Relays: Heater={'LOCKED' if heater_locked else 'ON'} Pump={'LOCKED' if pump_locked else 'ON'} | "
        f"Status: {status}{' [IMPUTED]' if imputed else ''}"
    )

    # ANSI Box for Host Terminal CLI
    ansi_cli = (
        f"\n{BOLD}{box_color}┌─── [TINYML EDGE INFERENCE] Edge Impulse C++ SDK v23 • ESP32 Device Twin ───┐{RESET}\n"
        f"│ {DIM}Timestamp: {now_str} | Target: Xtensa LX6 @ 240MHz | Quantization: INT8 TFLM{RESET} │\n"
        f"├─────────────────────────────────────────────────────────────────────────────┤\n"
        f"│ {BOLD}Input Tensor [ΔT, ΔpH, ΔTDS]{RESET}:   {CYAN}ΔT={dt:+.2f}°C{RESET}  {CYAN}ΔpH={dp:+.2f}{RESET}  {CYAN}ΔTDS={dd:+.0f} ppm{RESET}\n"
        f"│ {BOLD}Hardware Profiler{RESET}:            DSP: {dsp_ms} ms | TFLM Invocation: {infer_ms} ms | Anomaly: {anomaly_ms} ms\n"
        f"│ {BOLD}Softmax Class Probabilities{RESET}:    {scores_ansi_str}\n"
        f"│ {BOLD}Gatekeeper Safety Interlock{RESET}:    "
        f"Heater Relay: {RED+'LOCKED OUT (SAFETY)'+RESET if heater_locked else GREEN+'ENABLED'+RESET}  "
        f"Dosing Pump: {RED+'LOCKED OUT'+RESET if pump_locked else GREEN+'ENABLED'+RESET}\n"
        f"│ {BOLD}Sanitized Cloud Telemetry{RESET}:      "
        f"Raw: [{raw_t:.2f}°C, {raw_p:.2f}, {raw_d:.0f}ppm] -> "
        f"{YELLOW if imputed else GREEN}Forwarded: [{clean_t:.2f}°C, {clean_p:.2f}, {clean_d:.0f}ppm]{RESET}\n"
        f"│ {BOLD}Inference Verdict{RESET}:              {status_color}{BOLD}{status}{RESET}"
        f"{'  🚨 THERMAL RUNAWAY' if runaway else ''}\n"
        f"{BOLD}{box_color}└─────────────────────────────────────────────────────────────────────────────┘{RESET}\n"
    )

    return plain_log, ansi_cli

def uplink_telemetry_to_gateway(json_payload_str: str):
    """
    Simulates physical ESP32 WiFi HTTPClient uplink to Central Gateway.
    Uplinks the autonomous telemetry packet to the FastAPI gateway on Port 8000.
    Operates offline-tolerant: if gateway is unreachable, edge continues running.
    """
    try:
        req = urllib.request.Request(
            GATEWAY_UPLINK_URL,
            data=json_payload_str.encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            pass
    except Exception as e:
        print(f"[Edge Simulator] Central Gateway uplink offline/deferred: {e}")

class SimulatorHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/reset':
            content_length = int(self.headers.get('Content-Length', 0))
            data = {}
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    data = json.loads(post_data.decode('utf-8'))
                except Exception:
                    pass
            temp = data.get('temp', 29.0)
            ph = data.get('ph', 6.5)
            tds = data.get('tds', 150.0)

            executable_path = os.path.join(DIRECTORY, "runner", "build", "custom")
            try:
                result = subprocess.run([executable_path, "--reset", str(temp), str(ph), str(tds)], capture_output=True, text=True, check=True)
                
                # As an autonomous edge node, run a nominal pass and uplink baseline to gateway
                try:
                    base_res = subprocess.run([executable_path, str(temp), str(ph), str(tds)], capture_output=True, text=True, check=True)
                    uplink_telemetry_to_gateway(base_res.stdout)
                except Exception as uplink_err:
                    print(f"[Edge Simulator Reset] Uplink error: {uplink_err}")

                print(f"\033[94m[TinyML Edge Simulator] Baseline state reset to Temp={temp:.1f}°C, pH={ph:.2f}, TDS={tds:.0f} ppm\033[0m")
                sys.stdout.flush()

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(result.stdout.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/simulate':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            temp = data.get('temp', 29.0)
            ph = data.get('ph', 6.5)
            tds = data.get('tds', 150.0)

            prev_temp = data.get('prev_temp')
            prev_ph = data.get('prev_ph')
            prev_tds = data.get('prev_tds')
            
            # 1. Execute on-device compiled C++ Edge Impulse model (local offline inference)
            executable_path = os.path.join(DIRECTORY, "runner", "build", "custom")
            cmd = [executable_path, str(temp), str(ph), str(tds)]
            if prev_temp is not None and prev_ph is not None and prev_tds is not None:
                cmd.extend([str(prev_temp), str(prev_ph), str(prev_tds)])
            
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                json_output = result.stdout

                # Parse C++ output, enrich with data_source metadata and terminal_log
                try:
                    parsed = json.loads(json_output)
                    source_type = data.get('source', 'SIMULATED_TESTBED')
                    is_real = source_type == 'REMOTE_ESP32'
                    parsed['data_source'] = {
                        'type': source_type,
                        'label': 'Live Remote ESP32 (Tank #1)' if is_real else 'Evaluator Testbed Simulator',
                        'is_real_hardware': is_real
                    }

                    # Format terminal execution logs
                    plain_log, ansi_log = format_tinyml_terminal_log(parsed, source_type)
                    parsed['terminal_log'] = plain_log

                    # 🟢 FORENSIC PROOF: Print directly to Host Terminal stdout!
                    sys.stdout.write(ansi_log)
                    sys.stdout.flush()

                    json_output = json.dumps(parsed)
                except Exception as log_err:
                    print(f"[Logging Exception] {log_err}")

                # 2. Autonomous IoT Telemetry Uplink: Push telemetry packet to Central Gateway (:8000)
                # Exactly mirrors physical ESP32 WiFi HTTPClient POST
                uplink_telemetry_to_gateway(json_output)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json_output.encode('utf-8'))
            except subprocess.CalledProcessError as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = json.dumps({"error": "Failed to run C++ simulation", "details": e.stderr})
                self.wfile.write(error_response.encode('utf-8'))
            except FileNotFoundError:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = json.dumps({"error": "C++ Binary not found. Waiting for compilation to finish..."})
                self.wfile.write(error_response.encode('utf-8'))

        else:
            self.send_response(404)
            self.end_headers()

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with ThreadedTCPServer(("", PORT), SimulatorHandler) as httpd:
        print(f"Edge IoT Device Simulator running at http://localhost:{PORT}")
        print(f"Autonomous Central Gateway Uplink -> {GATEWAY_UPLINK_URL}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down Edge IoT Device Simulator.")

