import random
import csv
import math

# Set seed for reproducibility
random.seed(42)
SAMPLES_PER_CLASS = 1500  # Total 6000 samples

data = []

def clamp(val, min_v, max_v):
    return max(min_v, min(max_v, val))

# ==============================================================================
# 1. NORMAL CLASS
# Physical Reality: Water temp changes slowly (0.001 - 0.05 °C/s).
# Normal DS18B20 quantization noise is ~0.0625°C.
# Normal Range: Delta Temp in [-0.25, +0.25], Delta pH in [-0.08, +0.08], Delta TDS in [-6, +6]
# ==============================================================================
for _ in range(SAMPLES_PER_CLASS):
    d_temp = clamp(random.gauss(0.0, 0.08), -0.25, 0.25)
    d_ph   = clamp(random.gauss(0.0, 0.03), -0.08, 0.08)
    d_tds  = clamp(random.gauss(0.0, 2.0), -6.0, 6.0)
    data.append([round(d_temp, 4), round(d_ph, 4), round(d_tds, 2), "normal"])

# ==============================================================================
# 2. TEMPERATURE FAULT CLASS
# User Requirement: Delta Temp >= 1.0 °C in 1 second MUST trigger as FAULT!
# Dense sampling near the boundary (0.95°C - 3.5°C) to sharpen the NN decision boundary.
# ==============================================================================
for _ in range(SAMPLES_PER_CLASS):
    sign = random.choice([-1, 1])
    if random.random() < 0.65:
        # Near-threshold zone (1.0°C to 3.5°C)
        d_temp = sign * random.uniform(0.95, 3.50)
    else:
        # Extreme spikes (3.5°C to 10.0°C)
        d_temp = sign * random.uniform(3.50, 10.00)

    d_ph  = clamp(random.gauss(0.0, 0.03), -0.08, 0.08)
    d_tds = clamp(random.gauss(0.0, 2.0), -6.0, 6.0)
    data.append([round(d_temp, 4), round(d_ph, 4), round(d_tds, 2), "temp_fault"])

# ==============================================================================
# 3. PH FAULT CLASS
# Broken electrode / disconnect / chemical spill: Delta pH >= 0.40 to 4.5
# ==============================================================================
for _ in range(SAMPLES_PER_CLASS):
    sign = random.choice([-1, 1])
    if random.random() < 0.65:
        d_ph = sign * random.uniform(0.40, 1.80)
    else:
        d_ph = sign * random.uniform(1.80, 5.00)

    d_temp = clamp(random.gauss(0.0, 0.08), -0.25, 0.25)
    d_tds  = clamp(random.gauss(0.0, 2.0), -6.0, 6.0)
    data.append([round(d_temp, 4), round(d_ph, 4), round(d_tds, 2), "ph_fault"])

# ==============================================================================
# 4. TDS FAULT CLASS
# Probe scaling / dry probe / electrical noise: Delta TDS >= 30 to 600 ppm
# ==============================================================================
for _ in range(SAMPLES_PER_CLASS):
    sign = random.choice([-1, 1])
    if random.random() < 0.65:
        d_tds = sign * random.uniform(30.0, 120.0)
    else:
        d_tds = sign * random.uniform(120.0, 600.0)

    d_temp = clamp(random.gauss(0.0, 0.08), -0.25, 0.25)
    d_ph   = clamp(random.gauss(0.0, 0.03), -0.08, 0.08)
    data.append([round(d_temp, 4), round(d_ph, 4), round(d_tds, 2), "tds_fault"])

# Shuffle the combined dataset
random.shuffle(data)

out_csv = "/Users/sandunudayakantha/research/J26-SE-351/tinyML/aquaguard_delta_dataset_v2.csv"
with open(out_csv, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["delta_temp", "delta_ph", "delta_tds", "label"])
    writer.writerows(data)

print(f"Successfully generated {len(data)} samples into:")
print(f"  {out_csv}")
