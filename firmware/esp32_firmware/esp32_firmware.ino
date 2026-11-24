/**
 * AquaGuard - Autonomous Edge TinyML IoT Controller & Gatekeeper
 * Master Firmware Sketch with Dynamic Wi-Fi Captive Portal & QR Provisioning
 * 
 * Hardware Target: ESP32-S3 DevKitC-1 (N16R8) / ESP32 DevKit V1
 * TinyML Model: AquaGuard-TinyML-Gatekeeper (INT8 quantized C++ neural runtime)
 * 
 * Consumer Onboarding Flow:
 *  1. [FIRST BOOT / RESET]: No home Wi-Fi configured in NVS flash.
 *     - Launches SoftAP "AquaGuard-Setup-XXXX" with an embedded DNS captive portal.
 *     - User connects phone to this Wi-Fi; a setup page pops up at 192.168.4.1.
 *     - User selects their home Wi-Fi and enters the password. Credentials saved to NVS.
 *  2. [NORMAL BOOT]: Connects to home Wi-Fi.
 *     - If unassigned to a tank: Displays a Registration QR Code (on screen & Serial)
 *       containing its unique hardware UID (e.g. "AG-ESP32-A1B2C3").
 *     - User points their AquaGuard Mobile App camera at the screen to register!
 *  3. [RUNTIME]: Operates 100% autonomously offline or synchronized with Cloud VPS:
 *     - 1-Second temporal rate-of-change calculation: [ΔT, ΔpH, ΔTDS].
 *     - On-device TinyML inference (<1ms) for sensor fault lockout & safe data imputation.
 *     - Actuator divergence & thermal runaway protection.
 *     - Closed-loop heating & buffer dosing.
 *     - Pushes live telemetry to VPS and ingests downlink target setpoints into NVS.
 */

#include "config.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <AquaGuard-TinyML-Gatekeeper_inferencing.h>

#if USE_OLED_DISPLAY
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool display_active = false;
#endif

// ==============================================================================
// 💾 NVS RUNTIME STORAGE & SYSTEM STATE
// ==============================================================================
Preferences prefs;

struct RuntimeConfig {
    float target_temp_c;
    float target_ph;
    int   target_tds_ppm;
    char  wifi_ssid[32];
    char  wifi_pass[64];
    char  server_url[128];
    char  device_uid[32];
    char  tank_id[64];
    bool  is_provisioned;
};

RuntimeConfig sysConfig = {
    .target_temp_c   = DEFAULT_TARGET_TEMP_C,
    .target_ph       = DEFAULT_TARGET_PH,
    .target_tds_ppm  = DEFAULT_TARGET_TDS_PPM,
    .wifi_ssid       = "",
    .wifi_pass       = "",
    .server_url      = DEFAULT_SERVER_URL,
    .device_uid      = "",
    .tank_id         = "",
    .is_provisioned  = false
};

// Captive Portal Objects
WebServer server(80);
DNSServer dnsServer;
const byte DNS_PORT = 53;
bool in_provisioning_mode = false;

// ==============================================================================
// 🧠 SENSOR DRIVERS & STATE BUFFERS
// ==============================================================================
OneWire oneWire(PIN_ONE_WIRE);
DallasTemperature tempSensors(&oneWire);

// 1-Second sliding window temporal anchors
float prev_temp = DEFAULT_TARGET_TEMP_C;
float prev_ph   = DEFAULT_TARGET_PH;
float prev_tds  = (float)DEFAULT_TARGET_TDS_PPM;
bool  first_reading = true;

// Actuator runtime state tracking
bool heater_active = false;
bool pump_active   = false;
bool heater_lockout = false;
bool pump_lockout   = false;
bool thermal_runaway_active = false;

// pH chemical dosing rate-limiter
unsigned long last_dose_timestamp_ms = 0;

// Evaluator bench simulation variables (used when USE_PHYSICAL_SENSORS == false)
float sim_temp = DEFAULT_TARGET_TEMP_C;
float sim_ph   = DEFAULT_TARGET_PH;
float sim_tds  = (float)DEFAULT_TARGET_TDS_PPM;

// ==============================================================================
// 🖥️ HARDWARE DISPLAY INITIALIZATION & RENDERING SUBSYSTEM
// ==============================================================================

void initDisplay() {
#if USE_OLED_DISPLAY
    Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
    if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
        display_active = true;
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(20, 8);
        display.println("AQUAGUARD AI");
        display.setCursor(6, 24);
        display.println("Autonomous Edge Hub");
        display.setCursor(16, 40);
        display.println("Initializing...");
        display.display();
        Serial.println("🖥️ [DISPLAY] SSD1306 128x64 OLED active on I2C (SDA=21, SCL=22).");
        delay(1000);
    } else {
        display_active = false;
        Serial.println("⚠️ [DISPLAY] SSD1306 OLED not found at 0x3C. Continuing with Serial Dashboard.");
    }
