# AquaGuard ESP32-S3 Hardware Circuit Assembly Guide
> **Complete Pin-by-Pin Wiring, Power Distribution, and Bench Testing Manual**
> Target Controller: ESP32-S3 DevKitC-1 (N16R8) / ESP32 DevKit V1 (38-pin)

---

## 1. Quick Reference: Master GPIO Pin Map

| Subsystem | Component Pin | Connects to ESP32 Pin | Resistor / Protection Needed | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Power** | LM2596 Output (+) | **VIN (5V Pin)** | None | Set buck converter to **5.00V** before connecting |
| **Power** | LM2596 Output (-) | **GND** | None | Common system ground rail |
| **Temperature** | DS18B20 VDD (Red) | **3.3V Pin** | None | Submersible digital temperature |
| **Temperature** | DS18B20 GND (Black)| **GND Rail** | None | |
| **Temperature** | DS18B20 DATA (Yellow)| **GPIO 15** | **4.7kΩ Pull-Up** to 3.3V | Mandatory 1-Wire pull-up resistor |
| **pH Sensor** | PH-4502C VCC | **5V Rail** | None | Board requires 5V to power op-amps |
| **pH Sensor** | PH-4502C GND | **GND Rail** | None | |
| **pH Sensor** | PH-4502C PO (Analog)| **GPIO 34 (ADC1)** | **10kΩ + 10kΩ Voltage Divider** | Cuts 5V analog peak down to 2.5V max to protect ADC |
| **TDS Sensor** | Gravity TDS VCC | **GPIO 21** | None | Switched GPIO power gating to stop ground loop |
| **TDS Sensor** | Gravity TDS GND | **GND Rail** | None | |
| **TDS Sensor** | Gravity TDS Analog | **GPIO 32 (ADC1)** | None | Runs within 3.3V range natively |
| **Actuator 1** | Relay IN1 (Heater) | **GPIO 25** | **1kΩ in series** | Optocoupler active-LOW signal |
| **Actuator 2** | Relay IN2 (Dosing Pump)| **GPIO 26**| **1kΩ in series** | Optocoupler active-LOW signal |
| **Relay Power** | Relay VCC | **5V Rail** | None | Coil power requires 5V |
| **Relay Power** | Relay GND | **GND Rail** | None | |
| **Display** | ILI9341 CS | **GPIO 5** | None | SPI Chip Select |
| **Display** | ILI9341 SCK | **GPIO 18** | None | SPI Clock |
| **Display** | ILI9341 MOSI | **GPIO 23** | None | SPI Data Out |
| **Display** | ILI9341 DC/RS | **GPIO 2** | None | Command / Data Select |
| **Display** | ILI9341 RESET | **GPIO 27** | None | Reset Line |
| **Display** | ILI9341 VCC / LED | **3.3V Rail** | None | Backlight & Logic |
| **User Input** | Tactile Button 1 | **GPIO 12** | Internal Pull-Up | Push to GND: Hold 3s to reset WiFi |

---

## 2. Power Supply & Buck Converter Calibration

> [!CAUTION]
> **CRITICAL STEP BEFORE PLUGGING IN THE ESP32:**
> Do NOT connect the LM2596 output to the ESP32 until you have verified its output with a multimeter! The LM2596 ships from the factory set to random voltages (often 12V or 18V), which would immediately destroy the ESP32.

```
       12V 2A DC Power Adapter
                │
                ▼ (Barrel Jack / Screw Terminal)
         ┌──────────────┐
         │ LM2596 Buck  │
  12V ───► IN+     OUT+ ├───► 5.0V Main Rail (Orange Wire)
  GND ───► IN-     OUT- ├───► Common GND Rail (Black Wire)
         │  [ Potentiometer ]
         └──────────────┘
                │
          Rotate brass screw counter-clockwise 
          while checking OUT+ with a Digital Multimeter 
          until the voltage reads EXACTLY 5.00V ± 0.05V.
```

### 3-Rail Breadboard Power Distribution:
- **12V High-Power Rail:** Powers the 12V DC peristaltic dosing pump directly through the relay switch contacts.
- **5V Logic Rail:** Powers LM2596 Output, ESP32 VIN, Relay Board VCC, and PH-4502C VCC.
- **3.3V Sensor Rail:** Provided by the ESP32's onboard regulator pin (`3V3`). Powers DS18B20 and TFT display.
- **Common Ground Rail:** Connect the 12V ground, LM2596 GND, and ESP32 GND together. All analog signals depend on a shared 0V reference.

---

## 3. Sensor Wiring Schematics

### 3.1 DS18B20 Waterproof Temperature Sensor
The DS18B20 uses digital 1-Wire communication. Without the 4.7kΩ pull-up resistor, the data line floats and reads `-127.0°C`.

