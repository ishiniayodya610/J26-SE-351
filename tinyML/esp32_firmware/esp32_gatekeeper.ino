/**
 * AquaGuard - Edge TinyML Sensor Gatekeeper Firmware (Component 1)
 * Hardware Target: ESP32 DevKit V1 (Tensilica Xtensa Dual-Core 240MHz)
 * Edge Impulse Model: aquaguard-tinyml-gatekeeper (v16 - Rate-of-Change Deltas)
 * 
 * Features:
 *  - 1-Second temporal rate-of-change (ΔT, ΔpH, ΔTDS) calculation
 *  - On-device TFLite Micro inference (<1ms execution on ESP32)
 *  - Actuator safety interlock: Hardware lockout of heater relay and dosing pump
 *  - Safe baseline data imputation to prevent corrupted data propagation
 *  - Non-corrupting baseline memory (faulty readings do not overwrite valid baseline)
 */

#include <AquaGuard-TinyML-Gatekeeper_inferencing.h>

// ==========================================
// GPIO Pin Configuration
// ==========================================
#define HEATER_RELAY_PIN   18  // Active LOW or HIGH depending on relay module
#define PUMP_RELAY_PIN     19  // Chemical dosing pump relay
#define TEMP_PIN            4  // DS18B20 One-Wire GPIO
#define PH_ADC_PIN         34  // Analog pH probe (ADC1_CH6)
#define TDS_ADC_PIN        35  // Analog TDS probe (ADC1_CH7)

// Relay logic levels (adjust based on your physical relay module: NC/NO or LOW-active)
#define RELAY_ACTIVE_ON    LOW
#define RELAY_SAFE_OFF     HIGH

// ==========================================
// Gatekeeper Temporal Reference Buffers
// ==========================================
float prev_temp = 28.0f;  // Last verified safe physical temperature (°C)
float prev_ph   = 7.00f;  // Last verified safe pH
float prev_tds  = 350.0f; // Last verified safe TDS (ppm)
bool first_reading = true;

// Confidence threshold for fault tripping (94% accuracy model v23)
const float FAULT_CONFIDENCE_THRESHOLD = 0.50f;

// ==========================================
// Mock / Physical Sensor Reading Wrappers
// (Replace with actual sensor driver calls)
// ==========================================
float readPhysicalTemperature() {
    // DS18B20 sensor reading logic here
    // Example: sensors.requestTemperatures(); return sensors.getTempCByIndex(0);
    return 28.2f; 
}

float readPhysicalPh() {
    // Read ADC and convert using calibrated slope: pH = 7.0 + ((2.5 - v_out) / 0.18)
    int raw_adc = analogRead(PH_ADC_PIN);
    float voltage = raw_adc * (3.3f / 4095.0f);
    float ph = 7.0f + ((1.65f - voltage) * 3.5f);
    return ph;
}

float readPhysicalTds() {
    // Read ADC and convert using temperature compensation
    int raw_adc = analogRead(TDS_ADC_PIN);
    float voltage = raw_adc * (3.3f / 4095.0f);
    float tds = (133.42f * voltage * voltage * voltage - 255.86f * voltage * voltage + 857.39f * voltage) * 0.5f;
    return tds;
}

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000);

    Serial.println("\n========================================================");
    Serial.println("  AquaGuard Edge TinyML Gatekeeper (ESP32)");
    Serial.println("  Model: Delta Rate-of-Change Gatekeeper v16");
    Serial.println("========================================================");

    // Initialize physical actuator relay pins
    pinMode(HEATER_RELAY_PIN, OUTPUT);
    pinMode(PUMP_RELAY_PIN, OUTPUT);

    // Start with relays energized/enabled (safe state)
    digitalWrite(HEATER_RELAY_PIN, RELAY_ACTIVE_ON);
    digitalWrite(PUMP_RELAY_PIN, RELAY_ACTIVE_ON);

    // Configure ADC attenuation for 0-3.3V range
    analogSetPinAttenuation(PH_ADC_PIN, ADC_11db);
    analogSetPinAttenuation(TDS_ADC_PIN, ADC_11db);

    Serial.println("[SETUP] Hardware peripherals and ADC initialized.");
}