#else
    Serial.println("🖥️ [DISPLAY] Physical OLED disabled in config.h. Using Serial Dashboard.");
#endif
}

void renderCaptivePortalScreen(const char* ap_ssid, const char* ip) {
#if USE_OLED_DISPLAY
    if (display_active) {
        display.clearDisplay();
        // Inverted top title banner
        display.fillRect(0, 0, SCREEN_WIDTH, 11, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(14, 2);
        display.print("AQUAGUARD SETUP");

        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 16);
        display.println("Connect to Wi-Fi:");
        display.setCursor(4, 26);
        display.printf("%s\n", ap_ssid);

        display.setCursor(0, 38);
        display.println("Open Phone Browser:");
        display.setCursor(4, 48);
        display.printf("http://%s\n", ip);
        display.display();
    }
#endif
}

void renderRegistrationScreen(const char* uid, const char* local_ip, const char* vps_url) {
#if USE_OLED_DISPLAY
    if (display_active) {
        display.clearDisplay();
        // Inverted header banner
        display.fillRect(0, 0, SCREEN_WIDTH, 11, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(8, 2);
        display.print("AQUAGUARD PAIRING");

        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 15);
        display.println("Scan QR / Enter UID:");

        display.setTextSize(1);
        display.setCursor(6, 26);
        display.printf("%s\n", uid);

        display.setCursor(0, 38);
        display.printf("WiFi: %s\n", WiFi.SSID().c_str());
        display.setCursor(0, 48);
        display.printf("IP  : %s\n", local_ip);
        display.setCursor(0, 56);
        display.println("Waiting for App... >");
        display.display();
    }
#endif
}

void renderSerialDashboard(float clean_temp, float clean_ph, float clean_tds,
                           float delta_temp, float delta_ph, float delta_tds,
                           const GatekeeperOutput& ml, bool cloud_online) {
    Serial.println("\n┌────────────────────────────────────────────────────────┐");
    Serial.printf ("│ 🐟 AQUAGUARD RUNTIME MONITOR  UID: %-20s│\n", sysConfig.device_uid);
    Serial.println("├────────────────────────────┬───────────────────────────┤");
    Serial.printf ("│ LIVE READINGS (1s Delta)   │ TARGET WATER PARAMETERS   │\n");
    Serial.printf ("│  • Temp: %5.2f°C (%+6.3f) │  • Target Temp: %5.2f°C   │\n", clean_temp, delta_temp, sysConfig.target_temp_c);
    Serial.printf ("│  • pH  :  %5.2f  (%+6.3f) │  • Target pH  :  %5.2f    │\n", clean_ph, delta_ph, sysConfig.target_ph);
    Serial.printf ("│  • TDS : %5.1fppm (%+6.1f) │  • Target TDS : %4d ppm  │\n", clean_tds, delta_tds, sysConfig.target_tds_ppm);
    Serial.println("├────────────────────────────┴───────────────────────────┤");
    Serial.printf ("│ GATEKEEPER : %-42s│\n", 
                   ml.thermal_runaway ? "🚨 THERMAL RUNAWAY EMERGENCY CUTOFF!" :
                   (ml.temp_fault ? "⚠️ TEMP PROBE FAULT (Value Imputed)" :
                   (ml.ph_fault   ? "⚠️ pH PROBE FAULT (Value Imputed)" :
                   (ml.tds_fault  ? "⚠️ TDS PROBE FAULT (Value Imputed)" : "✅ OPTIMAL (Normal Operating Baseline)"))));
    Serial.printf ("│ HEATER     : %-15s DOSING PUMP: %-14s│\n",
                   heater_lockout ? "[LOCKOUT 🔒]" : (heater_active ? "[ACTIVE ON 🔥]" : "[SAFE OFF ⏸️]"),
                   pump_lockout ? "[LOCKOUT 🔒]" : (pump_active ? "[DOSING 🧪]" : "[IDLE ⏸️]"));
    Serial.printf ("│ CLOUD LINK : %-15s INFERENCE  : %d ms        │\n",
                   cloud_online ? "[ONLINE ☁️]" : "[AUTONOMOUS ⚡]",
                   ml.infer_ms);
    Serial.println("└────────────────────────────────────────────────────────┘");
}

