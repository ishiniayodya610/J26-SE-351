# AquaGuard ESP32-S3 Autonomous TinyML Firmware

This folder contains the complete, production-ready firmware and on-device TinyML neural network inference engine for the **AquaGuard IoT Aquarium Controller (Component 1)**.

---

## 📁 Folder Structure

```
firmware/
├── README.md                                  # This guide
├── config.h                                   # Pin allocations, calibration, and VPS server settings
├── esp32_firmware/
│   ├── esp32_firmware.ino                     # Main Arduino sketch (TinyML loop + Actuators + Uplink)
│   └── config.h                               # Configuration header (symlinked / included)
└── libraries/
    └── AquaGuard-TinyML-Gatekeeper_inferencing/ # Official Edge Impulse C++ INT8 Library
        ├── library.properties
        └── src/
            ├── AquaGuard-TinyML-Gatekeeper_inferencing.h
            ├── edge-impulse-sdk/
            ├── model-parameters/
            └── tflite-model/
```

---

## ⚡ Hardware Capabilities & Workflow

1. **100% Autonomous Edge Operation**:
   * Reads **DS18B20** digital temperature probe, **PH-4502C** analog probe, and **Gravity TDS** conductivity probe.
   * Calculates 1-second sliding-window temporal rates-of-change ($\Delta T$, $\Delta pH$, $\Delta TDS$).
   * Executes Edge Impulse INT8 neural network model directly on the Xtensa dual-core chip in **< 1 ms**.
   * Regulates heater and chemical dosing pump relays even if Wi-Fi or internet is completely offline.
2. **Sensor Fault Lockout & Data Imputation**:
   * Spikes or probe detachment trigger immediate hardware relay lockouts to prevent boiling or poisoning livestock.
   * Sanitizes and imputes verified safe baseline values for continuous closed-loop control.
3. **Thermal Runaway Protection**:
   * Continuously cross-checks heater relay command against water temperature trend. If temperature rises while the heater relay is commanded OFF, flags a physical welded relay failure and cuts power.
4. **Cloud VPS Uplink**:
   * Synchronizes telemetry packets via HTTP POST to `http://YOUR_VPS_IP:8000/api/telemetry/ingest`.
   * Automatically ingests target parameter updates from the backend into ESP32 NVS flash.

---

## 🛠️ Step-by-Step Flashing Instructions

