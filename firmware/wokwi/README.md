# AquaGuard ESP32 Wokwi Hardware Simulation

This directory contains the virtual circuit schematic for simulating the complete AquaGuard ESP32-S3 IoT controller, OLED display, and relays in **Wokwi** without physical hardware.

---

## 🛠️ How to Run in Browser (Zero Install)

1. Open [Wokwi ESP32 Simulator](https://wokwi.com/projects/new/esp32).
2. Click on the **diagram.json** tab in Wokwi and paste the contents of [`diagram.json`](file:///Users/sandunudayakantha/research/J26-SE-351/firmware/wokwi/diagram.json).
3. Click on the **sketch.ino** tab and paste the contents of [`esp32_firmware.ino`](file:///Users/sandunudayakantha/research/J26-SE-351/firmware/esp32_firmware/esp32_firmware.ino).
4. Click the **Play (▶️)** button.

### 🎮 What You Can Interact With:
* **SSD1306 OLED Screen**: Watches live water parameters, actuator states, and Gatekeeper health status update in real time.
* **Potentiometer 1 (pH Probe)**: Rotate the dial to simulate normal or spiking pH changes.
* **Potentiometer 2 (TDS Probe)**: Rotate to adjust dissolved conductivity.
* **Red Pushbutton**: Press to simulate the Wi-Fi NVS reset button.
* **Heater & Pump Relays**: Visual LED indicators light up when the controller turns actuators ON and OFF.