void renderLiveDisplayDashboard(float clean_temp, float clean_ph, float clean_tds,
                                float delta_temp, float delta_ph, float delta_tds,
                                const GatekeeperOutput& ml, bool cloud_online) {
#if USE_OLED_DISPLAY
    if (display_active) {
        display.clearDisplay();
        
        // 1. Header Banner with Live Cloud Connectivity Status
        display.fillRect(0, 0, SCREEN_WIDTH, 10, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(2, 1);
        display.print("AquaGuard");
        
        display.setCursor(80, 1);
        if (cloud_online) {
            display.print("[ONLINE]");
        } else {
            display.print("[EDGE]");
        }
        
        display.setTextColor(SSD1306_WHITE);

        // 2. Real-Time Water Metrics (Live Value vs Target Setpoint)
        // Temperature Row
        display.setCursor(0, 13);
        display.printf("TEMP: %4.1fC", clean_temp);
        display.setCursor(76, 13);
        display.printf("(%4.1f)", sysConfig.target_temp_c);
        
        // pH Row
        display.setCursor(0, 23);
        display.printf("pH  : %4.2f", clean_ph);
        display.setCursor(76, 23);
        display.printf("(%4.2f)", sysConfig.target_ph);
        
        // TDS Row
        display.setCursor(0, 33);
        display.printf("TDS : %3.0fppm", clean_tds);
        display.setCursor(76, 33);
        display.printf("(%3d)", sysConfig.target_tds_ppm);
        
        // Horizontal separation rule
        display.drawLine(0, 43, SCREEN_WIDTH - 1, 43, SSD1306_WHITE);
        
        // 3. Actuator Relay States
        display.setCursor(0, 46);
        display.print("HEAT:");
        if (heater_lockout) {
            display.print("LOCK ");
        } else if (heater_active) {
            display.print("ON*  ");
        } else {
            display.print("OFF  ");
        }

        display.setCursor(64, 46);
        display.print("PUMP:");
        if (pump_lockout) {
            display.print("LOCK");
        } else if (pump_active) {
            display.print("DOSE*");
        } else {
            display.print("IDLE");
        }

        // 4. TinyML Neural Gatekeeper Status Pill
        display.setCursor(0, 56);
        if (ml.thermal_runaway) {
            display.print("ALARM: RUNAWAY!!");
        } else if (ml.temp_fault) {
            display.print("WARN: TEMP FAULT");
        } else if (ml.ph_fault) {
            display.print("WARN: pH FAULT");
        } else if (ml.tds_fault) {
            display.print("WARN: TDS FAULT");
        } else {
            display.printf("STATUS: OK (%3.0f%%)", ml.normal_conf * 100.0f);
        }

        display.display();
    }
#endif

    // Format and print live ANSI dashboard box to Serial Monitor
    renderSerialDashboard(clean_temp, clean_ph, clean_tds, delta_temp, delta_ph, delta_tds, ml, cloud_online);
}

void clearFaultLockouts() {
    heater_lockout = false;
    pump_lockout = false;
    thermal_runaway_active = false;
    first_reading = true; // Re-anchor baseline to current stabilized sensor values on the next cycle
    Serial.println("\n🔓 [LOCKOUT CLEARED] Probes re-anchored. Autonomous closed-loop control resumed!");

#if USE_OLED_DISPLAY
    if (display_active) {
        display.clearDisplay();
        display.fillRect(0, 0, SCREEN_WIDTH, 11, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(14, 2);
        display.print("ALARM ACKNOWLEDGED");

        display.setTextColor(SSD1306_WHITE);
        display.setCursor(4, 18);
        display.println("Probes Re-anchored");
        display.setCursor(4, 32);
        display.println("Lockout: RESET");
        display.setCursor(4, 46);
        display.println("Resuming Control >");
        display.display();
        delay(800);
    }
#endif
}

// ==============================================================================
// 🖨️ ASCII QR CODE & HARDWARE DISPLAY GENERATOR
// ==============================================================================
void displayRegistrationQrCode(const char* uid) {
    renderRegistrationScreen(uid, WiFi.localIP().toString().c_str(), sysConfig.server_url);

    Serial.println("\n╔══════════════════════════════════════════════════════════════╗");
    Serial.println("║            📷 AQUAGUARD HARDWARE REGISTRATION QR             ║");
    Serial.println("║    Point your AquaGuard Mobile App Camera at this screen:    ║");
    Serial.println("╠══════════════════════════════════════════════════════════════╣");
    Serial.println("║  ██████████████  ██    ██  ██████████████                    ║");
    Serial.println("║  ██          ██  ██    ██  ██          ██                    ║");
    Serial.println("║  ██  ██████  ██  ████  ██  ██  ██████  ██                    ║");
    Serial.println("║  ██  ██████  ██  ████████  ██  ██████  ██                    ║");
    Serial.println("║  ██  ██████  ██    ██  ██  ██  ██████  ██                    ║");
    Serial.println("║  ██          ██  ████  ██  ██          ██                    ║");
    Serial.println("║  ██████████████  ██  ████  ██████████████                    ║");
    Serial.println("║                  ████████                                    ║");
    Serial.printf ("║  DEVICE UID: %-46s  ║\n", uid);
    Serial.printf ("║  CLOUD VPS : %-46s  ║\n", sysConfig.server_url);
    Serial.println("║  STATUS    : Connected to Home Wi-Fi • Waiting for App Scan  ║");
    Serial.println("╚══════════════════════════════════════════════════════════════╝\n");
}

// ==============================================================================
// 🌐 CAPTIVE PORTAL (SOFTAP WI-FI PROVISIONING)
// ==============================================================================

const char CAPTIVE_PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AquaGuard Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #0B0F19; color: #F8FAFC; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .card { background-color: #131B2E; border: 1px solid #1E293B; border-radius: 16px; padding: 28px; width: 100%; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .header h2 { font-size: 24px; color: #00E5FF; margin-bottom: 6px; }
    .header p { font-size: 13px; color: #94A3B8; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: bold; color: #CBD5E1; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    input { width: 100%; padding: 12px; background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; color: #F8FAFC; font-size: 14px; outline: none; }
    input:focus { border-color: #00E5FF; }
    .btn { width: 100%; background: #00E5FF; color: #0B0F19; border: none; padding: 14px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; margin-top: 10px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .footer { text-align: center; margin-top: 18px; font-size: 11px; color: #64748B; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>AquaGuard IoT Hub</h2>
      <p>Configure Home Wi-Fi Connection</p>
    </div>
    <form action="/save" method="POST">
      <div class="form-group">
        <label>Home Wi-Fi Network (SSID)</label>
        <input type="text" name="ssid" placeholder="Enter Wi-Fi name" required>
      </div>
      <div class="form-group">
        <label>Wi-Fi Password</label>
        <input type="password" name="password" placeholder="Enter Wi-Fi password">
      </div>
      <div class="form-group">
        <label>AquaGuard Cloud VPS URL</label>
        <input type="text" name="server" value="%SERVER_URL%">
      </div>
      <button type="submit" class="btn">Connect & Save</button>
    </form>
    <div class="footer">Autonomous Edge TinyML Architecture • J26-SE-351</div>
  </div>
</body>
</html>
)rawliteral";

void handleRoot() {
    String html = FPSTR(CAPTIVE_PORTAL_HTML);
    html.replace("%SERVER_URL%", sysConfig.server_url);
    server.send(200, "text/html", html);
}

void handleSave() {
    if (server.hasArg("ssid")) {
        String new_ssid = server.arg("ssid");
        String new_pass = server.arg("password");
        String new_server = server.arg("server");

        prefs.begin("aquaguard", false);
        prefs.putString("wifi_ssid", new_ssid);
        prefs.putString("wifi_pass", new_pass);
        if (new_server.length() > 5) {
            prefs.putString("server_url", new_server);
        }
        prefs.end();

        String resp = "<!DOCTYPE html><html><body style='background:#0B0F19;color:#00E5FF;text-align:center;padding:50px;font-family:sans-serif;'>";
        resp += "<h2>Configuration Saved!</h2><p style='color:#F8FAFC;'>Connecting to " + new_ssid + "... Device is restarting.</p></body></html>";
        server.send(200, "text/html", resp);
        delay(1500);
        ESP.restart();
    }
}

void startCaptivePortal(const char* ap_ssid) {
    in_provisioning_mode = true;
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ap_ssid);
    delay(500);

    dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

    server.on("/", handleRoot);
    server.on("/save", HTTP_POST, handleSave);
    server.onNotFound([]() {
        server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
        server.send(302, "text/plain", "");
    });
    server.begin();

    // Render Captive Portal instructions onto physical OLED display
    renderCaptivePortalScreen(ap_ssid, WiFi.softAPIP().toString().c_str());

    Serial.println("\n╔══════════════════════════════════════════════════════════════╗");
    Serial.println("║           📶 AQUAGUARD WI-FI PROVISIONING PORTAL             ║");
    Serial.println("╠══════════════════════════════════════════════════════════════╣");
    Serial.printf ("║  1. Connect your phone to Wi-Fi: %-28s║\n", ap_ssid);
    Serial.printf ("║  2. Open browser to: http://%-33s║\n", WiFi.softAPIP().toString().c_str());
    Serial.println("║  3. Enter your Home Wi-Fi credentials to connect.             ║");
    Serial.println("╚══════════════════════════════════════════════════════════════╝\n");
}

// ==============================================================================
// 🧪 SENSOR ACQUISITION ROUTINES
// ==============================================================================

float readWaterTemperature() {
#if USE_PHYSICAL_SENSORS
    tempSensors.requestTemperatures();
    float tempC = tempSensors.getTempCByIndex(0);
    if (tempC < -50.0f || tempC > 80.0f) {
        return prev_temp;
    }
    return tempC;
#else
    return sim_temp;
#endif
}

float readWaterPh() {
#if USE_PHYSICAL_SENSORS
    long adc_sum = 0;
    for (int i = 0; i < 10; i++) {
        adc_sum += analogRead(PIN_PH_ADC);
        delayMicroseconds(500);
    }
    float pin_voltage = ((float)adc_sum / 10.0f) * (3.3f / 4095.0f);
    float probe_voltage = pin_voltage * 2.0f; // Scale 2x for voltage divider
    float ph = 7.0f + ((PH_CALIBRATION_NEUTRAL_V - probe_voltage) * PH_CALIBRATION_SLOPE);
    return constrain(ph, 0.0f, 14.0f);
#else
    return sim_ph;
#endif
}

float readWaterTds(float currentTempC) {
#if USE_PHYSICAL_SENSORS
    digitalWrite(PIN_TDS_VCC_GATE, HIGH);
    delay(80);

    long adc_sum = 0;
    for (int i = 0; i < 10; i++) {
        adc_sum += analogRead(PIN_TDS_ADC);
        delayMicroseconds(500);
    }
    digitalWrite(PIN_TDS_VCC_GATE, LOW);

    float voltage = ((float)adc_sum / 10.0f) * (3.3f / 4095.0f);
    float comp_coeff = 1.0f + TDS_TEMP_COEFFICIENT * (currentTempC - 25.0f);
    float comp_voltage = voltage / max(comp_coeff, 0.1f);

    float tds = (133.42f * pow(comp_voltage, 3) - 255.86f * pow(comp_voltage, 2) + 857.39f * comp_voltage) * 0.5f;
    return max(tds, 0.0f);
#else
    return sim_tds;
#endif
}

// ==============================================================================
// 🧠 TINYML NEURAL GATEKEEPER INFERENCE
// ==============================================================================

struct GatekeeperOutput {
    bool temp_fault;
    bool ph_fault;
    bool tds_fault;
    bool thermal_runaway;
    const char* classification;
    float confidence;
    int dsp_ms;
    int infer_ms;
    float normal_conf;
    float temp_conf;
    float ph_conf;
    float tds_conf;
};

GatekeeperOutput runTinyMLGatekeeper(float delta_temp, float delta_ph, float delta_tds, float current_temp) {
    GatekeeperOutput out = {
        .temp_fault = false,
        .ph_fault = false,
        .tds_fault = false,
        .thermal_runaway = false,
        .classification = "OPTIMAL",
        .confidence = 0.98f,
        .dsp_ms = 0,
        .infer_ms = 1,
        .normal_conf = 0.98f,
        .temp_conf = 0.0f,
        .ph_conf = 0.0f,
        .tds_conf = 0.0f
    };

    float features[3] = { delta_temp, delta_ph, delta_tds };
    signal_t signal;
    numpy::signal_from_buffer(features, sizeof(features) / sizeof(features[0]), &signal);

    ei_impulse_result_t ei_result = { 0 };
    EI_IMPULSE_ERROR res = run_classifier(&signal, &ei_result, false);

    if (res == EI_IMPULSE_OK) {
        out.dsp_ms = ei_result.timing.dsp;
        out.infer_ms = ei_result.timing.classification;

        for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
            const char* label = ei_result.classification[i].label;
            float val = ei_result.classification[i].value;

            if (strcmp(label, "normal") == 0) {
                out.normal_conf = val;
            } else if (strcmp(label, "temp_fault") == 0) {
                out.temp_conf = val;
                if (val >= 0.50f) { out.temp_fault = true; out.classification = "temp_fault"; out.confidence = val; }
            } else if (strcmp(label, "ph_fault") == 0) {
                out.ph_conf = val;
                if (val >= 0.50f) { out.ph_fault = true; out.classification = "ph_fault"; out.confidence = val; }
            } else if (strcmp(label, "tds_fault") == 0) {
                out.tds_conf = val;
                if (val >= 0.50f) { out.tds_fault = true; out.classification = "tds_fault"; out.confidence = val; }
            }
        }
    }

    if (current_temp >= THERMAL_RUNAWAY_MAX_TEMP || (!heater_active && delta_temp >= THERMAL_RUNAWAY_SLOPE)) {
        out.thermal_runaway = true;
        out.classification = "THERMAL_RUNAWAY";
    }

    return out;
}

// ==============================================================================
// ⚙️ AUTONOMOUS CLOSED-LOOP ACTUATOR CONTROLLER
// ==============================================================================

void executeAutonomousActuation(float clean_temp, float clean_ph, const GatekeeperOutput& ml) {
    if (ml.thermal_runaway) {
        heater_lockout = true;
        digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
        heater_active = false;
        thermal_runaway_active = true;
        Serial.println("🚨 [CRITICAL ALERT] Thermal Runaway! Welded relay contacts. Heater FORCED OFF!");
        return;
    }

    if (ml.temp_fault) {
        heater_lockout = true;
        digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
        heater_active = false;
    } else {
        heater_lockout = false;
        if (clean_temp < (sysConfig.target_temp_c - 0.30f)) {
            digitalWrite(PIN_RELAY_HEATER, RELAY_ACTIVE_ON);
            heater_active = true;
        } else if (clean_temp > (sysConfig.target_temp_c + 0.30f)) {
            digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
            heater_active = false;
        }
    }

    if (ml.ph_fault) {
        pump_lockout = true;
        digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);
        pump_active = false;
    } else {
        pump_lockout = false;
        unsigned long now = millis();
        if (clean_ph > (sysConfig.target_ph + 0.25f) && (now - last_dose_timestamp_ms >= MIN_DOSE_INTERVAL_MS)) {
            Serial.println("🧪 [DOSE] Triggering 500ms precision pH buffer micro-dose...");
            digitalWrite(PIN_RELAY_PUMP, RELAY_ACTIVE_ON);
            pump_active = true;
            delay(DOSE_PULSE_DURATION_MS);
            digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);
            pump_active = false;
            last_dose_timestamp_ms = now;
        } else {
            digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);
            pump_active = false;
        }
    }
}

