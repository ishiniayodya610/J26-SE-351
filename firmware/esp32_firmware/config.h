/**
 * AquaGuard - Autonomous Edge TinyML IoT Controller & Gatekeeper
 * Hardware Configuration & Calibration Settings
 * 
 * Hardware Target: ESP32-S3 DevKitC-1 (N16R8) or ESP32 DevKit V1 (38-pin)
 */
#ifndef AQUAGUARD_CONFIG_H
#define AQUAGUARD_CONFIG_H

#include <Arduino.h>

// ==============================================================================
// 🔌 1. HARDWARE MODE SELECTOR
// ==============================================================================
// Set to true  -> Reads live physical submersible probes (DS18B20, PH-4502C, TDS).
// Set to false -> Evaluator demo mode: allows injecting sensor values via Serial terminal ('T29.5', 'P6.8', etc.)
#define USE_PHYSICAL_SENSORS      true

// ==============================================================================
// 📌 2. GPIO PIN DEFINITIONS
// ==============================================================================
// 🌡️ DS18B20 Waterproof Temperature Probe (1-Wire digital signal)
// Note: Requires a 4.7kΩ pull-up resistor between Data (Yellow) and 3.3V (Red)
#define PIN_ONE_WIRE              4

// 🧪 Analog pH Sensor (PH-4502C module with BNC glass probe)
// Note: Connect through 10kΩ / 10kΩ voltage divider to scale 5.0V output to 2.5V max
#define PIN_PH_ADC                34

// 💧 Gravity Analog TDS (Total Dissolved Solids) Conductivity Probe
#define PIN_TDS_ADC               35

// ⚡ TDS Probe VCC Power Gate
// Connect to VCC of TDS driver board to cut power while reading pH (eliminates electrical ground loop)
#define PIN_TDS_VCC_GATE          23

// 🔥 Relay Channel 1: 220V/110V AC Aquarium Heater
#define PIN_RELAY_HEATER          18

// 🧪 Relay Channel 2: 12V DC Peristaltic pH Buffer Dosing Pump
#define PIN_RELAY_PUMP            19

// 🔘 Tactile Push Button: Long press (3s) to reset Wi-Fi provisioning credentials
#define PIN_BUTTON_RESET          12

// ==============================================================================
// ⚡ 3. RELAY LOGIC DEFINITIONS (Optocoupler-Isolated Modules)
// ==============================================================================
// Standard 5V relay modules with optocoupler isolation use Active LOW logic
#define RELAY_ACTIVE_ON           LOW
#define RELAY_SAFE_OFF            HIGH

// ==============================================================================
// 🌐 4. DEFAULT NETWORK & VPS CLOUD CONFIGURATION
// ==============================================================================
// In production, these can also be updated dynamically via NVS or Wi-Fi provisioning
#define DEFAULT_WIFI_SSID         "AquaGuard-IoT"
#define DEFAULT_WIFI_PASSWORD     "aquaguard2026"

// Your Cloud VPS Public IP or Domain (Port 8000 for AquaGuard Backend)
#define DEFAULT_SERVER_URL        "http://YOUR_VPS_IP:8000"

// Hardware Device Unique Identifier
#define DEFAULT_DEVICE_UID        "AG-ESP32-DEV01"

// MongoDB Tank ID to bind live sensor telemetry
#define DEFAULT_TANK_ID           "default_tank_5"

// ==============================================================================
// 🎯 5. DEFAULT TARGET WATER PARAMETERS
// ==============================================================================
#define DEFAULT_TARGET_TEMP_C     28.0f   // Target temperature in °C
#define DEFAULT_TARGET_PH         6.80f   // Target pH level
#define DEFAULT_TARGET_TDS_PPM    150     // Target Total Dissolved Solids in ppm

// ==============================================================================
// 🧪 6. SENSOR CALIBRATION CONSTANTS
// ==============================================================================
// pH-4502C Calibration:
// Voltage at neutral buffer (pH 7.00) after the 10k/10k voltage divider (typically ~1.25V at pin, 2.50V probe)
#define PH_CALIBRATION_NEUTRAL_V  2.50f
#define PH_CALIBRATION_SLOPE      3.50f

// TDS Calibration:
// Standard temperature coefficient: 2% per °C deviation from 25.0°C baseline
#define TDS_TEMP_COEFFICIENT      0.02f

// ==============================================================================
// ⏱️ 7. TIMING & SAFETY THRESHOLDS
// ==============================================================================
#define SENSOR_SAMPLE_INTERVAL_MS 1000    // 1 Hz temporal sampling rate (1-second rate-of-change)
#define MIN_DOSE_INTERVAL_MS      60000   // 60-second cooldown between pH chemical doses
#define DOSE_PULSE_DURATION_MS    500     // 500ms dosing pump active pulse (~0.5 ml buffer)
#define THERMAL_RUNAWAY_MAX_TEMP  31.5f   // Emergency ceiling temperature cutoff (°C)
#define THERMAL_RUNAWAY_SLOPE     0.10f   // Rate (°C/min) climbing while heater commanded OFF

// ==============================================================================
// 🖥️ 8. HARDWARE DISPLAY CONFIGURATION (I2C OLED SSD1306 / SH1106)
// ==============================================================================
// Set to true to enable physical 0.96" or 1.3" I2C 128x64 OLED display.
// When enabled, renders live TDS, pH, Temp, Actuator states, and Gatekeeper health.
// If display is missing or fails init, firmware gracefully falls back to Serial dashboard.
#define USE_OLED_DISPLAY          true
#define SCREEN_WIDTH              128
#define SCREEN_HEIGHT             64
#define OLED_RESET                -1      // Reset pin # (or -1 if sharing ESP32 reset)
#define OLED_I2C_ADDRESS          0x3C    // Default I2C address for SSD1306 (0x3C or 0x3D)
#define PIN_OLED_SDA              21      // Standard ESP32 I2C Data pin (SDA)
#define PIN_OLED_SCL              22      // Standard ESP32 I2C Clock pin (SCL)

#endif // AQUAGUARD_CONFIG_H