```
           +3.3V Rail
              │
              ├─── [ 4.7kΩ Resistor ] ───┐
              │                          │
   [Red Wire: VDD]             [Yellow Wire: DATA] ────► ESP32 GPIO 15
                                         │
   [Black Wire: GND] ────────────────────┴─────────────► GND Rail
```

### 3.2 PH-4502C Analog pH Sensor (With Overvoltage Protection)
The PH-4502C board is powered by 5V. Its analog output pin (`PO`) can output up to 4.5V, exceeding the ESP32's 3.3V maximum ADC threshold. We build a simple, reliable **two-resistor voltage divider**:

```
 PH-4502C Board
 ┌──────────────┐
 │ VCC          ├──────────────────────────────────────► 5V Rail
 │ GND          ├──────────────────────────────────────► GND Rail
 │ PO (Analog)  ├─── [ 10kΩ R1 ] ───┬──────────────────► ESP32 GPIO 34 (ADC1)
 └──────────────┘                   │
                             [ 10kΩ R2 ]
                                    │
                                 GND Rail
```
*Why this works:* When the probe outputs 4.0V, the midpoint voltage seen by GPIO 34 is:
$$V_{out} = 4.0\text{V} \times \frac{10\text{k}\Omega}{10\text{k}\Omega + 10\text{k}\Omega} = 2.0\text{V}$$
This provides complete protection to the ESP32 ADC while retaining full resolution.

### 3.3 Gravity TDS Sensor (With Anti-Interference Power Gating)
Placing both metal TDS electrodes and an analog pH glass bulb in the same body of water causes micro-current ground loops that corrupt pH readings. We solve this elegantly in hardware and firmware:

```
 Gravity TDS Board
 ┌──────────────┐
 │ VCC          ├──────────────────────────────────────► ESP32 GPIO 21 (Switched Power Gate)
 │ GND          ├──────────────────────────────────────► GND Rail
 │ Analog Out   ├──────────────────────────────────────► ESP32 GPIO 32 (ADC1)
 └──────────────┘
```
*Firmware Behavior:*
1. GPIO 21 is set `LOW` (TDS probe completely OFF and unpowered).
2. The ESP32 reads the pH analog probe without electrical interference.
3. GPIO 21 is set `HIGH`, waits 80ms, samples TDS, and turns GPIO 21 back to `LOW`.

---

## 4. Actuator Relay Wiring & Safety Isolation

The 2-Channel Relay module switches high-energy aquarium devices:

```
  ESP32 GPIO 25 ─── [ 1kΩ Resistor ] ───► Relay IN1 (Heater)
  ESP32 GPIO 26 ─── [ 1kΩ Resistor ] ───► Relay IN2 (Dosing Pump)
  5V Rail       ────────────────────────► Relay VCC
  GND Rail      ────────────────────────► Relay GND
```

### High-Voltage / Load Output Terminals:
- **Channel 1 (Heater):**
  - Relay `COM` terminal &rarr; 12V DC (+) or AC Live Wire
  - Relay `NO` (Normally Open) terminal &rarr; Heater Positive lead
- **Channel 2 (pH Peristaltic Dosing Pump):**
  - Relay `COM` terminal &rarr; 12V (+) from 2A Adapter
  - Relay `NO` terminal &rarr; Dosing Pump (+) lead
  - Dosing Pump (-) lead &rarr; 12V GND (Common Ground)

---

## 5. Bench Testing Procedure (Step-by-Step)

1. **Step 1: Check Voltages Before Powering ESP32**
   - Disconnect the ESP32.
   - Plug the 12V adapter into the LM2596.
   - Measure `OUT+` to `OUT-` with your multimeter. Ensure it reads **5.00V**.
2. **Step 2: Plug in ESP32 via USB and Flash Firmware**
   - Open Arduino IDE or PlatformIO.
   - Select Board: `ESP32S3 Dev Module` or `ESP32 Dev Module`.
   - Open `tinyML/esp32_firmware/aquaguard_esp32_s3_firmware.ino`.
   - Flash firmware and open Serial Monitor at **115200 baud**.
3. **Step 3: Verify Autonomous Offline Operation**
   - Submerge temperature probe in water. Observe temperature changes in Serial Monitor.
   - The Serial Monitor will output 1-second cycles:
     ```
     [CYCLE] T: 27.80°C (Δ+0.10) | pH: 7.05 (Δ-0.02) | TDS: 148 (Δ+1) | Status: OPTIMAL | Heater: ON | Pump: OFF
     ```
4. **Step 4: Test Emergency Lockout Interlocks**
   - Dip temperature probe in hot water (>32°C).
   - Observe that the firmware outputs:
     `🚨 [EMERGENCY INTERLOCK] Thermal Runaway detected! Heater Relay FORCED OFF.`
   - Notice the relay clicks OFF immediately without needing any internet connection.
