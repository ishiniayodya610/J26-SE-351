import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  ActivityIndicator,
  Alert 
} from 'react-native';
import { 
  SlidersHorizontal, 
  Send, 
  Sparkles, 
  CheckCircle, 
  AlertOctagon, 
  Flame, 
  Gauge, 
  Globe 
} from 'lucide-react-native';
import { api, setCustomApiHost, API_BASE_URL } from '@/services/api';

export default function TestbedScreen() {
  const [temp, setTemp] = useState('29.0');
  const [ph, setPh] = useState('6.5');
  const [tds, setTds] = useState('150');
  const [customHost, setCustomHost] = useState(API_BASE_URL);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any | null>(null);

  const handleSimulate = async (tVal?: number, pVal?: number, dVal?: number) => {
    const t = tVal !== undefined ? tVal : parseFloat(temp);
    const p = pVal !== undefined ? pVal : parseFloat(ph);
    const d = dVal !== undefined ? dVal : parseFloat(tds);

    if (isNaN(t) || isNaN(p) || isNaN(d)) {
      Alert.alert('Invalid Input', 'Please enter valid numerical sensor readings.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.simulateInput(t, p, d);
      setLastResult(res);
      setTemp(t.toString());
      setPh(p.toString());
      setTds(d.toString());
    } catch (err: any) {
      Alert.alert('Simulation Error', err.message || 'Failed to communicate with Edge node');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyHost = () => {
    setCustomApiHost(customHost);
    Alert.alert('Host Updated', `API endpoint set to: ${customHost}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Network Configuration for Evaluator Demo */}
      <View style={styles.hostCard}>
        <View style={styles.hostHeader}>
          <Globe size={18} color="#00E5FF" />
          <Text style={styles.hostTitle}>Gateway Network Address</Text>
        </View>
        <Text style={styles.hostDesc}>
          If presenting on a physical phone over Wi-Fi, enter your laptop's local IP (e.g. 192.168.1.50):
        </Text>
        <View style={styles.hostInputRow}>
          <TextInput
            style={styles.hostInput}
            value={customHost}
            onChangeText={setCustomHost}
            placeholder="http://192.168.1.X:8000"
            placeholderTextColor="#475569"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.applyBtn} onPress={handleApplyHost}>
            <Text style={styles.applyBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 1-Click Preset Fault Scenarios */}
      <Text style={styles.sectionTitle}>1-Click Evaluator Test Scenarios</Text>
      <View style={styles.scenarioGrid}>
        <TouchableOpacity 
          style={[styles.scenarioBtn, styles.btnNormal]} 
          onPress={() => handleSimulate(29.0, 6.5, 150)}
        >
          <CheckCircle size={18} color="#00E676" />
          <Text style={styles.scenarioText}>1. Normal Tank Baseline</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.scenarioBtn, styles.btnFault]} 
          onPress={() => handleSimulate(29.0, 2.2, 150)}
        >
          <AlertOctagon size={18} color="#FF1744" />
          <Text style={styles.scenarioText}>2. Inject pH Probe Fault (2.2)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.scenarioBtn, styles.btnFault]} 
          onPress={() => handleSimulate(42.0, 6.5, 150)}
        >
          <Flame size={18} color="#FF9100" />
          <Text style={styles.scenarioText}>3. Thermal Runaway (42°C)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.scenarioBtn, styles.btnFault]} 
          onPress={() => handleSimulate(29.0, 6.5, 880)}
        >
          <Gauge size={18} color="#7C4DFF" />
          <Text style={styles.scenarioText}>4. Severe TDS Drift (880 ppm)</Text>
        </TouchableOpacity>
      </View>

      {/* Manual Fine-Tuning Inputs */}
      <Text style={styles.sectionTitle}>Manual Sensor Signal Generator</Text>
      <View style={styles.card}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Simulated Temperature (°C):</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={temp}
            onChangeText={setTemp}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Simulated pH Level:</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={ph}
            onChangeText={setPh}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Simulated TDS (ppm):</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={tds}
            onChangeText={setTds}
          />
        </View>

        <TouchableOpacity 
          style={styles.transmitBtn} 
          onPress={() => handleSimulate()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0B0F19" />
          ) : (
            <>
              <Send size={18} color="#0B0F19" />
              <Text style={styles.transmitText}>Transmit to Edge TinyML Model</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Live Edge Reaction Result */}
      {lastResult && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>⚡ Edge Node Output (C++ Runtime):</Text>
          <Text style={styles.resultLine}>• Classification: <Text style={{ color: '#00E5FF' }}>{lastResult.system_status}</Text></Text>
          <Text style={styles.resultLine}>• DSP Latency: {lastResult.timing_ms.dsp} ms | Neural Latency: {lastResult.timing_ms.classification} ms</Text>
          <Text style={styles.resultLine}>• Heater Relay: {lastResult.gatekeeper.heater_lockout ? '🔴 LOCKED' : '🟢 ACTIVE'}</Text>
          <Text style={styles.resultLine}>• pH Dosing Pump: {lastResult.gatekeeper.ph_pump_lockout ? '🔴 LOCKED' : '🟢 ACTIVE'}</Text>
          <Text style={styles.resultLine}>• Imputed Safe pH: {lastResult.telemetry.ph.toFixed(2)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 40 },
  hostCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  hostHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  hostTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold' },
  hostDesc: { color: '#94A3B8', fontSize: 11, marginBottom: 12, lineHeight: 16 },
  hostInputRow: { flexDirection: 'row', gap: 10 },
  hostInput: {
    flex: 1,
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#00E5FF',
    fontSize: 13,
  },
  applyBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: { color: '#0B0F19', fontWeight: 'bold', fontSize: 13 },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  scenarioGrid: { gap: 10, marginBottom: 20 },
  scenarioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  btnNormal: { backgroundColor: '#131B2E', borderColor: 'rgba(0, 230, 118, 0.3)' },
  btnFault: { backgroundColor: '#131B2E', borderColor: 'rgba(255, 23, 68, 0.3)' },
  scenarioText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  inputGroup: { marginBottom: 14 },
  label: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  transmitBtn: {
    flexDirection: 'row',
    backgroundColor: '#00E5FF',
    borderRadius: 10,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  transmitText: { color: '#0B0F19', fontSize: 14, fontWeight: 'bold' },
  resultBox: {
    backgroundColor: '#0B0F19',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  resultTitle: { color: '#00E5FF', fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  resultLine: { color: '#E2E8F0', fontSize: 12, marginTop: 4, lineHeight: 18 },
});
