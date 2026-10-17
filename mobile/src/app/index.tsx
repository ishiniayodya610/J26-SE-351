import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  ActivityIndicator 
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
  Power
} from 'lucide-react-native';
import { api, TelemetryData, FishProfile } from '@/services/api';

export default function TankHealthScreen() {
  const router = useRouter();
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [activeFish, setActiveFish] = useState<FishProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const heaterLocked = telemetry?.gatekeeper.heater_lockout;
  const pumpLocked = telemetry?.gatekeeper.ph_pump_lockout;

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
    >
      {/* Active Species Header Card */}
      <View style={styles.speciesCard}>
        <View style={styles.speciesRow}>
          <View style={styles.fishIconContainer}>
            <Fish color="#00E5FF" size={26} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.speciesTitle}>{activeFish?.common_name || 'Discus Tank'}</Text>
            <Text style={styles.scientificName}>{activeFish?.scientific_name || 'Symphysodon aequifasciatus'}</Text>
          </View>
          <View style={[styles.statusPill, isOptimal ? styles.statusPillOk : styles.statusPillAlert]}>
            {isOptimal ? <ShieldCheck size={14} color="#00E676" /> : <ShieldAlert size={14} color="#FF1744" />}
            <Text style={[styles.statusPillText, isOptimal ? styles.textOk : styles.textAlert]}>
              {telemetry?.system_status || 'OPTIMAL'}
            </Text>
          </View>
        </View>

        {/* Target Profile Bar */}
        <View style={styles.targetBar}>
          <Text style={styles.targetLabel}>Species Targets:</Text>
          <Text style={styles.targetVal}>{activeFish?.water_requirements.temperature_c || 29}°C</Text>
          <Text style={styles.targetDot}>•</Text>
          <Text style={styles.targetVal}>pH {activeFish?.water_requirements.ph || 6.5}</Text>
          <Text style={styles.targetDot}>•</Text>
          <Text style={styles.targetVal}>{activeFish?.water_requirements.tds_ppm || 150} ppm</Text>
        </View>
      </View>

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
      <Text style={styles.sectionTitle}>Edge Actuator Interlocks</Text>
      <View style={styles.actuatorRow}>
        <View style={[styles.actuatorCard, heaterLocked ? styles.actuatorLocked : styles.actuatorOk]}>
          <Flame size={20} color={heaterLocked ? "#FF1744" : "#00E676"} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.actuatorName}>Heater Relay</Text>
            <Text style={[styles.actuatorState, heaterLocked ? styles.textAlert : styles.textOk]}>
              {heaterLocked ? "LOCKED (SAFETY)" : "ENGAGED"}
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
  speciesRow: { flexDirection: 'row', alignItems: 'center' },
  fishIconContainer: {
    backgroundColor: '#0F2C4C',
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  speciesTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  scientificName: { color: '#64748B', fontSize: 13, fontStyle: 'italic', marginTop: 2 },
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
});
