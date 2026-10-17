#include <stdio.h>
#include <cstring>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <fstream>
#include "edge-impulse-sdk/classifier/ei_run_classifier.h"

using namespace std;

// State persistence path for consecutive reading delta calculation
const char* STATE_FILE = "/tmp/aquaguard_state.txt";

struct SystemState {
    float temp;
    float ph;
    float tds;
};

SystemState load_state(float default_temp, float default_ph, float default_tds) {
    SystemState s = { default_temp, default_ph, default_tds };
    ifstream infile(STATE_FILE);
    if (infile.is_open()) {
        if (infile >> s.temp >> s.ph >> s.tds) {
            infile.close();
            return s;
        }
        infile.close();
    }
    return s;
}

void save_state(float temp, float ph, float tds) {
    ofstream outfile(STATE_FILE);
    if (outfile.is_open()) {
        outfile << fixed << setprecision(3) << temp << " " << ph << " " << tds << "\n";
        outfile.close();
    }
}

int main(int argc, char **argv) {
    if (argc < 2) {
        printf("Usage:\n");
        printf("  ./custom <curr_temp> <curr_ph> <curr_tds> [prev_temp] [prev_ph] [prev_tds]\n");
        printf("  ./custom --delta <delta_temp> <delta_ph> <delta_tds> [base_temp] [base_ph] [base_tds]\n");
        printf("  ./custom --reset <base_temp> <base_ph> <base_tds>\n");
        return 1;
    }

    // Reset handler
    if (strcmp(argv[1], "--reset") == 0) {
        float r_temp = (argc > 2) ? std::stof(argv[2]) : 29.0f;
        float r_ph   = (argc > 3) ? std::stof(argv[3]) : 6.50f;
        float r_tds  = (argc > 4) ? std::stof(argv[4]) : 150.0f;
        save_state(r_temp, r_ph, r_tds);
        cout << "{\"status\": \"RESET_OK\", \"baseline\": {\"temp\": " << r_temp << ", \"ph\": " << r_ph << ", \"tds\": " << r_tds << "}}" << endl;
        return 0;
    }

    float curr_temp = 29.0f;
    float curr_ph   = 6.50f;
    float curr_tds  = 150.0f;

    float prev_temp = 29.0f;
    float prev_ph   = 6.50f;
    float prev_tds  = 150.0f;

    float delta_temp = 0.0f;
    float delta_ph   = 0.0f;
    float delta_tds  = 0.0f;

    bool is_delta_mode = false;

    if (strcmp(argv[1], "--delta") == 0) {
        if (argc < 5) {
            printf("Error: --delta requires <delta_temp> <delta_ph> <delta_tds>\n");
            return 1;
        }
        is_delta_mode = true;
        delta_temp = std::stof(argv[2]);
        delta_ph   = std::stof(argv[3]);
        delta_tds  = std::stof(argv[4]);

        prev_temp = (argc > 5) ? std::stof(argv[5]) : 29.0f;
        prev_ph   = (argc > 6) ? std::stof(argv[6]) : 6.50f;
        prev_tds  = (argc > 7) ? std::stof(argv[7]) : 150.0f;

        curr_temp = prev_temp + delta_temp;
        curr_ph   = prev_ph + delta_ph;
        curr_tds  = prev_tds + delta_tds;
    } else {
        if (argc < 4) {
            printf("Error: Expected at least <temp> <ph> <tds>\n");
            return 1;
        }
        curr_temp = std::stof(argv[1]);
        curr_ph   = std::stof(argv[2]);
        curr_tds  = std::stof(argv[3]);

        if (argc >= 7) {
            // Explicit previous baseline provided
            prev_temp = std::stof(argv[4]);
            prev_ph   = std::stof(argv[5]);
            prev_tds  = std::stof(argv[6]);
        } else {
            // Load previous baseline from state file, defaulting to current values
            SystemState s = load_state(curr_temp, curr_ph, curr_tds);
            prev_temp = s.temp;
            prev_ph   = s.ph;
            prev_tds  = s.tds;
        }

        delta_temp = curr_temp - prev_temp;
        delta_ph   = curr_ph - prev_ph;
        delta_tds  = curr_tds - prev_tds;
    }

    // Input features to Edge Impulse (axis order: delta_temp, delta_ph, delta_tds)
    float delta_features[] = { delta_temp, delta_ph, delta_tds };

    run_classifier_init();

    ei_impulse_result_t result;
    signal_t signal;
    numpy::signal_from_buffer(delta_features, 3, &signal);

    EI_IMPULSE_ERROR res = run_classifier(&signal, &result, false);
    if (res != EI_IMPULSE_OK) {
        printf("run_classifier failed (%d)\n", (int)res);
        return 1;
    }

    // Determine highest confidence classification
    float max_val = 0.0f;
    string max_label = "normal";
    for (uint16_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
        if (result.classification[i].value > max_val) {
            max_val = result.classification[i].value;
            max_label = result.classification[i].label;
        }
    }

    // Decision Logic: Pure Machine Learning Majority Classification
    bool temp_fault = (max_label == "temp_fault" && max_val >= 0.50f);
    bool ph_fault   = (max_label == "ph_fault"   && max_val >= 0.50f);
    bool tds_fault  = (max_label == "tds_fault"  && max_val >= 0.50f);

    bool fault_detected = (temp_fault || ph_fault || tds_fault);
    string system_status = fault_detected ? "DEGRADED_FAULT_MITIGATED" : "OPTIMAL";

    // Gatekeeper Actuator Safety Interlocks
    bool heater_lockout = temp_fault;
    bool ph_pump_lockout = ph_fault;

    // Data Imputation: replace corrupted physical spikes with last verified safe baseline
    float clean_temp = temp_fault ? prev_temp : curr_temp;
    float clean_ph   = ph_fault   ? prev_ph   : curr_ph;
    float clean_tds  = tds_fault  ? prev_tds  : curr_tds;

    // State Baseline Evolution:
    // CRITICAL SAFETY RULE: Never update baseline to a corrupted reading!
    // Next cycle references the verified clean state.
    save_state(clean_temp, clean_ph, clean_tds);

    cout << "{" << endl;
    cout << "  \"system_status\": \"" << system_status << "\"," << endl;
    cout << "  \"timing_ms\": {" << endl;
    cout << "    \"dsp\": " << result.timing.dsp << "," << endl;
    cout << "    \"classification\": " << result.timing.classification << "," << endl;
    cout << "    \"anomaly\": " << result.timing.anomaly << endl;
    cout << "  }," << endl;

    cout << "  \"deltas\": {" << endl;
    cout << "    \"delta_temp\": " << fixed << setprecision(3) << delta_temp << "," << endl;
    cout << "    \"delta_ph\": " << fixed << setprecision(3) << delta_ph << "," << endl;
    cout << "    \"delta_tds\": " << fixed << setprecision(3) << delta_tds << endl;
    cout << "  }," << endl;

    cout << "  \"ml_confidence\": {" << endl;
    for (uint16_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
        cout << "    \"" << result.classification[i].label << "\": " << fixed << setprecision(5) << result.classification[i].value;
        if (i < EI_CLASSIFIER_LABEL_COUNT - 1) cout << ",";
        cout << endl;
    }
    cout << "  }," << endl;

    cout << "  \"telemetry\": {" << endl;
    cout << "    \"temperature_c\": " << fixed << setprecision(2) << clean_temp << "," << endl;
    cout << "    \"ph\": " << fixed << setprecision(2) << clean_ph << "," << endl;
    cout << "    \"tds_ppm\": " << fixed << setprecision(1) << clean_tds << "," << endl;
    cout << "    \"raw_temp\": " << fixed << setprecision(2) << curr_temp << "," << endl;
    cout << "    \"raw_ph\": " << fixed << setprecision(2) << curr_ph << "," << endl;
    cout << "    \"raw_tds\": " << fixed << setprecision(1) << curr_tds << endl;
    cout << "  }," << endl;

    cout << "  \"diagnostics\": {" << endl;
    cout << "    \"temperature\": {\"fault_detected\": " << (temp_fault ? "true" : "false") << ", \"imputed\": " << (temp_fault ? "true" : "false") << "}," << endl;
    cout << "    \"ph\": {\"fault_detected\": " << (ph_fault ? "true" : "false") << ", \"imputed\": " << (ph_fault ? "true" : "false") << "}," << endl;
    cout << "    \"tds\": {\"fault_detected\": " << (tds_fault ? "true" : "false") << ", \"imputed\": " << (tds_fault ? "true" : "false") << "}" << endl;
    cout << "  }," << endl;

    cout << "  \"gatekeeper\": {" << endl;
    cout << "    \"heater_lockout\": " << (heater_lockout ? "true" : "false") << "," << endl;
    cout << "    \"ph_pump_lockout\": " << (ph_pump_lockout ? "true" : "false") << endl;
    cout << "  }," << endl;

    cout << "  \"next_baseline\": {" << endl;
    cout << "    \"temp\": " << fixed << setprecision(2) << clean_temp << "," << endl;
    cout << "    \"ph\": " << fixed << setprecision(2) << clean_ph << "," << endl;
    cout << "    \"tds\": " << fixed << setprecision(1) << clean_tds << endl;
    cout << "  }" << endl;

    cout << "}" << endl;

    return 0;
}
