import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity 
} from 'react-native';
import {
  AlertTriangle, 
  Biohazard, 
  Clock, 
  CheckCircle, 
  Info,
  ShieldCheck,
  RefreshCw,
  Cpu,
  Thermometer,
  Droplets,
  Fish,
  Activity
} from 'lucide-react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import { 
  api, 
  DiseaseRiskData,
  TelemetryData,
  FishProfile,
  predictAmmonia, 
  predictWhiteSpot, 
  PredictionResponse 
} from '@/services/api';

// ---------------------------------------------------------------------------
// Mini Line Chart Component (SVG-based, no extra dependencies)
// ---------------------------------------------------------------------------
interface MiniChartProps {
  dataA: number[];     // ammonia history
  dataB: number[];     // whitespot history
  width?: number;
  height?: number;
}

function MiniLineChart({ dataA, dataB, width = 300, height = 120 }: MiniChartProps) {
  const padTop = 18;
  const padBottom = 22;
  const padLeft = 32;
  const padRight = 12;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const allVals = [...dataA, ...dataB];
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const toPoint = (arr: number[]) =>
    arr.map((v, i) => {
      const x = padLeft + (i / Math.max(arr.length - 1, 1)) * chartW;
      const y = padTop + chartH - ((v - minVal) / range) * chartH;
      return { x, y, v };
    });

  const pointsA = toPoint(dataA);
  const pointsB = toPoint(dataB);
  const lineA = pointsA.map(p => `${p.x},${p.y}`).join(' ');
  const lineB = pointsB.map(p => `${p.x},${p.y}`).join(' ');

  // Y-axis grid lines
  const gridLines = [0, 25, 50, 75, 100].filter(v => v >= minVal && v <= maxVal + 10);

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF6D00' }]} />
          <Text style={styles.legendText}>Ammonia</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#00E5FF' }]} />
          <Text style={styles.legendText}>White Spot</Text>
        </View>
      </View>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {gridLines.map(v => {
          const y = padTop + chartH - ((v - minVal) / range) * chartH;
          return (
            <React.Fragment key={v}>
              <Line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#1E293B" strokeWidth={1} />
              <SvgText x={padLeft - 4} y={y + 4} fill="#64748B" fontSize={9} textAnchor="end">
                {v}%
              </SvgText>
            </React.Fragment>
          );
        })}
        {/* Ammonia line */}
        {dataA.length > 1 && (
          <Polyline points={lineA} fill="none" stroke="#FF6D00" strokeWidth={2} strokeLinejoin="round" />
        )}
        {pointsA.map((p, i) => (
          <Circle key={`a${i}`} cx={p.x} cy={p.y} r={3} fill="#FF6D00" />
        ))}
        {/* Whitespot line */}
        {dataB.length > 1 && (
          <Polyline points={lineB} fill="none" stroke="#00E5FF" strokeWidth={2} strokeLinejoin="round" />
        )}
        {pointsB.map((p, i) => (
          <Circle key={`b${i}`} cx={p.x} cy={p.y} r={3} fill="#00E5FF" />
        ))}
        {/* X-axis label */}
        <SvgText x={width / 2} y={height - 2} fill="#64748B" fontSize={9} textAnchor="middle">
          Recent Predictions
        </SvgText>
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sensor Value Pill Component
// ---------------------------------------------------------------------------
interface SensorPillProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}

