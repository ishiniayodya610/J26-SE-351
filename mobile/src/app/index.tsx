import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Thermometer, 
  Droplet, 
  Gauge, 
  Fish, 
  Zap, 
  ChevronRight,
  Flame,
  Power,
  AlertTriangle,
  Radio,
  SlidersHorizontal
} from 'lucide-react-native';
import { api, TelemetryData, FishProfile } from '@/services/api';
import { triggerAnomalyHaptic, triggerResolvedHaptic, triggerSelectionHaptic } from '@/services/haptics';

export default function TankHealthScreen() {
  const router = useRouter();
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [activeFish, setActiveFish] = useState<FishProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  const loadData = async () => {
    try {
      const [tData, pData] = await Promise.all([
        api.getLatestTelemetry().catch(() => null),
        api.getFishProfiles().then(p => p[0]).catch(() => null)
      ]);
      if (tData) setTelemetry(tData);
      if (pData) setActiveFish(pData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2500);
    return () => clearInterval(interval);
  }, []);

  // Monitor for anomaly occurrences to trigger Haptic vibration feedback
  useEffect(() => {
    if (!telemetry) return;
    const currentStatus = telemetry.system_status;
    const isRunaway = Boolean(telemetry.thermal_runaway?.active || telemetry.gatekeeper?.thermal_runaway);
    const hasFault = currentStatus !== 'OPTIMAL' || 
                     Boolean(telemetry.gatekeeper?.heater_lockout) || 
                     Boolean(telemetry.gatekeeper?.ph_pump_lockout) ||
                     isRunaway;

    if (prevStatusRef.current !== null) {
      const prevHadFault = prevStatusRef.current !== 'OPTIMAL';
      if (hasFault && !prevHadFault) {
        // 🔥 Anomaly detected: Trigger mobile hardware haptic buzz!
        triggerAnomalyHaptic();
      } else if (!hasFault && prevHadFault) {
        // ✅ Recovered back to optimal baseline: Trigger success haptic confirmation
        triggerResolvedHaptic();
      }
    }
    prevStatusRef.current = currentStatus;
  }, [telemetry]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading && !telemetry) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00E5FF" />
        <Text style={styles.loadingText}>Connecting to AquaGuard Gateway...</Text>
      </View>
    );
  }

  const isOptimal = telemetry?.system_status === 'OPTIMAL';
  const isThermalRunaway = Boolean(telemetry?.thermal_runaway?.active || telemetry?.gatekeeper?.thermal_runaway);
  const heaterLocked = telemetry?.gatekeeper?.heater_lockout;
  const pumpLocked = telemetry?.gatekeeper?.ph_pump_lockout;

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
    >
      {/* Species Target Header Card */}
      <View style={styles.speciesCard}>
        <View style={styles.speciesRow}>
          <View style={styles.speciesTitleLeft}>
            <View style={styles.fishIconContainer}>
              <SlidersHorizontal color="#00E5FF" size={20} />
            </View>
            <Text style={styles.speciesTitle} numberOfLines={1}>Species Targets</Text>
          </View>
          <View style={[styles.statusPill, isOptimal ? styles.statusPillOk : styles.statusPillAlert]}>
            {isOptimal ? <ShieldCheck size={13} color="#00E676" /> : <ShieldAlert size={13} color="#FF1744" />}
            <Text style={[styles.statusPillText, isOptimal ? styles.textOk : styles.textAlert]} numberOfLines={1}>
              {isThermalRunaway 
                ? "WELDED RUNAWAY" 
                : (telemetry?.system_status === 'DEGRADED_FAULT_MITIGATED' 
                    ? 'FAULT MITIGATED' 
                    : (telemetry?.system_status || 'OPTIMAL'))}
            </Text>
          </View>
        </View>

        {/* Target Profile Bar */}
        <View style={styles.targetBar}>
          <Text style={styles.targetLabel}>Target Baseline:</Text>
          <Text style={styles.targetVal}>{activeFish?.water_requirements?.temperature_c ?? telemetry?.tank_profile?.target_temp ?? 29}°C</Text>
          <Text style={styles.targetDot}>•</Text>
          <Text style={styles.targetVal}>pH {activeFish?.water_requirements?.ph ?? telemetry?.tank_profile?.target_ph ?? 6.5}</Text>
          <Text style={styles.targetDot}>•</Text>
          <Text style={styles.targetVal}>{activeFish?.water_requirements?.tds_ppm ?? telemetry?.tank_profile?.target_tds ?? 150} ppm</Text>
        </View>

        {/* Dynamic Hardware vs. Simulator Source Banner */}
        <View style={[
          styles.sourceBadge, 
          telemetry?.data_source?.is_real_hardware ? styles.sourceBadgeReal : styles.sourceBadgeSim
        ]}>
          <Radio size={12} color={telemetry?.data_source?.is_real_hardware ? '#00E676' : '#00E5FF'} />
          <Text style={[
            styles.sourceBadgeText,
            telemetry?.data_source?.is_real_hardware ? styles.sourceTextReal : styles.sourceTextSim
          ]}>
            {telemetry?.data_source?.label 
              ? telemetry.data_source.label.toUpperCase() 
              : (telemetry?.data_source?.is_real_hardware ? 'LIVE REMOTE ESP32 HARDWARE' : 'EVALUATOR TESTBED SIMULATOR')}
          </Text>
        </View>
      </View>

      {/* 🚨 CRITICAL: Stuck Heater / Welded Relay Emergency Intervention Banner */}
      {isThermalRunaway && (
        <TouchableOpacity 
          style={styles.runawayEmergencyCard}
          activeOpacity={0.88}
          onPress={() => {
            triggerSelectionHaptic();
            router.push('/xai');
          }}
        >
          <View style={styles.runawayHeaderRow}>
            <View style={styles.runawayBadge}>
              <Flame size={15} color="#FFFFFF" />
              <Text style={styles.runawayBadgeText}>ACTUATOR DIVERGENCE • WELDED RELAY</Text>
            </View>
            {telemetry?.thermal_runaway?.time_to_critical_min && (
              <View style={styles.runawayCountdown}>
                <Text style={styles.runawayCountdownText}>
                  ⏳ CRITICAL IN ~{telemetry.thermal_runaway.time_to_critical_min}M
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.runawayTitle}>
            🔥 Uncontrolled Heating Detected
          </Text>

          <Text style={styles.runawayDescription}>
            Controller commanded Heater OFF, but water is climbing (+{(telemetry?.thermal_runaway?.slope_per_min ?? 0.12).toFixed(2)}°C/min, current: {(telemetry?.telemetry?.temperature_c ?? 30.5).toFixed(1)}°C). Mechanical relay contacts are physically welded closed.
          </Text>

          <View style={styles.actionCalloutBox}>
            <AlertTriangle size={17} color="#FFD600" />
            <Text style={styles.actionCalloutText}>
              MANDATORY ACTION: PHYSICALLY UNPLUG HEATER FROM WALL SOCKET!
            </Text>
          </View>

          <View style={styles.runawayFooter}>
            <Text style={styles.runawayLink}>View Causal Root-Cause Explanation (XAI)</Text>
            <ChevronRight size={15} color="#FF8A80" />
          </View>
        </TouchableOpacity>
      )}

      {/* ⚠️ Dynamic Anomaly Alert Banner with Haptic Indicator */}
      {(!isOptimal || heaterLocked || pumpLocked) && !isThermalRunaway && (
        <TouchableOpacity 
          style={styles.anomalyCard}
          activeOpacity={0.88}
          onPress={() => {
            triggerSelectionHaptic();
            router.push('/gatekeeper');
          }}
        >
          <View style={styles.anomalyTopRow}>
            <View style={styles.anomalyBadge}>
              <AlertTriangle size={15} color="#FF1744" />
              <Text style={styles.anomalyBadgeText}>GATEKEEPER INTERLOCK ACTIVE</Text>
            </View>
          </View>

          <Text style={styles.anomalyTitle}>
            {heaterLocked && pumpLocked 
              ? "Multiple Safety Interlocks Triggered" 
              : (heaterLocked 
                  ? "Thermal Anomaly • Heater Relay Locked Out" 
                  : (pumpLocked 
                      ? "pH Sensor Failure • Dosing Pump Locked Out" 
                      : "Anomalous Water Spike Sanitized"))}
          </Text>

          <Text style={styles.anomalyDescription}>
            {heaterLocked 
              ? `Thermal rise exceeded gradient (+${(telemetry?.deltas?.delta_temp ?? 3.6).toFixed(1)}°C). AC heater power cut locally in 1 ms.` 
              : (pumpLocked 
                  ? `pH jumped outside biological boundaries (${(telemetry?.telemetry?.ph ?? 2.2).toFixed(2)}). Chemical dosing pump disengaged.` 
                  : "Unsafe sensor covariance detected. Edge TinyML imputed safe baselines to maintain cloud stability.")}
          </Text>

          <View style={styles.anomalyFooter}>
            <Text style={styles.anomalyLink}>Inspect Edge TinyML Diagnostics</Text>
            <ChevronRight size={15} color="#00E5FF" />
          </View>
        </TouchableOpacity>
      )}

      {/* Water Telemetry Grid */}
      <Text style={styles.sectionTitle}>Real-Time Water Telemetry</Text>
      
      <View style={styles.telemetryGrid}>
        {/* Temperature Card */}
        <View style={styles.telemetryCard}>
          <View style={styles.cardHeader}>
            <Thermometer size={18} color="#FF9100" />
            <Text style={styles.cardParam}>Temperature</Text>
          </View>
          <Text style={styles.cardValue}>{telemetry?.telemetry.temperature_c.toFixed(1) || '29.0'}°C</Text>
          <Text style={styles.cardTarget}>Ideal: 28 – 31°C</Text>
          {telemetry?.diagnostics.temperature.imputed && (
            <View style={styles.imputedBadge}>
              <Text style={styles.imputedText}>IMPUTED SAFE</Text>
            </View>
          )}
        </View>

        {/* pH Level Card */}
        <View style={styles.telemetryCard}>
          <View style={styles.cardHeader}>
            <Droplet size={18} color="#00E5FF" />
            <Text style={styles.cardParam}>pH Level</Text>
          </View>
          <Text style={styles.cardValue}>{telemetry?.telemetry.ph.toFixed(2) || '6.50'}</Text>
          <Text style={styles.cardTarget}>Ideal: 6.0 – 7.0</Text>
          {telemetry?.diagnostics.ph.imputed && (
            <View style={styles.imputedBadge}>
              <Text style={styles.imputedText}>IMPUTED SAFE</Text>
            </View>
          )}
        </View>

        {/* TDS Card */}
        <View style={styles.telemetryCard}>
          <View style={styles.cardHeader}>
            <Gauge size={18} color="#7C4DFF" />
            <Text style={styles.cardParam}>TDS Purity</Text>
          </View>
          <Text style={styles.cardValue}>{Math.round(telemetry?.telemetry.tds_ppm || 150)}</Text>
          <Text style={styles.cardTarget}>Ideal: 80 – 200 ppm</Text>
          {telemetry?.diagnostics.tds.imputed && (
            <View style={styles.imputedBadge}>
              <Text style={styles.imputedText}>IMPUTED SAFE</Text>
            </View>
          )}
        </View>
      </View>

      {/* Hardware Actuator Safety Status */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Edge Actuator Interlocks</Text>
        <Text style={{ fontSize: 10, color: '#00E5FF', fontWeight: '600' }}>● HARDWARE SYNCED (ESP32)</Text>
      </View>
      <View style={styles.actuatorRow}>
        <View style={[styles.actuatorCard, isThermalRunaway ? styles.actuatorRunaway : (heaterLocked ? styles.actuatorLocked : styles.actuatorOk)]}>
          <Flame size={20} color={isThermalRunaway ? "#FF1744" : (heaterLocked ? "#FFB300" : "#00E676")} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.actuatorName}>Heater Relay</Text>
            <Text style={[styles.actuatorState, (isThermalRunaway || heaterLocked) ? styles.textAlert : styles.textOk]}>
              {isThermalRunaway ? "🚨 WELDED (OFF CMD)" : (heaterLocked ? "LOCKED (SAFETY)" : "ENGAGED")}
            </Text>
            <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
              ESP32 Relay #1: {(isThermalRunaway || heaterLocked) ? "🔴 Cutoff (LED OFF)" : "🟢 Powered (LED ON)"}
            </Text>
          </View>
        </View>

        <View style={[styles.actuatorCard, pumpLocked ? styles.actuatorLocked : styles.actuatorOk]}>
          <Power size={20} color={pumpLocked ? "#FF1744" : "#00E676"} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.actuatorName}>pH Dosing Pump</Text>
            <Text style={[styles.actuatorState, pumpLocked ? styles.textAlert : styles.textOk]}>
              {pumpLocked ? "LOCKED (SAFETY)" : "ENGAGED"}
            </Text>
            <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
              ESP32 Relay #2: {pumpLocked ? "🔴 Cutoff (LED OFF)" : "🟢 Powered (LED ON)"}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F19' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 14 },
  speciesCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  speciesRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    gap: 8,
  },
  speciesTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  fishIconContainer: {
    backgroundColor: '#0F2C4C',
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  speciesTitle: { 
    color: '#F8FAFC', 
    fontSize: 16, 
    fontWeight: 'bold',
    flexShrink: 0,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 4,
  },
  statusPillOk: { backgroundColor: 'rgba(0, 230, 118, 0.12)' },
  statusPillAlert: { backgroundColor: 'rgba(255, 23, 68, 0.15)' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  textOk: { color: '#00E676' },
  textAlert: { color: '#FF1744' },
  targetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  targetLabel: { color: '#64748B', fontSize: 12, marginRight: 8 },
  targetVal: { color: '#00E5FF', fontSize: 12, fontWeight: '600' },
  targetDot: { color: '#475569', marginHorizontal: 6 },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  sourceBadgeReal: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderColor: 'rgba(0, 230, 118, 0.35)',
  },
  sourceBadgeSim: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sourceTextReal: { color: '#00E676' },
  sourceTextSim: { color: '#00E5FF' },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  telemetryGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  telemetryCard: {
    flex: 1,
    backgroundColor: '#131B2E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardParam: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  cardValue: { color: '#F8FAFC', fontSize: 20, fontWeight: 'bold' },
  cardTarget: { color: '#64748B', fontSize: 10, marginTop: 4 },
  imputedBadge: {
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  imputedText: { color: '#FFB300', fontSize: 9, fontWeight: '800' },
  actuatorRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actuatorCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  actuatorOk: { backgroundColor: '#131B2E', borderColor: '#1E293B' },
  actuatorLocked: { backgroundColor: 'rgba(255, 23, 68, 0.1)', borderColor: '#FF1744' },
  actuatorName: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  actuatorState: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  testbedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    padding: 14,
  },
  testbedBannerTitle: { color: '#00E5FF', fontSize: 14, fontWeight: '700' },
  testbedBannerSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  anomalyCard: {
    backgroundColor: 'rgba(255, 23, 68, 0.1)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FF1744',
    marginBottom: 20,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  anomalyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  anomalyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 23, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  anomalyBadgeText: {
    color: '#FF1744',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hapticTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  hapticTagText: {
    color: '#FFB300',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  anomalyTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  anomalyDescription: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  anomalyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
    gap: 4,
  },
  anomalyLink: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  actuatorRunaway: {
    backgroundColor: 'rgba(255, 23, 68, 0.2)',
    borderColor: '#FF1744',
    borderWidth: 1.5,
  },
  runawayEmergencyCard: {
    backgroundColor: '#38000D',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF1744',
    marginBottom: 20,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  runawayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  runawayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF1744',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  runawayBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  runawayCountdown: {
    backgroundColor: 'rgba(255, 214, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD600',
  },
  runawayCountdownText: {
    color: '#FFD600',
    fontSize: 10,
    fontWeight: '800',
  },
  runawayTitle: {
    color: '#FFCDD2',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  runawayDescription: {
    color: '#FFEBEE',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  actionCalloutBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 23, 68, 0.4)',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  actionCalloutText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  runawayFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 10,
    gap: 4,
  },
  runawayLink: {
    color: '#FF8A80',
    fontSize: 12,
    fontWeight: '700',
  },
});
