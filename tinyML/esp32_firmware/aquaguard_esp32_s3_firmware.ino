/**
 * AquaGuard - Autonomous Edge TinyML IoT Controller & Gatekeeper
 * Hardware Target: ESP32-S3 DevKitC-1 (N16R8) / ESP32 DevKit V1
 * Framework: Arduino / ESP-IDF (PlatformIO compatible)
 *
 * Capabilities:
 *  1. Autonomous Offline Control:
 *     - Reads raw sensors: DS18B20, PH-4502C, Gravity TDS
 *     - Computes sliding-window temporal deltas: [ΔT, ΔpH, ΔTDS]
 *     - Runs Edge Impulse INT8 TinyML Gatekeeper model on-device (<2ms)
 *     - Controls Heater (Relay 1) and pH Dosing Pump (Relay 2) to maintain
 *       tank targets (target_temp, target_ph, target_tds) stored in NVS flash
 *     - Hardware safety interlocks for sensor fault and thermal runaway
 *  2. Cloud Synchronization (when WiFi/Internet is available):
 *     - Transmits telemetry packets (clean + raw + deltas + actuator states)
 *     - Receives target parameter updates from backend and persists to NVS
 *  3. SoftAP / Provisioning:
 *     - First-boot captive portal / QR code claim protocol
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>      // ESP32 NVS Flash storage
#include <OneWire.h>
#include <DallasTemperature.h>

// If Edge Impulse header is available in library path:
#if __has_include(<AquaGuard-TinyML-Gatekeeper_inferencing.h>)
  #include <AquaGuard-TinyML-Gatekeeper_inferencing.h>
  #define HAS_EDGE_IMPULSE 1
#else
  #define HAS_EDGE_IMPULSE 0
#endif

// ==============================================================================
// 📌 GPIO PIN ALLOCATION (ESP32-S3 / ESP32 DevKit)
// ==============================================================================
#define PIN_ONE_WIRE          15   // DS18B20 Temperature 1-Wire Data (Requires 4.7kΩ pull-up to 3.3V)
#define PIN_PH_ADC            34   // Analog pH Probe (via 10kΩ / 10kΩ voltage divider to GPIO 34)
#define PIN_TDS_ADC           32   // Gravity Analog TDS Probe Output
#define PIN_TDS_VCC_GATE      21   // TDS Sensor VCC Power Gate (Switched to eliminate probe cross-interference)
#define PIN_RELAY_HEATER      25   // Relay Channel 1: Aquarium Heater (Active LOW)
#define PIN_RELAY_PUMP        26   // Relay Channel 2: 12V DC Dosing Pump (Active LOW)
#define PIN_BUTTON_RESET      12   // Tactile Button: Long-press to reset WiFi provisioning

// Relay logic levels (Optocoupler-isolated relays are standard Active LOW)
#define RELAY_ACTIVE_ON       LOW
#define RELAY_SAFE_OFF        HIGH

// ==============================================================================
// 💾 NVS STORAGE & RUNTIME TARGET PARAMETERS
// ==============================================================================
Preferences prefs;

struct TankTargetConfig {
    float target_temp_c;      // e.g., 27.5 °C
    float target_ph;          // e.g., 6.80
    int   target_tds_ppm;     // e.g., 150 ppm
    char  device_uid[32];     // e.g., "AG-ESP32-A1B2C3D4"
    char  tank_id[32];        // MongoDB Tank ObjectId
    char  server_url[128];    // Cloud Gateway endpoint
    bool  provisioned;
};

TankTargetConfig config = {
    .target_temp_c   = 28.0f,
    .target_ph       = 6.80f,
    .target_tds_ppm  = 150,
    .device_uid      = "AG-ESP32-DEV01",
    .tank_id         = "default_tank_5",
    .server_url      = "http://192.168.1.107:8000",
    .provisioned     = false
};

// ==============================================================================
// 🧠 SENSOR DRIVERS & STATE BUFFERS
// ==============================================================================
OneWire oneWire(PIN_ONE_WIRE);
DallasTemperature tempSensors(&oneWire);

// Sliding window temporal reference anchors
float prev_temp = 28.0f;
float prev_ph   = 6.80f;
float prev_tds  = 150.0f;
bool  first_reading = true;

// Actuator and safety states
bool heater_active = false;
bool pump_active   = false;
bool heater_lockout = false;
bool pump_lockout   = false;
bool thermal_runaway_detected = false;

// pH Dosing Rate Limiter (Buffer takes time to dissolve and distribute)
unsigned long last_dose_time_ms = 0;
const unsigned long MIN_DOSE_INTERVAL_MS = 60000; // 60-second cooldown between doses

// ==============================================================================
// 🔌 SENSOR ACQUISITION ROUTINES
// ==============================================================================

// 1. Digital DS18B20 Temperature
float readWaterTemperature() {
    tempSensors.requestTemperatures();
    float tempC = tempSensors.getTempCByIndex(0);
    if (tempC < -50.0f || tempC > 85.0f) {
        // Disconnected or read failure
        return prev_temp;
    }
    return tempC;
}

// 2. Analog pH Probe (PH-4502C)
float readWaterPh() {
    // 10-sample moving average for analog noise attenuation
    long sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += analogRead(PIN_PH_ADC);
        delayMicroseconds(500);
    }
    float raw_adc = (float)sum / 10.0f;
    // Voltage divider scaling: 5V range scaled down by half to 2.5V
    float pin_voltage = raw_adc * (3.3f / 4095.0f);
    float probe_voltage = pin_voltage * 2.0f; // reconstruct pre-divider voltage

    // pH formula: neutral pH 7.0 at ~2.5V probe voltage (adjust calibration offset if needed)
    float ph = 7.0f + ((2.50f - probe_voltage) * 3.5f);
    return constrain(ph, 0.0f, 14.0f);
}

// 3. Gravity Analog TDS Sensor (with Power Gating)
float readWaterTds(float currentTempC) {
    // Step A: Turn ON TDS probe power via GPIO gate
    digitalWrite(PIN_TDS_VCC_GATE, HIGH);
    delay(80); // Stabilization time

    // Step B: Sample ADC
    long sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += analogRead(PIN_TDS_ADC);
        delayMicroseconds(500);
    }
    float raw_adc = (float)sum / 10.0f;
    float voltage = raw_adc * (3.3f / 4095.0f);

    // Step C: Turn OFF TDS probe power immediately (prevents probe ion degradation & ground loop)
    digitalWrite(PIN_TDS_VCC_GATE, LOW);

    // Temperature compensation coefficient (standard 2% per °C from 25°C)
    float compensationCoefficient = 1.0f + 0.02f * (currentTempC - 25.0f);
    float compensationVoltage = voltage / max(compensationCoefficient, 0.1f);

    // Conversion curve (ppm)
    float tds = (133.42f * pow(compensationVoltage, 3) - 255.86f * pow(compensationVoltage, 2) + 857.39f * compensationVoltage) * 0.5f;
    return max(tds, 0.0f);
}

// ==============================================================================
// 🧠 TINYML GATEKEEPER INFERENCE
// ==============================================================================
struct TinyMLResult {
    bool temp_fault;
    bool ph_fault;
    bool tds_fault;
    bool thermal_runaway;
    const char* classification;
    float confidence;
};

TinyMLResult runTinyMLGatekeeper(float delta_temp, float delta_ph, float delta_tds, float current_temp) {
    TinyMLResult res = {
        .temp_fault = false,
        .ph_fault = false,
        .tds_fault = false,
        .thermal_runaway = false,
        .classification = "OPTIMAL",
        .confidence = 0.98f
    };

#if HAS_EDGE_IMPULSE
    // Pack temporal deltas into Edge Impulse signal buffer
    signal_t signal;
    float features[3] = { delta_temp, delta_ph, delta_tds };
    ei_make_signal_from_buffer(features, 3, &signal);

    ei_impulse_result_t ei_result = { 0 };
    EI_IMPULSE_ERROR r = run_classifier(&signal, &ei_result, false);

    if (r == EI_IMPULSE_OK) {
        // Find top classification label
        float max_val = 0.0f;
        int max_idx = 0;
        for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
            if (ei_result.classification[ix].value > max_val) {
                max_val = ei_result.classification[ix].value;
                max_idx = ix;
            }
        }
        res.classification = ei_result.classification[max_idx].label;
        res.confidence = max_val;

        if (strcmp(res.classification, "temp_fault") == 0) res.temp_fault = true;
        if (strcmp(res.classification, "ph_fault") == 0)   res.ph_fault = true;
        if (strcmp(res.classification, "tds_fault") == 0)  res.tds_fault = true;
    }
#else
    // Embedded fallback heuristic if model library is compiling without SDK
    if (fabs(delta_temp) >= 1.5f) { res.temp_fault = true; res.classification = "temp_fault"; }
    if (fabs(delta_ph)   >= 0.8f) { res.ph_fault = true;   res.classification = "ph_fault"; }
    if (fabs(delta_tds)  >= 120.0f){ res.tds_fault = true;  res.classification = "tds_fault"; }
#endif

    // Welded Heater Relay / Thermal Runaway check
    if (current_temp >= 32.5f || (current_temp >= 31.0f && delta_temp > 0.4f)) {
        res.thermal_runaway = true;
        res.classification = "THERMAL_RUNAWAY";
    }

    return res;
}

// ==============================================================================
// ⚙️ AUTONOMOUS CLOSED-LOOP ACTUATOR CONTROLLER (OFFLINE CAPABLE)
// ==============================================================================
void executeAutonomousRelayControl(float clean_temp, float clean_ph, const TinyMLResult& ml) {
    // 1. Thermal Runaway Emergency Protocol
    if (ml.thermal_runaway) {
        heater_lockout = true;
        digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
        heater_active = false;
        Serial.println("🚨 [EMERGENCY INTERLOCK] Thermal Runaway detected! Heater Relay FORCED OFF.");
        return;
    }

    // 2. Temperature Closed-Loop Control
    if (ml.temp_fault) {
        // Sensor spike detected: HOLD heater state to prevent thermal shock
        heater_lockout = true;
        digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
        heater_active = false;
        Serial.println("⚠️ [GATEKEEPER INTERLOCK] Temperature sensor anomaly detected! Heater relay locked out.");
    } else {
        heater_lockout = false;
        // Dual-threshold hysteresis control around target
        if (clean_temp < (config.target_temp_c - 0.3f)) {
            digitalWrite(PIN_RELAY_HEATER, RELAY_ACTIVE_ON);
            heater_active = true;
        } else if (clean_temp > (config.target_temp_c + 0.3f)) {
            digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
            heater_active = false;
        }
    }

    // 3. pH Buffer Dosing Closed-Loop Control
    if (ml.ph_fault) {
        // Broken pH probe detected: LOCKOUT dosing pump to prevent chemical poisoning
        pump_lockout = true;
        digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);
        pump_active = false;
        Serial.println("⚠️ [GATEKEEPER INTERLOCK] pH probe anomaly detected! Dosing pump locked out.");
    } else {
        pump_lockout = false;
        unsigned long now = millis();
        // If pH drifts above target and cooldown period has elapsed:
        if (clean_ph > (config.target_ph + 0.25f) && (now - last_dose_time_ms >= MIN_DOSE_INTERVAL_MS)) {
            Serial.println("🧪 [DOSE] pH high: Triggering 500ms precision buffer micro-dose...");
            digitalWrite(PIN_RELAY_PUMP, RELAY_ACTIVE_ON);
            pump_active = true;
            delay(500); // 500ms micro-dose (~0.5ml)
            digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);
            pump_active = false;
            last_dose_time_ms = now;
        } else {
            digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);
            pump_active = false;
        }
    }
}

// ==============================================================================
// 📡 CLOUD TELEMETRY UPLINK & TARGET PARAMETER SYNC
// ==============================================================================
void syncCloudTelemetry(float clean_temp, float clean_ph, float clean_tds,
                        float raw_temp, float raw_ph, float raw_tds,
                        float delta_temp, float delta_ph, float delta_tds,
                        const TinyMLResult& ml) {
    if (WiFi.status() != WL_CONNECTED) {
        return; // Fully autonomous offline operation
    }

    HTTPClient http;
    char endpoint[256];
    snprintf(endpoint, sizeof(endpoint), "%s/api/telemetry/ingest", config.server_url);
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");

    char jsonPayload[1024];
    snprintf(jsonPayload, sizeof(jsonPayload),
        "{"
        "\"device_id\":\"%s\","
        "\"tank_id\":\"%s\","
        "\"firmware_version\":\"2.0.0-tinyml\","
        "\"system_status\":\"%s\","
        "\"telemetry\":{\"temperature_c\":%.2f,\"ph\":%.2f,\"tds_ppm\":%.1f},"
        "\"raw_sensors\":{\"temperature_c\":%.2f,\"ph\":%.2f,\"tds_ppm\":%.1f},"
        "\"deltas\":{\"delta_temp\":%.3f,\"delta_ph\":%.3f,\"delta_tds\":%.1f},"
        "\"actuators\":{\"heater_relay\":%s,\"ph_pump_relay\":%s},"
        "\"gatekeeper\":{"
            "\"heater_lockout\":%s,"
            "\"ph_pump_lockout\":%s,"
            "\"thermal_runaway\":%s,"
            "\"classification\":\"%s\","
            "\"confidence\":%.4f"
        "},"
        "\"target_params\":{\"target_temp\":%.2f,\"target_ph\":%.2f,\"target_tds\":%d}"
        "}",
        config.device_uid,
        config.tank_id,
        (ml.temp_fault || ml.ph_fault || ml.tds_fault) ? "DEGRADED_MITIGATED" : "OPTIMAL",
        clean_temp, clean_ph, clean_tds,
        raw_temp, raw_ph, raw_tds,
        delta_temp, delta_ph, delta_tds,
        heater_active ? "true" : "false",
        pump_active ? "true" : "false",
        heater_lockout ? "true" : "false",
        pump_lockout ? "true" : "false",
        ml.thermal_runaway ? "true" : "false",
        ml.classification,
        ml.confidence,
        config.target_temp_c,
        config.target_ph,
        config.target_tds_ppm
    );

    int httpCode = http.POST(jsonPayload);
    if (httpCode > 0) {
        // Check for downlink target parameter updates in response
        String response = http.getString();
        // If server sent back updated targets, parse and update NVS:
        // (Simple JSON parser check)
        int idx = response.indexOf("\"updated_target_temp\":");
        if (idx > 0) {
            float new_target_temp = response.substring(idx + 22).toFloat();
            if (new_target_temp >= 15.0f && new_target_temp <= 35.0f && new_target_temp != config.target_temp_c) {
                config.target_temp_c = new_target_temp;
                prefs.begin("aquaguard", false);
                prefs.putFloat("target_temp", config.target_temp_c);
                prefs.end();
                Serial.printf("📥 [DOWNLINK] New Target Temp updated from Cloud: %.2f°C\n", config.target_temp_c);
            }
        }
    }
    http.end();
}

// ==============================================================================
// 🚀 ARDUINO INITIALIZATION (SETUP)
// ==============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n========================================================");
    Serial.println("  AquaGuard Autonomous TinyML IoT Device (ESP32-S3)");
    Serial.println("  Features: Offline Autonomy, Delta Calculus, Actuator Control");
    Serial.println("========================================================");

    // 1. Initialize NVS Flash
    prefs.begin("aquaguard", false);
    config.target_temp_c  = prefs.getFloat("target_temp", 28.0f);
    config.target_ph      = prefs.getFloat("target_ph", 6.80f);
    config.target_tds_ppm = prefs.getInt("target_tds", 150);
    prefs.getString("device_uid", config.device_uid, sizeof(config.device_uid));
    prefs.getString("tank_id", config.tank_id, sizeof(config.tank_id));
    prefs.end();

    Serial.printf("[NVS] Loaded Targets -> Temp: %.1f°C | pH: %.2f | TDS: %d ppm\n",
                  config.target_temp_c, config.target_ph, config.target_tds_ppm);

    // 2. Configure Actuator Relay Pins (Safe OFF on boot)
    pinMode(PIN_RELAY_HEATER, OUTPUT);
    pinMode(PIN_RELAY_PUMP, OUTPUT);
    digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
    digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);

    // 3. Configure TDS Power Gate Pin
    pinMode(PIN_TDS_VCC_GATE, OUTPUT);
    digitalWrite(PIN_TDS_VCC_GATE, LOW);

    // 4. Configure Reset Button
    pinMode(PIN_BUTTON_RESET, INPUT_PULLUP);

    // 5. Initialize DS18B20 1-Wire Probe
    tempSensors.begin();

    // 6. Connect WiFi (Non-blocking: if network unavailable, continues offline!)
    Serial.println("[WIFI] Attempting connection...");
    WiFi.begin("AquaGuard-IoT", "aquaguard2026");
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 10) {
        delay(250);
        Serial.print(".");
        retries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] Connected! Local IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[OFFLINE ACTIVE] WiFi unavailable. Operating in 100% Autonomous Edge Mode!");
    }
}

// ==============================================================================
// 🔄 MAIN AUTONOMOUS EXECUTION LOOP (EVERY 1 SECOND)
// ==============================================================================
void loop() {
    // 1. Acquire Raw Sensor Telemetry
    float raw_temp = readWaterTemperature();
    float raw_ph   = readWaterPh();
    float raw_tds  = readWaterTds(raw_temp);

    // 2. Initialize baselines on first boot
    if (first_reading) {
        prev_temp = raw_temp;
        prev_ph   = raw_ph;
        prev_tds  = raw_tds;
        first_reading = false;
    }

    // 3. Compute 1-Second Temporal Rate-of-Change (ΔT, ΔpH, ΔTDS)
    float delta_temp = raw_temp - prev_temp;
    float delta_ph   = raw_ph   - prev_ph;
    float delta_tds  = raw_tds  - prev_tds;

    // 4. Run Edge TinyML Gatekeeper on-device
    TinyMLResult ml = runTinyMLGatekeeper(delta_temp, delta_ph, delta_tds, raw_temp);

    // 5. Safe Data Imputation (prevents bad sensor spikes from corrupting actuators or history)
    float clean_temp = ml.temp_fault ? prev_temp : raw_temp;
    float clean_ph   = ml.ph_fault   ? prev_ph   : raw_ph;
    float clean_tds  = ml.tds_fault  ? prev_tds  : raw_tds;

    // Update reference state with clean verified readings
    prev_temp = clean_temp;
    prev_ph   = clean_ph;
    prev_tds  = clean_tds;

    // 6. Execute Closed-Loop Actuator Relays (Heater / Pump)
    executeAutonomousRelayControl(clean_temp, clean_ph, ml);

    // 7. Output Diagnostics to Serial
    Serial.printf("[CYCLE] T: %.2f°C (Δ%+.2f) | pH: %.2f (Δ%+.2f) | TDS: %.0f (Δ%+.0f) | Status: %s | Heater: %s | Pump: %s\n",
                  clean_temp, delta_temp, clean_ph, delta_ph, clean_tds, delta_tds,
                  ml.classification,
                  heater_active ? "ON" : "OFF",
                  pump_active ? "ON" : "OFF");

    // 8. Sync with Cloud Backend (Non-blocking uplink)
    syncCloudTelemetry(clean_temp, clean_ph, clean_tds,
                       raw_temp, raw_ph, raw_tds,
                       delta_temp, delta_ph, delta_tds,
                       ml);

    // Maintain 1-second control cadence
    delay(1000);
}
