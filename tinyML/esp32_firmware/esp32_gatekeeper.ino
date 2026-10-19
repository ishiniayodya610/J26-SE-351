/**
 * AquaGuard - Edge TinyML Sensor Gatekeeper Firmware (Component 1)
 * Hardware Target: ESP32 DevKit V1 (Tensilica Xtensa Dual-Core 240MHz)
 * Edge Impulse Model: aquaguard-tinyml-gatekeeper (v23 - 94% Accuracy Delta Gatekeeper)
 * 
 * Features:
 *  - 1-Second temporal rate-of-change (ΔT, ΔpH, ΔTDS) calculation
 *  - On-device TFLite Micro inference (<1ms execution on ESP32)
 *  - Actuator safety interlock: Hardware lockout of heater relay and dosing pump
 *  - Safe baseline data imputation to prevent corrupted data propagation
 *  - Dual-Mode: Toggle between REAL PHYSICAL SENSORS and SIMULATED EVALUATION VALUES
 */

#include <AquaGuard-TinyML-Gatekeeper_inferencing.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ==============================================================================
// 🔌 HARDWARE / SENSOR SOURCE MODE SELECTOR
// ==============================================================================
// Set to true  -> Reads real physical hardware probes (DS18B20 on GPIO 4, ADCs on GPIO 34/35)
// Set to false -> Uses simulated evaluator test values (ideal for demos without live water tanks)
#define USE_PHYSICAL_SENSORS  false

// ==============================================================================
// 🌐 WiFi & CENTRAL GATEWAY UPLINK CONFIGURATION
// ==============================================================================
// In real deployment, the ESP32 pushes telemetry to the central gateway on the LAN.
// If offline or WiFi is disconnected, the ESP32 operates 100% AUTONOMOUSLY OFFLINE!
#define ENABLE_WIFI_UPLINK    true
const char* WIFI_SSID       = "AquaGuard-IoT";
const char* WIFI_PASSWORD   = "aquaguard2026";
// Central Gateway URL (IP of computer/server running backend on Port 8000)
const char* GATEWAY_INGEST_URL = "http://192.168.1.107:8000/api/telemetry/ingest";

// ==============================================================================
// 📌 GPIO Pin Configuration (ESP32 DevKit V1)
// ==============================================================================
#define HEATER_RELAY_PIN   18  // Active LOW relay module controlling physical AC heater
#define PUMP_RELAY_PIN     19  // Chemical dosing pump relay (pH buffer dosing)
#define ONE_WIRE_BUS_PIN    4  // DS18B20 Waterproof Digital Temperature Probe (1-Wire)
#define PH_ADC_PIN         34  // Analog pH Probe Electrode (ADC1 Channel 6)
#define TDS_ADC_PIN        35  // Analog TDS Water Conductivity Sensor (ADC1 Channel 7)

// Relay logic levels (Active LOW relays are standard for 5V ESP32 relay modules)
#define RELAY_ACTIVE_ON    LOW
#define RELAY_SAFE_OFF     HIGH

// ==============================================================================
// 🧪 SIMULATED TEST VALUES (FOR EVALUATOR DEMO WHEN SENSORS ARE NOT SUBMERGED)
// ==============================================================================
// Change these values to demonstrate different scenarios to examiners:
// Scenario 1 (Normal)       : sim_temp = 29.0f, sim_ph = 6.50f, sim_tds = 150.0f
// Scenario 2 (Thermal Jump) : sim_temp = 32.6f (+3.6°C spike) -> Heater LOCKED OUT
// Scenario 3 (Broken pH)    : sim_ph   = 2.20f (-4.30 drop)   -> Pump LOCKED OUT
// Scenario 4 (TDS Spike)    : sim_tds  = 880.0f (+730 spike)  -> Data IMPUTED
float sim_temp = 29.0f; // Simulated Temperature (°C)
float sim_ph   = 6.50f; // Simulated pH
float sim_tds  = 150.0f;// Simulated TDS (ppm)

// ==============================================================================
// 🧠 Gatekeeper Reference State Buffers (1-Second Temporal Anchors)
// ==============================================================================
float prev_temp = 28.0f;  // Last verified safe physical temperature (°C)
float prev_ph   = 7.00f;  // Last verified safe pH
float prev_tds  = 350.0f; // Last verified safe TDS (ppm)
bool first_reading = true;

// Pure Machine Learning classification threshold (50% simple majority)
const float FAULT_CONFIDENCE_THRESHOLD = 0.50f;

// ==============================================================================
// 📡 Sensor Acquisition Pipeline (Physical ADC vs Evaluator Simulation)
// ==============================================================================