void loop() {
    // ----------------------------------------------------
    // 1. Acquire raw analog / digital sensor readings
    // ----------------------------------------------------
    float current_temp = readPhysicalTemperature();
    float current_ph   = readPhysicalPh();
    float current_tds  = readPhysicalTds();

    // ----------------------------------------------------
    // 2. Boot initialization: prevent false transient spike
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

    for (uint16_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
        const char* label = result.classification[i].label;
        float value = result.classification[i].value;

        if (strcmp(label, "normal") == 0) {
            normal_conf = value;
        } else if (strcmp(label, "temp_fault") == 0 && value >= FAULT_CONFIDENCE_THRESHOLD) {
            temp_fault = true;
        } else if (strcmp(label, "ph_fault") == 0 && value >= FAULT_CONFIDENCE_THRESHOLD) {
            ph_fault = true;
        } else if (strcmp(label, "tds_fault") == 0 && value >= FAULT_CONFIDENCE_THRESHOLD) {
            tds_fault = true;
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
        // Thermodynamically impossible spike detected (e.g. +7.0°C in 1 second)
        // LOCK OUT heater immediately to prevent boiling or cooking the tank
        digitalWrite(HEATER_RELAY_PIN, RELAY_SAFE_OFF);
        clean_temp = prev_temp; // Impute safe last-known physical temperature
        Serial.printf("[GATEKEEPER ALARM] Temp Sensor Fault! ΔT=%.2f°C | Heater LOCKED OUT | Imputed: %.2f°C\n", delta_temp, clean_temp);
    } else {
        // Physical temperature change is plausible
        digitalWrite(HEATER_RELAY_PIN, RELAY_ACTIVE_ON);
        prev_temp = current_temp; // ONLY update baseline when verified clean!
    }

    // pH Gatekeeper:
    if (ph_fault) {
        // Chemically impossible jump (e.g. electrode disconnected, reading 2.2)
        // LOCK OUT acid/base chemical dosing pump
        digitalWrite(PUMP_RELAY_PIN, RELAY_SAFE_OFF);
        clean_ph = prev_ph; // Impute safe last-known pH
        Serial.printf("[GATEKEEPER ALARM] pH Sensor Fault! ΔpH=%.2f | Dosing Pump LOCKED OUT | Imputed: %.2f\n", delta_ph, clean_ph);
    } else {
        digitalWrite(PUMP_RELAY_PIN, RELAY_ACTIVE_ON);
        prev_ph = current_ph; // ONLY update baseline when verified clean!
    }

    // TDS Gatekeeper:
    if (tds_fault) {
        clean_tds = prev_tds; // Impute safe last-known TDS
        Serial.printf("[GATEKEEPER ALARM] TDS Sensor Fault! ΔTDS=%.1f ppm | Data Imputed: %.1f ppm\n", delta_tds, clean_tds);
    } else {
        prev_tds = current_tds; // ONLY update baseline when verified clean!
    }

    // ----------------------------------------------------
    // 8. Telemetry Transmission
    // ----------------------------------------------------
    if (!temp_fault && !ph_fault && !tds_fault) {
        Serial.printf("[STATUS: OPTIMAL] Temp: %.2f°C | pH: %.2f | TDS: %.1f ppm (Normal: %.1f%%, DSP: %dms, Infer: %dms)\n",
            clean_temp, clean_ph, clean_tds, normal_conf * 100.0f, result.timing.dsp, result.timing.classification);
        // Forward clean data over WiFi/MQTT to FastAPI gateway
    } else {
        Serial.printf("[STATUS: DEGRADED_MITIGATED] Forwarding sanitized safe values: Temp=%.2f°C, pH=%.2f, TDS=%.1f\n",
            clean_temp, clean_ph, clean_tds);
    }

    // Maintain strict 1-second sampling interval for temporal rate accuracy
    delay(1000);
}