### 1. Install Arduino IDE & ESP32 Board Core
1. Download and install [Arduino IDE (v2.0+)](https://www.arduino.cc/en/software).
2. Open **Settings / Preferences** (`Cmd + ,` or `Ctrl + ,`).
3. Add the ESP32 Board Manager URL to **Additional Boards Manager URLs**:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Go to **Tools $\rightarrow$ Board $\rightarrow$ Boards Manager**, search for **esp32** by *Espressif Systems*, and click **Install**.

---

### 2. Install Required Libraries

#### A. Install the Edge Impulse TinyML Library (Included)
Copy the pre-compiled Edge Impulse library from this repo into your Arduino libraries folder:
* **macOS**: `~/Documents/Arduino/libraries/`
* **Windows**: `Documents\Arduino\libraries\`
* **Linux**: `~/Arduino/libraries/`

```bash
# On macOS / Linux, you can run:
cp -R firmware/libraries/AquaGuard-TinyML-Gatekeeper_inferencing ~/Documents/Arduino/libraries/
```

#### B. Install Sensor & Display Libraries via Arduino Library Manager
Open **Tools $\rightarrow$ Manage Libraries...** in Arduino IDE and install:
1. **OneWire** (by *Paul Stoffregen*)
2. **DallasTemperature** (by *Miles Burton*)
3. **Adafruit SSD1306** (by *Adafruit*)
4. **Adafruit GFX Library** (by *Adafruit*)

---

### 3. Configure Your Network & VPS Settings
Open [`firmware/esp32_firmware/config.h`](file:///Users/sandunudayakantha/research/J26-SE-351/firmware/esp32_firmware/config.h) in your editor or Arduino IDE:

```cpp
// 1. Enter your Wi-Fi credentials:
#define DEFAULT_WIFI_SSID         "Your_WiFi_SSID"
#define DEFAULT_WIFI_PASSWORD     "Your_WiFi_Password"

// 2. Set your Cloud VPS IP (or Domain) on Port 8000:
#define DEFAULT_SERVER_URL        "http://YOUR_VPS_IP:8000"

// 3. Set your Device UID:
#define DEFAULT_DEVICE_UID        "AG-ESP32-DEV01"
```

---

### 4. Board & Upload Settings

Connect your ESP32-S3 or standard ESP32 board to your computer via USB-C.

#### For ESP32-S3 DevKitC-1 (N16R8):
* **Board**: `ESP32S3 Dev Module`
* **USB CDC On Boot**: `Enabled`
* **CPU Frequency**: `240MHz (WiFi)`
* **Flash Size**: `16MB (128Mb)`
* **Flash Mode**: `QIO 80MHz`
* **Partition Scheme**: `16M Flash (3MB APP/9.9MB FAT)` or `Default 4MB with spiffs`
* **PSRAM**: `OPI PSRAM` (or Disabled if using non-PSRAM chip)
* **Port**: Select the active `/dev/cu.usbmodem...` (Mac) or `COMx` (Windows)

#### For standard ESP32 DevKit V1 (38-pin):
* **Board**: `ESP32 Dev Module`
* **Flash Size**: `4MB`
* **Partition Scheme**: `Huge APP (3MB No OTA/1MB SPIFFS)`
* **Upload Speed**: `921600`

---

### 5. Compile and Flash
1. Open [`firmware/esp32_firmware/esp32_firmware.ino`](file:///Users/sandunudayakantha/research/J26-SE-351/firmware/esp32_firmware/esp32_firmware.ino) in Arduino IDE.
2. Click **Verify (Checkmark)** to ensure all libraries compile cleanly.
3. Click **Upload (Arrow)** to flash the binary to the microcontroller.
4. Open **Serial Monitor** at **115200 baud** to view real-time TinyML inference and sensor telemetry.

---

### 6. Physical Circuit Pinout Reference

| Component | Pin / Wire | ESP32 GPIO | Notes |
|---|---|---|---|
| **DS18B20 Temp Probe** | Data (Yellow) | **GPIO 4** | Requires **4.7kΩ pull-up resistor** to 3.3V |
| | VCC (Red) | **3.3V** | |
| | GND (Black) | **GND** | |
| **PH-4502C pH Board** | Analog Output (PO) | **GPIO 34** | Passes through **10kΩ / 10kΩ voltage divider** |
| | VCC | **5V (VIN)** | |
| | GND | **GND** | |
| **Gravity TDS Probe** | Analog Signal | **GPIO 35** | Connects to ADC1 Channel 7 |
| | VCC | **GPIO 23** | **Power Gate**: Switched ON only during sampling |
| | GND | **GND** | |
| **I2C OLED Display (0.96"/1.3" SSD1306)** | SDA | **GPIO 21** | I2C Data line for live OLED dashboard |
| | SCL | **GPIO 22** | I2C Clock line |
| | VCC | **3.3V** | Powers display controller |
| | GND | **GND** | |
| **Relay Channel 1 (Heater)** | IN1 (Signal) | **GPIO 18** | Optocoupled Active LOW (Safe OFF on boot) |
| | VCC | **5V (VIN)** | Powers relay optocoupler |
| | GND | **GND** | |
| **Relay Channel 2 (Pump)** | IN2 (Signal) | **GPIO 19** | Optocoupled Active LOW for 12V Dosing Pump |
| | VCC | **5V (VIN)** | |
| | GND | **GND** | |
| **Tactile Push Button** | Pin 1 | **GPIO 12** | Pulls to GND when pressed (Internal pull-up) |
| | Pin 2 | **GND** | |

---

### 7. Real-Time Hardware Display Dashboard

When the AquaGuard controller runs, it renders a high-contrast dashboard at 1 Hz on both the physical OLED screen and the formatted ANSI Serial Monitor:

```
┌────────────────────────────────────────────────────────┐
│ 🐟 AQUAGUARD RUNTIME MONITOR  UID: AG-ESP32-A1B2C3     │
├────────────────────────────┬───────────────────────────┤
│ LIVE READINGS (1s Delta)   │ TARGET WATER PARAMETERS   │
│  • Temp: 28.20°C (+0.012)  │  • Target Temp: 28.00°C   │
│  • pH  :  6.82   (-0.005)  │  • Target pH  :  6.80     │
│  • TDS : 148.0ppm (+0.210) │  • Target TDS :  150 ppm  │
├────────────────────────────┴───────────────────────────┤
│ GATEKEEPER : ✅ OPTIMAL (Normal Operating Baseline)    │
│ HEATER     : [ACTIVE ON 🔥]  DOSING PUMP: [IDLE ⏸️]    │
│ CLOUD LINK : [ONLINE ☁️]    INFERENCE  : 1 ms          │
└────────────────────────────────────────────────────────┘
```

#### Screen UI Layout (128x64 OLED):
* **Top Header**: Inverted bar showing `AquaGuard` and Cloud connection pill `[ONLINE]` (or `[EDGE]` when offline).
* **Metrics Rows**: Live Temperature (`28.2°C`), pH (`6.82`), and TDS (`148ppm`) with target setpoints alongside (`(28.0)`, `(6.80)`, `(150)`).
* **Actuator Row**: Live state for Heater (`ON*` / `OFF` / `LOCK`) and pH Dosing Pump (`DOSE*` / `IDLE` / `LOCK`).
* **Gatekeeper Status**:
  * `STATUS: OK (99.8%)` under optimal water stability.
  * `WARN: TEMP FAULT` / `WARN: pH FAULT` when an anomaly occurs (faulty sensor is imputed with safe baseline).
  * `ALARM: RUNAWAY!!` when thermal runaway / welded relay is detected (emergency cutoff).

---

### 8. Evaluator Bench Demonstration & Fault Injection

If demonstrating to examiners without submerged water probes:
1. In `config.h`, set:
   ```cpp
   #define USE_PHYSICAL_SENSORS false
   ```
2. Upload the sketch and open Serial Monitor at **115200 baud**.
3. Send test commands via the Serial input field:
   * Send `T32.6` $\rightarrow$ Simulates an impossible +3.6°C thermal jump. Observe: TinyML flags `temp_fault`, locks out the heater relay instantly, imputes the safe baseline, and displays `WARN: TEMP FAULT` on the screen.
   * Send `P2.2` $\rightarrow$ Simulates a broken pH probe reading pH 2.2. Observe: TinyML flags `ph_fault`, locks out the dosing pump, and displays `WARN: pH FAULT` on the screen.

---

### 9. Testing Without Physical ESP32 Hardware

To test and verify the entire system without flashing a real ESP32 board, three zero-hardware test environments are provided:

#### A. Interactive CLI Virtual ESP32 Hardware Emulator
Run the built-in emulator directly on your Mac/Linux terminal:
```bash
python3 firmware/tools/virtual_esp32.py
# Or with custom VPS / tank settings:
python3 firmware/tools/virtual_esp32.py --url http://localhost:8000 --uid AG-ESP32-DEV01
```
* **Features**:
  * Displays the Registration QR code directly in the terminal so you can scan it with the mobile app camera!
  * Executes the exact C++ Edge Impulse INT8 neural network model at 1 Hz.
  * Streams live telemetry to the backend on port 8000.
  * Renders the real-time 128x64 OLED dashboard in the terminal.
  * Interactive fault injection: Type `t 33.5` or `p 2.5` or `runaway` to trigger instant safety lockouts.

#### B. AquaGuard Digital Twin Web Simulator
Run the full browser-based digital twin testbed:
```bash
python3 simulator/server.py
```
Open **`http://localhost:3000`** in any web browser to view animated water physics, real-time gauge dials, and one-click anomaly injection buttons.

#### C. Wokwi Virtual Circuit Simulation
Open [Wokwi ESP32 Simulator](https://wokwi.com/projects/new/esp32), paste [`firmware/wokwi/diagram.json`](file:///Users/sandunudayakantha/research/J26-SE-351/firmware/wokwi/diagram.json) and [`esp32_firmware.ino`](file:///Users/sandunudayakantha/research/J26-SE-351/firmware/esp32_firmware/esp32_firmware.ino), and click **Play (▶️)** to simulate the complete ESP32 chip, OLED screen, and relay hardware in real time.