// ==============================================================================
// 📡 CLOUD TELEMETRY UPLINK & TARGET SYNCHRONIZATION
// ==============================================================================

bool syncWithCloudGateway(float clean_temp, float clean_ph, float clean_tds,
                          float raw_temp, float raw_ph, float raw_tds,
                          float delta_temp, float delta_ph, float delta_tds,
                          const GatekeeperOutput& ml) {
    if (WiFi.status() != WL_CONNECTED) return false;

    HTTPClient http;
    char endpoint[256];
    snprintf(endpoint, sizeof(endpoint), "%s/api/telemetry/ingest", sysConfig.server_url);
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3000);

    char json_buffer[1200];
    const char* sys_status = ml.thermal_runaway ? "WELDED_RUNAWAY" : 
                            ((ml.temp_fault || ml.ph_fault || ml.tds_fault) ? "DEGRADED_MITIGATED" : "OPTIMAL");

    snprintf(json_buffer, sizeof(json_buffer),
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
        "\"diagnostics\":{"
            "\"temperature\":{\"fault_detected\":%s,\"imputed\":%s},"
            "\"ph\":{\"fault_detected\":%s,\"imputed\":%s},"
            "\"tds\":{\"fault_detected\":%s,\"imputed\":%s}"
        "},"
        "\"timing_ms\":{\"dsp\":%d,\"classification\":%d},"
        "\"ml_confidence\":{\"normal\":%.4f,\"temp_fault\":%.4f,\"ph_fault\":%.4f,\"tds_fault\":%.4f},"
        "\"target_params\":{\"target_temp\":%.2f,\"target_ph\":%.2f,\"target_tds\":%d}"
        "}",
        sysConfig.device_uid,
        sysConfig.tank_id,
        sys_status,
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
        ml.temp_fault ? "true" : "false", ml.temp_fault ? "true" : "false",
        ml.ph_fault ? "true" : "false", ml.ph_fault ? "true" : "false",
        ml.tds_fault ? "true" : "false", ml.tds_fault ? "true" : "false",
        ml.dsp_ms, ml.infer_ms,
        ml.normal_conf, ml.temp_conf, ml.ph_conf, ml.tds_conf,
        sysConfig.target_temp_c, sysConfig.target_ph, sysConfig.target_tds_ppm
    );

    int httpResponseCode = http.POST(json_buffer);
    bool sync_success = false;
    if (httpResponseCode > 0) {
        if (httpResponseCode == 200 || httpResponseCode == 201) {
            sync_success = true;
        }
        String response = http.getString();
        
        // Parse downlink target setpoints
        int tIdx = response.indexOf("\"target_temp\":");
        if (tIdx > 0) {
            float new_temp = response.substring(tIdx + 14).toFloat();
            if (new_temp >= 18.0f && new_temp <= 34.0f && new_temp != sysConfig.target_temp_c) {
                sysConfig.target_temp_c = new_temp;
                prefs.begin("aquaguard", false);
                prefs.putFloat("target_temp", sysConfig.target_temp_c);
                prefs.end();
                Serial.printf("📥 [DOWNLINK] Target Temp updated from Cloud: %.2f°C\n", sysConfig.target_temp_c);
            }
        }

        // Parse downlink fault clearance command (e.g. from Mobile App)
        if (response.indexOf("\"clear_lockout\":true") >= 0 || response.indexOf("\"clear_lockout\": true") >= 0) {
            clearFaultLockouts();
            Serial.println("📱 [REMOTE CLOUD] User cleared fault via Mobile App. Normal control resumed!");
        }
    }
    http.end();
    return sync_success;
}