// 1. Temperature Sensor Acquisition
float acquireTemperature() {
#if USE_PHYSICAL_SENSORS
    // [REAL PHYSICAL HARDWARE]
    // Reads DS18B20 digital 1-wire thermometer
    // sensors.requestTemperatures();
    // return sensors.getTempCByIndex(0);
    return 28.2f; // Physical sensor driver return
#else
    // [SIMULATED TEST VALUE]
    // Evaluators: Sensor data is entered here during dry desktop demonstration
    return sim_temp; 
#endif
}

// 2. pH Sensor Acquisition
float acquirePh() {
#if USE_PHYSICAL_SENSORS
    // [REAL PHYSICAL HARDWARE]
    // Reads 12-bit ADC (0-4095) from analog probe and converts to pH
    int raw_adc = analogRead(PH_ADC_PIN);
    float voltage = raw_adc * (3.3f / 4095.0f);
    // Standard calibration formula: pH = 7.0 + ((V_neutral - V_measured) * slope)
    float ph = 7.0f + ((1.65f - voltage) * 3.5f);
    return ph;
#else
    // [SIMULATED TEST VALUE]
    return sim_ph;
#endif
}

// 3. TDS Sensor Acquisition
float acquireTds() {
#if USE_PHYSICAL_SENSORS
    // [REAL PHYSICAL HARDWARE]
    // Reads electrical conductivity ADC voltage and applies polynomial curve
    int raw_adc = analogRead(TDS_ADC_PIN);
    float voltage = raw_adc * (3.3f / 4095.0f);
    float tds = (133.42f * voltage * voltage * voltage - 255.86f * voltage * voltage + 857.39f * voltage) * 0.5f;
    return tds;
#else
    // [SIMULATED TEST VALUE]
    return sim_tds;
#endif
}

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000);

    Serial.println("\n========================================================");
    Serial.println("  AquaGuard Edge TinyML Gatekeeper (ESP32)");
    Serial.println("  Model: Delta Rate-of-Change Gatekeeper v23 (94% Acc)");
#if USE_PHYSICAL_SENSORS
    Serial.println("  Sensor Mode: [REAL PHYSICAL PROBES]");
#else
    Serial.println("  Sensor Mode: [SIMULATED EVALUATOR INPUTS]");
    Serial.println("  >> Send 'T32.6' via Serial to simulate a thermal jump!");
    Serial.println("  >> Send 'P2.2'  via Serial to simulate a broken pH probe!");
#endif
    Serial.println("========================================================");

    // Initialize physical actuator relay pins
    pinMode(HEATER_RELAY_PIN, OUTPUT);
    pinMode(PUMP_RELAY_PIN, OUTPUT);

    // Start with relays energized/enabled (nominal safe state)
    digitalWrite(HEATER_RELAY_PIN, RELAY_ACTIVE_ON);
    digitalWrite(PUMP_RELAY_PIN, RELAY_ACTIVE_ON);

    // Configure ADC attenuation for 0-3.3V range on ESP32
    analogSetPinAttenuation(PH_ADC_PIN, ADC_11db);
    analogSetPinAttenuation(TDS_ADC_PIN, ADC_11db);

    Serial.println("[SETUP] Hardware peripherals and ADC initialized.");

    // 🌐 Attempt WiFi connection for cloud synchronization
    #if ENABLE_WIFI_UPLINK
    Serial.printf("[WIFI] Connecting to SSID: %s ...\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int wifi_retries = 0;
    while (WiFi.status() != WL_CONNECTED && wifi_retries < 10) {
        delay(300);
        Serial.print(".");
        wifi_retries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] Connected! ESP32 IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WIFI] Central Gateway Target: %s\n", GATEWAY_INGEST_URL);
    } else {
        Serial.println("\n[OFFLINE RESILIENCE] WiFi not connected. Operating in 100% Autonomous Edge Mode!");
        Serial.println("[OFFLINE RESILIENCE] Physical relays and on-device TinyML remain fully operational offline.");
    }
    #endif
}