function SensorPill({ icon, label, value, unit }: SensorPillProps) {
  return (
    <View style={styles.sensorPill}>
      {icon}
      <View style={{ marginLeft: 8, flex: 1 }}>
        <Text style={styles.sensorLabel}>{label}</Text>
        <Text style={styles.sensorValue}>
          {value} <Text style={styles.sensorUnit}>{unit}</Text>
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Disease Prediction Screen
// ---------------------------------------------------------------------------
export default function DiseasePredictionScreen() {
  const [data, setData] = useState<DiseaseRiskData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [activeSpecies, setActiveSpecies] = useState<FishProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Machine Learning (Hybrid RF + Behavioural Rules) live prediction states
  const [ammoniaPrediction, setAmmoniaPrediction] = useState<PredictionResponse | null>(null);
  const [whitespotPrediction, setWhitespotPrediction] = useState<PredictionResponse | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  // Risk history for the mini chart (last 10 readings)
  const ammoniaHistory = useRef<number[]>([]);
  const whitespotHistory = useRef<number[]>([]);
  const [chartKey, setChartKey] = useState(0); // force re-render

  // Current sensor values used for prediction (pulled from real ESP32 telemetry)
  const sensorValues = {
    temperature: telemetry?.telemetry?.temperature_c ?? 27.5,
    ph: telemetry?.telemetry?.ph ?? 7.8,
    tds: telemetry?.telemetry?.tds_ppm ?? 150.0,
    // Defaults for prediction model inputs (not shown on UI)
    dissolved_oxygen: 6.2,
    turbidity: 3.5,
    nitrate: 15.0,
  };

  const runMlPredictions = useCallback(async () => {
    setPredictLoading(true);
    setPredictError(null);
    try {
      // Call both backend hybrid prediction endpoints simultaneously
      // Behavioural features (swimming_speed, position, posture, fish_count)
      // are auto-enriched by the backend from the latest CV analysis.
      const [ammoniaRes, whitespotRes] = await Promise.all([
        predictAmmonia({
          temperature: sensorValues.temperature,
          dissolved_oxygen: sensorValues.dissolved_oxygen,
          ph: sensorValues.ph,
          turbidity: sensorValues.turbidity,
          nitrate: sensorValues.nitrate,
          tds: sensorValues.tds,
          species: activeSpecies?.species_id,
          auto_enrich: true,
        }),
        predictWhiteSpot({
          temperature: sensorValues.temperature,
          dissolved_oxygen: sensorValues.dissolved_oxygen,
          ph: sensorValues.ph,
          turbidity: sensorValues.turbidity,
          tds: sensorValues.tds,
          species: activeSpecies?.species_id,
          auto_enrich: true,
        }),
      ]);

      setAmmoniaPrediction(ammoniaRes);
      setWhitespotPrediction(whitespotRes);

      // Append to history (keep last 10)
      ammoniaHistory.current = [
        ...ammoniaHistory.current.slice(-9),
        ammoniaRes.risk_probability * 100,
      ];
      whitespotHistory.current = [
        ...whitespotHistory.current.slice(-9),
        whitespotRes.risk_probability * 100,
      ];
      setChartKey(k => k + 1);
    } catch (err: any) {
      console.error('Hybrid Prediction error:', err);
      setPredictError(err.message || 'Failed to connect to prediction endpoints');
    } finally {
      setPredictLoading(false);
    }
  }, [sensorValues.temperature, sensorValues.ph, sensorValues.tds, activeSpecies?.species_id]);

  const loadData = useCallback(async () => {
    try {
      const [riskRes, telRes, speciesRes] = await Promise.allSettled([
        api.getDiseaseRisk(),
        api.getLatestTelemetry(),
        api.getActiveProfile(),
      ]);

      if (riskRes.status === 'fulfilled') setData(riskRes.value);
      if (telRes.status === 'fulfilled') setTelemetry(telRes.value);
      if (speciesRes.status === 'fulfilled') setActiveSpecies(speciesRes.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData().then(() => runMlPredictions());
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData().then(() => runMlPredictions());
  };

  if (loading && !data && !ammoniaPrediction) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  // Derive risk levels from API data (not hardcoded)
  const ammoniaRiskPct = data?.ammonia_spike_risk_pct ?? 0;
  const whitespotRiskPct = data?.whitespot_disease_risk_pct ?? 0;
  const ammoniaHigh = ammoniaRiskPct > 40;
  const whitespotHigh = whitespotRiskPct > 40;

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
          Machine learning models predicting biochemical spikes and parasitic outbreaks from live water parameters.
        </Text>
      </View>

      {/* ── Active Species Banner ── */}
      {activeSpecies && (
        <View style={styles.speciesBanner}>
          <Fish size={20} color="#00E5FF" />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.speciesName}>{activeSpecies.common_name}</Text>
            <Text style={styles.speciesSci}>{activeSpecies.scientific_name}</Text>
          </View>
          <View style={styles.speciesBadge}>
            <Text style={styles.speciesBadgeText}>Active</Text>
          </View>
        </View>
      )}

      {/* ── Current Sensor Values ── */}
      <Text style={styles.sectionTitle}>Current Sensor Readings</Text>
      <View style={styles.sensorGrid}>
        <SensorPill
          icon={<Thermometer size={16} color="#FF6D00" />}
          label="Temperature"
          value={sensorValues.temperature.toFixed(1)}
          unit="°C"
        />
        <SensorPill
          icon={<Activity size={16} color="#00E676" />}
          label="pH Level"
          value={sensorValues.ph.toFixed(1)}
          unit=""
        />
        <SensorPill
          icon={<Droplets size={16} color="#2979FF" />}
          label="TDS"
          value={sensorValues.tds.toFixed(0)}
          unit="ppm"
        />
      </View>

      {/* ── ML Prediction Endpoints Section (Hybrid RF + Behavioural Rules) ── */}
      <View style={styles.sectionHeaderRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Cpu size={18} color="#00E5FF" />
          <Text style={styles.sectionTitle}>Hybrid ML Predictions</Text>
        </View>
        <TouchableOpacity 
          style={styles.refreshBtn} 
          onPress={() => runMlPredictions()} 
          disabled={predictLoading}
        >
          {predictLoading ? (
            <ActivityIndicator size="small" color="#00E5FF" />
          ) : (
            <RefreshCw size={13} color="#00E5FF" />
          )}
          <Text style={styles.refreshBtnText}>Predict</Text>
        </TouchableOpacity>
      </View>

      {predictError && (
        <View style={styles.errorBanner}>
          <AlertTriangle size={16} color="#FF5252" />
          <Text style={styles.errorText}>{predictError}</Text>
        </View>
      )}

      <View style={styles.riskGrid}>
        {/* Ammonia Hybrid Model Card */}
        <View style={[
          styles.riskCard, 
          ammoniaPrediction?.prediction === 'high_risk' ? styles.cardAlert : styles.cardOk
        ]}>
          <View style={styles.riskHeader}>
            <Biohazard 
              size={20} 
              color={ammoniaPrediction?.prediction === 'high_risk' ? "#FF1744" : "#00E676"} 
            />
            <Text style={[
              styles.riskStatus, 
              ammoniaPrediction?.prediction === 'high_risk' ? styles.textAlert : styles.textOk
            ]}>
              {ammoniaPrediction ? ammoniaPrediction.prediction.toUpperCase().replace('_', ' ') : 'LOADING'}
            </Text>
          </View>
          <Text style={styles.riskVal}>
            {ammoniaPrediction ? `${(ammoniaPrediction.risk_probability * 100).toFixed(0)}%` : '--'}
          </Text>
          <Text style={styles.riskName}>Ammonia Spike</Text>
          <Text style={styles.modelTag}>
            {ammoniaPrediction?.model === 'random_forest+rules'
              ? '🧠 RF + Behavioural Rules'
              : `Model: ${ammoniaPrediction?.model || 'random_forest'}`}
          </Text>
          {ammoniaPrediction?.base_rf_score !== undefined && (
            <Text style={styles.riskBreakdown}>
              RF Base: {(ammoniaPrediction.base_rf_score * 100).toFixed(0)}%
              {ammoniaPrediction.behaviour_adjustment !== 0 &&
                ` | Rules: ${ammoniaPrediction.behaviour_adjustment! > 0 ? '+' : ''}${(ammoniaPrediction.behaviour_adjustment! * 100).toFixed(0)}%`}
            </Text>
          )}
          {ammoniaPrediction?.active_features && ammoniaPrediction.active_features.length > 0 && (
            <Text style={styles.activeFeatures}>
              Active: {ammoniaPrediction.active_features.join(', ')}
            </Text>
          )}
          <Text style={styles.riskDetail}>
            {ammoniaPrediction
              ? ammoniaPrediction.adjustment_details && ammoniaPrediction.adjustment_details.length > 0
                ? ammoniaPrediction.adjustment_details[0]
                : `Water params: T=${sensorValues.temperature.toFixed(1)}°C, pH=${sensorValues.ph.toFixed(1)}`
              : 'Waiting for prediction...'}
          </Text>
        </View>

        {/* White Spot Hybrid Model Card */}
        <View style={[
          styles.riskCard, 
          whitespotPrediction?.prediction === 'high_risk' ? styles.cardAlert : styles.cardOk
        ]}>
          <View style={styles.riskHeader}>
            <AlertTriangle 
              size={20} 
              color={whitespotPrediction?.prediction === 'high_risk' ? "#FF1744" : "#00E676"} 
            />
            <Text style={[
              styles.riskStatus, 
              whitespotPrediction?.prediction === 'high_risk' ? styles.textAlert : styles.textOk
            ]}>
              {whitespotPrediction ? whitespotPrediction.prediction.toUpperCase().replace('_', ' ') : 'LOADING'}
            </Text>
          </View>
          <Text style={styles.riskVal}>
            {whitespotPrediction ? `${(whitespotPrediction.risk_probability * 100).toFixed(0)}%` : '--'}
          </Text>
          <Text style={styles.riskName}>White Spot (Ich)</Text>
          <Text style={styles.modelTag}>
            {whitespotPrediction?.model === 'random_forest+rules'
              ? '🧠 RF + Behavioural Rules'
              : `Model: ${whitespotPrediction?.model || 'random_forest'}`}
          </Text>
          {whitespotPrediction?.base_rf_score !== undefined && (
            <Text style={styles.riskBreakdown}>
              RF Base: {(whitespotPrediction.base_rf_score * 100).toFixed(0)}%
              {whitespotPrediction.behaviour_adjustment !== 0 &&
                ` | Rules: ${whitespotPrediction.behaviour_adjustment! > 0 ? '+' : ''}${(whitespotPrediction.behaviour_adjustment! * 100).toFixed(0)}%`}
            </Text>
          )}
          {whitespotPrediction?.active_features && whitespotPrediction.active_features.length > 0 && (
            <Text style={styles.activeFeatures}>
              Active: {whitespotPrediction.active_features.join(', ')}
            </Text>
          )}
          <Text style={styles.riskDetail}>
            {whitespotPrediction
              ? whitespotPrediction.adjustment_details && whitespotPrediction.adjustment_details.length > 0
                ? whitespotPrediction.adjustment_details[0]
                : `Water params: T=${sensorValues.temperature.toFixed(1)}°C, DO=${sensorValues.dissolved_oxygen.toFixed(1)} mg/L`
              : 'Waiting for prediction...'}
          </Text>
        </View>
      </View>

      {/* ── Risk History Chart ── */}
      {(ammoniaHistory.current.length > 0 || whitespotHistory.current.length > 0) && (
        <>
          <Text style={styles.sectionTitle}>Prediction History</Text>
          <View style={styles.chartCard}>
            <MiniLineChart
              key={chartKey}
              dataA={ammoniaHistory.current}
              dataB={whitespotHistory.current}
            />
          </View>
        </>
      )}

      {/* ── Predictive Risk Indices (from disease risk API) ── */}
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
          <Text style={styles.riskVal}>{ammoniaRiskPct.toFixed(1)}%</Text>
          <Text style={styles.riskName}>Ammonia Surge Risk</Text>
          <Text style={styles.riskDetail}>
            {ammoniaHigh
              ? 'Elevated ammonia toxicity — consider water change.'
              : 'Ammonia within safe biological limits for current species.'}
          </Text>
        </View>

        {/* Whitespot Outbreak Card */}
        <View style={[styles.riskCard, whitespotHigh ? styles.cardAlert : styles.cardOk]}>
          <View style={styles.riskHeader}>
            <AlertTriangle size={22} color={whitespotHigh ? "#FF1744" : "#00E676"} />
            <Text style={[styles.riskStatus, whitespotHigh ? styles.textAlert : styles.textOk]}>
              {data?.disease_status || 'LOW RISK'}
            </Text>
          </View>
          <Text style={styles.riskVal}>{whitespotRiskPct.toFixed(1)}%</Text>
          <Text style={styles.riskName}>Whitespot (Ich) Risk</Text>
          <Text style={styles.riskDetail}>
            {whitespotHigh
              ? 'Temperature instability increasing Ich outbreak risk.'
              : 'Thermal conditions stable — low parasite risk.'}
          </Text>
        </View>
      </View>

      {/* ── Contributing Factors ── */}
      <Text style={styles.sectionTitle}>Environmental Attribution Factors</Text>
      <View style={styles.factorsCard}>
        {data?.contributing_factors && data.contributing_factors.length > 0 ? (
          data.contributing_factors.map((factor, idx) => (
            <View key={idx} style={styles.factorRow}>
              <Info size={16} color="#00E5FF" style={{ marginTop: 2 }} />
              <Text style={styles.factorText}>{factor}</Text>
            </View>
          ))
        ) : (
          <View style={styles.factorRow}>
            <CheckCircle size={16} color="#00E676" style={{ marginTop: 2 }} />
            <Text style={styles.factorText}>All parameters within safe limits.</Text>
          </View>
        )}
      </View>

      {/* ── Edge Gatekeeper Protection Note (User's Research Value) ── */}
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F19' },

  // Header Banner
  headerBanner: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headerTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold' },
  headerSubtitle: { color: '#94A3B8', fontSize: 12, lineHeight: 18 },

  // Species Banner
  speciesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.06)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    marginBottom: 16,
  },
  speciesName: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  speciesSci: { color: '#64748B', fontSize: 11, fontStyle: 'italic', marginTop: 1 },
  speciesBadge: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  speciesBadgeText: { color: '#00E676', fontSize: 10, fontWeight: '700' },

  // Sensor Grid
  sensorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  sensorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131B2E',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    width: '48%',
    minWidth: 140,
    flexGrow: 1,
  },
  sensorLabel: { color: '#64748B', fontSize: 10, fontWeight: '600' },
  sensorValue: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginTop: 1 },
  sensorUnit: { color: '#64748B', fontSize: 11, fontWeight: '500' },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  refreshBtnText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Errors
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderColor: '#FF5252',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#FF8A80',
    fontSize: 11,
    flex: 1,
  },

  // Risk Cards
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
  riskVal: { color: '#F8FAFC', fontSize: 26, fontWeight: 'bold' },
  riskName: { color: '#E2E8F0', fontSize: 13, fontWeight: '600', marginTop: 4 },
  modelTag: { color: '#38BDF8', fontSize: 10, fontWeight: '600', marginTop: 4 },
  riskBreakdown: { color: '#A78BFA', fontSize: 9, fontWeight: '600', marginTop: 3 },
  activeFeatures: { color: '#64748B', fontSize: 8, fontWeight: '500', marginTop: 2, fontStyle: 'italic' },
  riskDetail: { color: '#64748B', fontSize: 10, marginTop: 4, lineHeight: 14 },
  textOk: { color: '#00E676' },
  textAlert: { color: '#FF1744' },

  // Chart
  chartCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
    alignItems: 'center',
  },
  chartContainer: {
    width: '100%',
    alignItems: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: '#94A3B8', fontSize: 10 },

  // Factors
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

  // Shield
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