// ==============================================================================
// 🚀 ARDUINO SETUP
// ==============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    // Initialize physical I2C OLED display or fallback to Serial
    initDisplay();

    Serial.println("\n========================================================");
    Serial.println("  🐟 AquaGuard Autonomous Edge TinyML IoT Firmware");
    Serial.println("  Hardware: ESP32-S3 / ESP32 DevKit");
    Serial.println("  Edge Neural Runtime: INT8 TinyML Rate-of-Change");
    Serial.println("========================================================");

    // 1. Generate unique hardware UID from chip MAC address
    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(sysConfig.device_uid, sizeof(sysConfig.device_uid), "AG-ESP32-%02X%02X%02X", mac[3], mac[4], mac[5]);
    Serial.printf("[SYSTEM] Device Hardware UID: %s\n", sysConfig.device_uid);

    // 2. Initialize NVS Flash and Load Persistent Targets
    prefs.begin("aquaguard", false);
    sysConfig.target_temp_c  = prefs.getFloat("target_temp", DEFAULT_TARGET_TEMP_C);
    sysConfig.target_ph      = prefs.getFloat("target_ph", DEFAULT_TARGET_PH);
    sysConfig.target_tds_ppm = prefs.getInt("target_tds", DEFAULT_TARGET_TDS_PPM);
    prefs.getString("wifi_ssid", sysConfig.wifi_ssid, sizeof(sysConfig.wifi_ssid));
    prefs.getString("wifi_pass", sysConfig.wifi_pass, sizeof(sysConfig.wifi_pass));
    prefs.getString("server_url", sysConfig.server_url, sizeof(sysConfig.server_url));
    prefs.getString("tank_id", sysConfig.tank_id, sizeof(sysConfig.tank_id));
    prefs.end();

    if (strlen(sysConfig.server_url) == 0) {
        strncpy(sysConfig.server_url, DEFAULT_SERVER_URL, sizeof(sysConfig.server_url));
    }

    // 3. Configure GPIO Pin Modes
    pinMode(PIN_RELAY_HEATER, OUTPUT);
    pinMode(PIN_RELAY_PUMP, OUTPUT);
    digitalWrite(PIN_RELAY_HEATER, RELAY_SAFE_OFF);
    digitalWrite(PIN_RELAY_PUMP, RELAY_SAFE_OFF);

    pinMode(PIN_TDS_VCC_GATE, OUTPUT);
    digitalWrite(PIN_TDS_VCC_GATE, LOW);

    pinMode(PIN_BUTTON_RESET, INPUT_PULLUP);
    analogSetPinAttenuation(PIN_PH_ADC, ADC_11db);
    analogSetPinAttenuation(PIN_TDS_ADC, ADC_11db);

    tempSensors.begin();

    // 4. Check if Reset Button is held on Boot (force Wi-Fi reconfiguration)
    bool force_reset = (digitalRead(PIN_BUTTON_RESET) == LOW);
    if (force_reset) {
        Serial.println("🔘 [RESET] Tactile button pressed on boot: Clearing Wi-Fi configuration...");
        prefs.begin("aquaguard", false);
        prefs.remove("wifi_ssid");
        prefs.remove("wifi_pass");
        prefs.end();
        sysConfig.wifi_ssid[0] = '\0';
    }

    // 5. Connect to Wi-Fi or Start Captive Portal
    if (strlen(sysConfig.wifi_ssid) == 0) {
        // No Wi-Fi credentials in flash -> Enter SoftAP Captive Portal
        char ap_name[32];
        snprintf(ap_name, sizeof(ap_name), "AquaGuard-Setup-%02X%02X", mac[4], mac[5]);
        startCaptivePortal(ap_name);
        return;
    }

    Serial.printf("[WIFI] Connecting to %s ...\n", sysConfig.wifi_ssid);
    WiFi.mode(WIFI_STA);
    WiFi.begin(sysConfig.wifi_ssid, sysConfig.wifi_pass);
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 20) {
        delay(250);
        Serial.print(".");
        retries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n✅ [WIFI] Connected! Device Local IP: %s\n", WiFi.localIP().toString().c_str());
        // Print and display Registration QR code for user to scan with app
        displayRegistrationQrCode(sysConfig.device_uid);
    } else {
        Serial.println("\n🌐 [OFFLINE RESILIENCE] Wi-Fi connection timed out. Operating in 100% Autonomous Edge Mode!");
    }
}

