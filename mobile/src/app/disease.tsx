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
  AlertTriangle, 
  Biohazard, 
  Clock, 
  TrendingUp, 
  CheckCircle, 
  Info,
  ShieldCheck
} from 'lucide-react-native';
import { api, DiseaseRiskData } from '@/services/api';

export default function DiseasePredictionScreen() {
  const [data, setData] = useState<DiseaseRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.getDiseaseRisk();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  const ammoniaHigh = (data?.ammonia_spike_risk_pct || 0) > 40;
  const whitespotHigh = (data?.whitespot_disease_risk_pct || 0) > 40;

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
    >
      {/* Forecast Header Banner */}
      <View style={styles.headerBanner}>
        <View style={styles.headerRow}>
          <Clock size={20} color="#00E5FF" />
          <Text style={styles.headerTitle}>12-Hour Biological Risk Horizon</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          Machine learning time-series model predicting biochemical spikes and parasitic outbreaks.
        </Text>
      </View>

      {/* Dual Risk Cards */}
      <Text style={styles.sectionTitle}>Predictive Risk Indices</Text>
      <View style={styles.riskGrid}>
        {/* Ammonia Surge Card */}
        <View style={[styles.riskCard, ammoniaHigh ? styles.cardAlert : styles.cardOk]}>
          <View style={styles.riskHeader}>
            <Biohazard size={22} color={ammoniaHigh ? "#FF1744" : "#00E676"} />
            <Text style={[styles.riskStatus, ammoniaHigh ? styles.textAlert : styles.textOk]}>
              {data?.ammonia_status || 'STABLE'}
            </Text>
          </View>
          <Text style={styles.riskVal}>{data?.ammonia_spike_risk_pct.toFixed(1) || '12.0'}%</Text>
          <Text style={styles.riskName}>Ammonia Surge Risk</Text>
          <Text style={styles.riskDetail}>Toxicity accelerates if pH shifts upward.</Text>
        </View>

        {/* Whitespot Outbreak Card */}
        <View style={[styles.riskCard, whitespotHigh ? styles.cardAlert : styles.cardOk]}>
          <View style={styles.riskHeader}>
            <AlertTriangle size={22} color={whitespotHigh ? "#FF1744" : "#00E676"} />
            <Text style={[styles.riskStatus, whitespotHigh ? styles.textAlert : styles.textOk]}>
              {data?.disease_status || 'LOW RISK'}
            </Text>
          </View>
          <Text style={styles.riskVal}>{data?.whitespot_disease_risk_pct.toFixed(1) || '8.5'}%</Text>
          <Text style={styles.riskName}>Whitespot (Ich) Risk</Text>
          <Text style={styles.riskDetail}>Triggered by sudden water temperature drops.</Text>
        </View>
      </View>

      {/* Contributing Factors */}
      <Text style={styles.sectionTitle}>Environmental Attribution Factors</Text>
      <View style={styles.factorsCard}>
        {data?.contributing_factors.map((factor, idx) => (
          <View key={idx} style={styles.factorRow}>
            <Info size={16} color="#00E5FF" style={{ marginTop: 2 }} />
            <Text style={styles.factorText}>{factor}</Text>
          </View>
        ))}
      </View>

      {/* Edge Gatekeeper Protection Note (User's Research Value) */}
      <View style={styles.shieldCard}>
        <ShieldCheck size={26} color="#00E5FF" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.shieldTitle}>Protected by Edge TinyML Gatekeeper</Text>
          <Text style={styles.shieldDesc}>
            Corrupted sensor spikes are sanitized at the hardware edge before reaching this predictive model, 
            preventing false emergency alarms and unwarranted tank treatments.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F19' },
  headerBanner: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headerTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold' },
  headerSubtitle: { color: '#94A3B8', fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  riskGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  riskCard: {
    flex: 1,
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  cardOk: { borderColor: '#1E293B' },
  cardAlert: { borderColor: '#FF1744', backgroundColor: 'rgba(255, 23, 68, 0.08)' },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  riskStatus: { fontSize: 11, fontWeight: '800' },
  riskVal: { color: '#F8FAFC', fontSize: 28, fontWeight: 'bold' },
  riskName: { color: '#E2E8F0', fontSize: 13, fontWeight: '600', marginTop: 4 },
  riskDetail: { color: '#64748B', fontSize: 10, marginTop: 4, lineHeight: 14 },
  textOk: { color: '#00E676' },
  textAlert: { color: '#FF1744' },
  factorsCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
    gap: 12,
  },
  factorRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  factorText: { color: '#94A3B8', fontSize: 12, flex: 1, lineHeight: 18 },
  shieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    padding: 16,
  },
  shieldTitle: { color: '#00E5FF', fontSize: 13, fontWeight: 'bold' },
  shieldDesc: { color: '#94A3B8', fontSize: 11, marginTop: 4, lineHeight: 16 },
});
