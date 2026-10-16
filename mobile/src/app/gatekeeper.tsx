import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  ActivityIndicator 
} from 'react-native';
import { 
  Cpu, 
  Timer, 
  ShieldCheck, 
  ShieldAlert, 
  Zap, 
  Binary, 
  Layers,
  Lock,
  Unlock
} from 'lucide-react-native';
import { api, TelemetryData } from '@/services/api';

export default function GatekeeperScreen() {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const data = await api.getLatestTelemetry();
      setTelemetry(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading && !telemetry) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  const timing = telemetry?.timing_ms || { dsp: 0, classification: 1, anomaly: 0 };
  const conf = telemetry?.ml_confidence || { normal: 0.98, ph_fault: 0.01, temp_fault: 0.0, tds_fault: 0.01 };
  const gatekeeper = telemetry?.gatekeeper || { heater_lockout: false, ph_pump_lockout: false };
  const diagnostics = telemetry?.diagnostics || {};

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
    >
      {/* Proof of TinyML Hardware Execution */}
      <View style={styles.banner}>
        <View style={styles.bannerHeader}>
          <Cpu color="#00E5FF" size={24} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.bannerTitle}>Edge Impulse C++ Neural Runtime</Text>
            <Text style={styles.bannerSubtitle}>TensorFlow Lite Micro • INT8 Quantized Architecture</Text>
          </View>
        </View>

        {/* Latency Chips */}
        <View style={styles.latencyGrid}>
          <View style={styles.latencyBox}>
            <Text style={styles.latencyLabel}>DSP Processing</Text>
            <Text style={styles.latencyVal}>{timing.dsp} ms</Text>
          </View>
          <View style={styles.latencyBox}>
            <Text style={styles.latencyLabel}>Classification</Text>
            <Text style={styles.latencyValHighlight}>{timing.classification} ms</Text>
          </View>
          <View style={styles.latencyBox}>
            <Text style={styles.latencyLabel}>Anomaly Score</Text>
            <Text style={styles.latencyVal}>{timing.anomaly} ms</Text>
          </View>
        </View>
      </View>

      {/* 1-Second Temporal Rate of Change (TinyML Delta Features) */}
      <Text style={styles.sectionTitle}>1-Second Rate-of-Change (Δ Features)</Text>
      <View style={[styles.latencyGrid, { marginBottom: 16 }]}>
        <View style={styles.latencyBox}>
          <Text style={styles.latencyLabel}>Δ Temp / sec</Text>
          <Text style={[styles.latencyVal, Math.abs(telemetry?.deltas?.delta_temp ?? 0) > 2.0 ? styles.textAlert : styles.textHighlight]}>
            {(telemetry?.deltas?.delta_temp ?? 0) >= 0 ? '+' : ''}{(telemetry?.deltas?.delta_temp ?? 0).toFixed(2)}°C
          </Text>
        </View>
        <View style={styles.latencyBox}>
          <Text style={styles.latencyLabel}>Δ pH / sec</Text>
          <Text style={[styles.latencyVal, Math.abs(telemetry?.deltas?.delta_ph ?? 0) > 0.8 ? styles.textAlert : styles.textHighlight]}>
            {(telemetry?.deltas?.delta_ph ?? 0) >= 0 ? '+' : ''}{(telemetry?.deltas?.delta_ph ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.latencyBox}>
          <Text style={styles.latencyLabel}>Δ TDS / sec</Text>
          <Text style={[styles.latencyVal, Math.abs(telemetry?.deltas?.delta_tds ?? 0) > 100 ? styles.textAlert : styles.textHighlight]}>
            {(telemetry?.deltas?.delta_tds ?? 0) >= 0 ? '+' : ''}{Math.round(telemetry?.deltas?.delta_tds ?? 0)} ppm
          </Text>
        </View>
      </View>

      {/* Model Confidence Scores (Softmax Distribution) */}
      <Text style={styles.sectionTitle}>Softmax Class Probability Distribution</Text>
      <View style={styles.card}>
        {Object.entries(conf).map(([label, score]) => {
          const pct = Math.min(Math.max(score * 100, 0), 100);
          const isDominant = score > 0.5;
          const isFault = label !== 'normal' && isDominant;

          return (
            <View key={label} style={styles.probRow}>
              <View style={styles.probLabelRow}>
                <Text style={[styles.probLabel, isDominant && (isFault ? styles.textAlert : styles.textHighlight)]}>
                  {label.toUpperCase()}
                </Text>
                <Text style={[styles.probScore, isDominant && (isFault ? styles.textAlert : styles.textHighlight)]}>
                  {pct.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View 
                  style={[
                    styles.barFill, 
                    { width: `${pct}%` },
                    isFault ? styles.barFault : (isDominant ? styles.barNormal : styles.barSubtle)
                  ]} 
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* Hardware Actuator Safety Intercepts */}
      <Text style={styles.sectionTitle}>Actuator Hardware Intercept States</Text>
      <View style={styles.actuatorRow}>
        <View style={[styles.actCard, gatekeeper.heater_lockout ? styles.actLocked : styles.actUnlocked]}>
          {gatekeeper.heater_lockout ? <Lock color="#FF1744" size={24} /> : <Unlock color="#00E676" size={24} />}
          <Text style={styles.actTitle}>Heater Relay</Text>
          <Text style={[styles.actStatus, gatekeeper.heater_lockout ? styles.textAlert : styles.textOk]}>
            {gatekeeper.heater_lockout ? "LOCKED OUT" : "ENABLED"}
          </Text>
          <Text style={styles.actDesc}>
            {gatekeeper.heater_lockout ? "Thermal runaway prevented" : "Normal temperature control"}
          </Text>
        </View>

        <View style={[styles.actCard, gatekeeper.ph_pump_lockout ? styles.actLocked : styles.actUnlocked]}>
          {gatekeeper.ph_pump_lockout ? <Lock color="#FF1744" size={24} /> : <Unlock color="#00E676" size={24} />}
          <Text style={styles.actTitle}>pH Dosing Pump</Text>
          <Text style={[styles.actStatus, gatekeeper.ph_pump_lockout ? styles.textAlert : styles.textOk]}>
            {gatekeeper.ph_pump_lockout ? "LOCKED OUT" : "ENABLED"}
          </Text>
          <Text style={styles.actDesc}>
            {gatekeeper.ph_pump_lockout ? "Chemical dosing inhibited" : "Normal buffer regulation"}
          </Text>
        </View>
      </View>

      {/* Fault Isolation & Imputation Matrix */}
      <Text style={styles.sectionTitle}>Edge Imputation & Data Cleansing</Text>
      <View style={styles.card}>
        <Text style={styles.matrixDesc}>
          The TinyML Gatekeeper replaces corrupted sensor readings with mathematically grounded baseline anchors 
          before forwarding telemetry to cloud predictive models.
        </Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableCol, { flex: 1.2 }]}>Sensor</Text>
          <Text style={[styles.tableCol, { flex: 1 }]}>Fault Status</Text>
          <Text style={[styles.tableCol, { flex: 1 }]}>Imputation</Text>
        </View>

        {Object.entries(diagnostics).map(([sensor, diag]: [string, any]) => (
          <View key={sensor} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1.2, fontWeight: '700', textTransform: 'capitalize' }]}>
              {sensor}
            </Text>
            <Text style={[styles.tableCell, { flex: 1, color: diag.fault_detected ? '#FF1744' : '#00E676' }]}>
              {diag.fault_detected ? "DETECTED" : "CLEAN"}
            </Text>
            <Text style={[styles.tableCell, { flex: 1, color: diag.imputed ? '#FFB300' : '#64748B' }]}>
              {diag.imputed ? "ACTIVE" : "PASSTHROUGH"}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F19' },
  banner: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    marginBottom: 20,
  },
  bannerHeader: { flexDirection: 'row', alignItems: 'center' },
  bannerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  bannerSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
  latencyGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  latencyBox: {
    flex: 1,
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  latencyLabel: { color: '#64748B', fontSize: 10, fontWeight: '600' },
  latencyVal: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  latencyValHighlight: { color: '#00E5FF', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  card: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  probRow: { marginBottom: 14 },
  probLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  probLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  probScore: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  textHighlight: { color: '#00E5FF' },
  textAlert: { color: '#FF1744' },
  textOk: { color: '#00E676' },
  barTrack: { height: 8, backgroundColor: '#0B0F19', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barNormal: { backgroundColor: '#00E5FF' },
  barFault: { backgroundColor: '#FF1744' },
  barSubtle: { backgroundColor: '#334155' },
  actuatorRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actCard: {
    flex: 1,
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  actUnlocked: { borderColor: 'rgba(0, 230, 118, 0.25)' },
  actLocked: { borderColor: '#FF1744', backgroundColor: 'rgba(255, 23, 68, 0.08)' },
  actTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold', marginTop: 8 },
  actStatus: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  actDesc: { color: '#64748B', fontSize: 10, textAlign: 'center', marginTop: 4 },
  matrixDesc: { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableCol: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
  },
  tableCell: { color: '#F8FAFC', fontSize: 12 },
});