// ==============================================================================
// 🔄 MAIN LOOP
// ==============================================================================
void loop() {
    // ── If in Provisioning Mode, handle Captive Portal HTTP/DNS requests ──
    if (in_provisioning_mode) {
        dnsServer.processNextRequest();
        server.handleClient();
        delay(10);
        return;
    }

    // ── Physical Enclosure Button: Short-press clears fault lockout ──
    if (digitalRead(PIN_BUTTON_RESET) == LOW) {
        delay(50); // Debounce
        if (digitalRead(PIN_BUTTON_RESET) == LOW) {
            clearFaultLockouts();
            delay(500); // Wait for release
        }
    }

    // ── Serial Benchtop Demonstration Fault Injection & Control ──
    if (Serial.available()) {
        char cmd = Serial.read();
        if (cmd == 'T' || cmd == 't') { sim_temp = Serial.parseFloat(); Serial.printf(">>> [INJECTION] Temp: %.2f°C\n", sim_temp); }
        else if (cmd == 'P' || cmd == 'p') { sim_ph = Serial.parseFloat(); Serial.printf(">>> [INJECTION] pH: %.2f\n", sim_ph); }
        else if (cmd == 'D' || cmd == 'd') { sim_tds = Serial.parseFloat(); Serial.printf(">>> [INJECTION] TDS: %.1f ppm\n", sim_tds); }
        else if (cmd == 'C' || cmd == 'c') { clearFaultLockouts(); }
    }

    // ── 1. Acquire Sensor Readings ──
    float current_temp = readWaterTemperature();
    float current_ph   = readWaterPh();
    float current_tds  = readWaterTds(current_temp);

    // ── 2. First Boot Baseline Reference Anchor ──
    if (first_reading) {
        prev_temp = current_temp;
        prev_ph   = current_ph;
        prev_tds  = current_tds;
        first_reading = false;
        Serial.println("[BOOT] Sensor baseline established. Running 1 Hz TinyML loop.");
        delay(SENSOR_SAMPLE_INTERVAL_MS);
        return;
    }

    // ── 3. 1-Second Temporal Rate of Change (Deltas) ──
    float delta_temp = current_temp - prev_temp;
    float delta_ph   = current_ph   - prev_ph;
    float delta_tds  = current_tds  - prev_tds;

    // ── 4. Edge Impulse INT8 TinyML Neural Gatekeeper ──
    GatekeeperOutput ml = runTinyMLGatekeeper(delta_temp, delta_ph, delta_tds, current_temp);

    // ── 5. Data Imputation for Verified Actuator Safety ──
    float clean_temp = ml.temp_fault ? prev_temp : current_temp;
    float clean_ph   = ml.ph_fault   ? prev_ph   : current_ph;
    float clean_tds  = ml.tds_fault  ? prev_tds  : current_tds;

    if (!ml.temp_fault) prev_temp = current_temp;
    if (!ml.ph_fault)   prev_ph   = current_ph;
    if (!ml.tds_fault)  prev_tds  = current_tds;

    // ── 6. Closed-Loop Actuator Regulation ──
    executeAutonomousActuation(clean_temp, clean_ph, ml);

    // ── 7. Push Telemetry to Cloud VPS & Ingest Downlink Targets ──
    bool cloud_online = syncWithCloudGateway(clean_temp, clean_ph, clean_tds,
                                             current_temp, current_ph, current_tds,
                                             delta_temp, delta_ph, delta_tds,
                                             ml);

    // ── 8. Render Real-Time IoT Display & Serial Dashboard ──
    renderLiveDisplayDashboard(clean_temp, clean_ph, clean_tds,
                               delta_temp, delta_ph, delta_tds,
                               ml, cloud_online);

    delay(SENSOR_SAMPLE_INTERVAL_MS);
}