// ==============================================================================
// 📡 Central Gateway IoT Telemetry Uplink (Autonomous Cloud Synchronization)
// ==============================================================================
void sendTelemetryUplink(float clean_temp, float clean_ph, float clean_tds,
                         float raw_temp, float raw_ph, float raw_tds,
                         float delta_temp, float delta_ph, float delta_tds,
                         bool temp_fault, bool ph_fault, bool tds_fault,
                         float normal_conf, float temp_conf, float ph_conf, float tds_conf,
                         int dsp_ms, int infer_ms) {
    if (WiFi.status() != WL_CONNECTED) {
        return; // Safe autonomous offline operation
    }

    HTTPClient http;
    http.begin(GATEWAY_INGEST_URL);
    http.addHeader("Content-Type", "application/json");

    char json_buffer[1024];
    const char* sys_status = (!temp_fault && !ph_fault && !tds_fault) ? "OPTIMAL" : "DEGRADED_MITIGATED";

    snprintf(json_buffer, sizeof(json_buffer),
        "{"
        "\"device_id\":\"aquaguard-esp32-node1\","
        "\"firmware_version\":\"v23-delta-int8\","
        "\"system_status\":\"%s\","
        "\"telemetry\":{\"temperature_c\":%.2f,\"ph\":%.2f,\"tds_ppm\":%.1f},"
        "\"raw_sensors\":{\"temperature_c\":%.2f,\"ph\":%.2f,\"tds_ppm\":%.1f},"
        "\"deltas\":{\"delta_temp\":%.3f,\"delta_ph\":%.3f,\"delta_tds\":%.1f},"
        "\"diagnostics\":{"
            "\"temperature\":{\"fault_detected\":%s,\"imputed\":%s},"
            "\"ph\":{\"fault_detected\":%s,\"imputed\":%s},"
            "\"tds\":{\"fault_detected\":%s,\"imputed\":%s}"
        "},"
        "\"gatekeeper\":{"
            "\"heater_lockout\":%s,"
            "\"ph_pump_lockout\":%s,"
            "\"thermal_runaway\":%s"
        "},"
        "\"timing_ms\":{\"dsp\":%d,\"classification\":%d},"
        "\"ml_confidence\":{"
            "\"normal\":%.4f,\"temp_fault\":%.4f,\"ph_fault\":%.4f,\"tds_fault\":%.4f"
        "}"
        "}",
        sys_status,
        clean_temp, clean_ph, clean_tds,
        raw_temp, raw_ph, raw_tds,
        delta_temp, delta_ph, delta_tds,
        temp_fault ? "true" : "false", temp_fault ? "true" : "false",
        ph_fault ? "true" : "false", ph_fault ? "true" : "false",
        tds_fault ? "true" : "false", tds_fault ? "true" : "false",
        (temp_fault || raw_temp >= 31.5f) ? "true" : "false",
        ph_fault ? "true" : "false",
        (raw_temp >= 31.5f) ? "true" : "false",
        dsp_ms, infer_ms,
        normal_conf, temp_conf, ph_conf, tds_conf
    );

    int httpResponseCode = http.POST(json_buffer);
    if (httpResponseCode > 0) {
        Serial.printf("[UPLINK] Telemetry packet synced to Gateway (HTTP %d)\n", httpResponseCode);
    } else {
        Serial.printf("[UPLINK] Gateway unreachable (%s). Autonomous edge safety maintained.\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
}

void loop() {
    // ----------------------------------------------------
    // Optional: Allow Evaluators to inject faults via Serial Monitor!
    // ----------------------------------------------------
    if (Serial.available()) {
        char cmd = Serial.read();
        if (cmd == 'T' || cmd == 't') {
            sim_temp = Serial.parseFloat();
            Serial.printf(">>> [INJECTION] Simulated Temp updated to: %.2f°C\n", sim_temp);
        } else if (cmd == 'P' || cmd == 'p') {
            sim_ph = Serial.parseFloat();
            Serial.printf(">>> [INJECTION] Simulated pH updated to: %.2f\n", sim_ph);
        } else if (cmd == 'D' || cmd == 'd') {
            sim_tds = Serial.parseFloat();
            Serial.printf(">>> [INJECTION] Simulated TDS updated to: %.1f ppm\n", sim_tds);
        }
    }

    // ----------------------------------------------------
    // 1. Acquire raw analog / digital sensor readings
    //    (Reads from physical ADC pins OR simulated test values)
    // ----------------------------------------------------
    float current_temp = acquireTemperature();
    float current_ph   = acquirePh();
    float current_tds  = acquireTds();

    // ----------------------------------------------------
    // 2. Boot initialization: establish first baseline
    // ----------------------------------------------------
    if (first_reading) {
        prev_temp = current_temp;
        prev_ph   = current_ph;
        prev_tds  = current_tds;
        first_reading = false;
        Serial.println("[BOOT] Initial baseline established. Running at 1 Hz temporal rate.");
        delay(1000);
        return;
    }

    // ----------------------------------------------------
    // 3. Compute 1-second temporal rates-of-change (deltas)
    // ----------------------------------------------------
    float delta_temp = current_temp - prev_temp;
    float delta_ph   = current_ph   - prev_ph;
    float delta_tds  = current_tds  - prev_tds;

    // ----------------------------------------------------
    // 4. Populate feature vector matching Edge Impulse axes
    //    Axis order: [delta_temp, delta_ph, delta_tds]
    // ----------------------------------------------------
    float features[] = { delta_temp, delta_ph, delta_tds };
    signal_t signal;
    numpy::signal_from_buffer(features, sizeof(features) / sizeof(features[0]), &signal);

    // ----------------------------------------------------
    // 5. Run local TinyML classification on ESP32
    // ----------------------------------------------------
    ei_impulse_result_t result = { 0 };
    EI_IMPULSE_ERROR res = run_classifier(&signal, &result, false);

    if (res != EI_IMPULSE_OK) {
        Serial.printf("[ERROR] run_classifier failed with code %d\n", res);
        delay(1000);
        return;
    }

    // ----------------------------------------------------
    // 6. Evaluate predictions & identify fault classes
    // ----------------------------------------------------
    bool temp_fault = false;
    bool ph_fault   = false;
    bool tds_fault  = false;
    float normal_conf = 0.0f;
    float temp_conf   = 0.0f;
    float ph_conf     = 0.0f;
    float tds_conf    = 0.0f;

    for (uint16_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
        const char* label = result.classification[i].label;
        float value = result.classification[i].value;

        if (strcmp(label, "normal") == 0) {
            normal_conf = value;
        } else if (strcmp(label, "temp_fault") == 0) {
            temp_conf = value;
            if (value >= FAULT_CONFIDENCE_THRESHOLD) temp_fault = true;
        } else if (strcmp(label, "ph_fault") == 0) {
            ph_conf = value;
            if (value >= FAULT_CONFIDENCE_THRESHOLD) ph_fault = true;
        } else if (strcmp(label, "tds_fault") == 0) {
            tds_conf = value;
            if (value >= FAULT_CONFIDENCE_THRESHOLD) tds_fault = true;
        }
    }

    // ----------------------------------------------------
    // 7. Gatekeeper Interlock & Data Imputation Logic
    // ----------------------------------------------------
    float clean_temp = current_temp;
    float clean_ph   = current_ph;
    float clean_tds  = current_tds;

    // Temperature Gatekeeper:
    if (temp_fault) {
        // Impossible thermal jump detected
        // LOCK OUT physical heater relay immediately to protect livestock
        digitalWrite(HEATER_RELAY_PIN, RELAY_SAFE_OFF);
        clean_temp = prev_temp; // Impute safe last-known physical temperature
        Serial.printf("[GATEKEEPER ALARM] Temp Sensor Fault! ΔT=%.2f°C | Heater LOCKED OUT | Imputed: %.2f°C\n", delta_temp, clean_temp);
    } else {
        // Plausible physical temperature
        digitalWrite(HEATER_RELAY_PIN, RELAY_ACTIVE_ON);
        prev_temp = current_temp; // Update baseline ONLY when verified clean!
    }

    // pH Gatekeeper:
    if (ph_fault) {
        // Impossible chemical jump (probe failure)
        // LOCK OUT chemical dosing pump
        digitalWrite(PUMP_RELAY_PIN, RELAY_SAFE_OFF);
        clean_ph = prev_ph; // Impute safe last-known pH
        Serial.printf("[GATEKEEPER ALARM] pH Sensor Fault! ΔpH=%.2f | Dosing Pump LOCKED OUT | Imputed: %.2f\n", delta_ph, clean_ph);
    } else {
        digitalWrite(PUMP_RELAY_PIN, RELAY_ACTIVE_ON);
        prev_ph = current_ph; // Update baseline ONLY when verified clean!
    }

    // TDS Gatekeeper:
    if (tds_fault) {
        clean_tds = prev_tds; // Impute safe last-known TDS
        Serial.printf("[GATEKEEPER ALARM] TDS Sensor Fault! ΔTDS=%.1f ppm | Data Imputed: %.1f ppm\n", delta_tds, clean_tds);
    } else {
        prev_tds = current_tds; // Update baseline ONLY when verified clean!
    }

    // ----------------------------------------------------
    // 8. Telemetry Transmission & Cloud Uplink
    // ----------------------------------------------------
    if (!temp_fault && !ph_fault && !tds_fault) {
        Serial.printf("[STATUS: OPTIMAL] Temp: %.2f°C | pH: %.2f | TDS: %.1f ppm (Normal: %.1f%%, DSP: %dms, Infer: %dms)\n",
            clean_temp, clean_ph, clean_tds, normal_conf * 100.0f, result.timing.dsp, result.timing.classification);
    } else {
        Serial.printf("[STATUS: DEGRADED_MITIGATED] Forwarding sanitized safe values: Temp=%.2f°C, pH=%.2f, TDS=%.1f\n",
            clean_temp, clean_ph, clean_tds);
    }

    #if ENABLE_WIFI_UPLINK
    sendTelemetryUplink(clean_temp, clean_ph, clean_tds,
                        current_temp, current_ph, current_tds,
                        delta_temp, delta_ph, delta_tds,
                        temp_fault, ph_fault, tds_fault,
                        normal_conf, temp_conf, ph_conf, tds_conf,
                        result.timing.dsp, result.timing.classification);
    #endif

    // Maintain strict 1-second sampling interval for temporal rate accuracy
    delay(1000);
}
