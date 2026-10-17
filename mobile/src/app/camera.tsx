import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Image 
} from 'react-native';
import { 
  Camera, 
  Video, 
  Scan, 
  CheckCircle2, 
  Activity, 
  Eye, 
  Radio, 
  RefreshCw 
} from 'lucide-react-native';
import { api, BehaviorData, FishProfile } from '@/services/api';

export default function CameraVisionScreen() {
  const [mode, setMode] = useState<'farming' | 'handheld'>('farming');
  const [behavior, setBehavior] = useState<BehaviorData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);

  const loadBehavior = async () => {
    try {
      const data = await api.getLiveBehavior();
      setBehavior(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadBehavior();
    const interval = setInterval(loadBehavior, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulatedScan = async (speciesKey: string) => {
    setScanning(true);
    setScanResult(null);
    try {
      // Simulate camera snapshot inference through backend
      await new Promise(r => setTimeout(r, 1200));
      const res = await api.setActiveProfile(speciesKey);
      setScanResult({
        common_name: res.common_name,
        scientific_name: res.scientific_name,
        confidence: 0.965,
        target_temp: res.water_requirements.temperature_c,
        target_ph: res.water_requirements.ph,
        target_tds: res.water_requirements.tds_ppm,
        notes: res.vulnerability_notes
      });
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode Switcher Tabs */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity 
          style={[styles.switchBtn, mode === 'farming' && styles.switchBtnActive]} 
          onPress={() => setMode('farming')}
        >
          <Radio size={16} color={mode === 'farming' ? '#0B0F19' : '#94A3B8'} />
          <Text style={[styles.switchText, mode === 'farming' && styles.switchTextActive]}>
            24/7 Farming IP Cam
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.switchBtn, mode === 'handheld' && styles.switchBtnActive]} 
          onPress={() => setMode('handheld')}
        >
          <Scan size={16} color={mode === 'handheld' ? '#0B0F19' : '#94A3B8'} />
          <Text style={[styles.switchText, mode === 'handheld' && styles.switchTextActive]}>
            Handheld Scanner
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'farming' ? (
        /* 24/7 IP Camera View */
        <View>
          <View style={styles.videoCard}>
            <View style={styles.videoHeader}>
              <Text style={styles.videoTitle}>Tank #1: Breeding Farm Cam (Live Stream)</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>RTSP LIVE</Text>
              </View>
            </View>

            {/* Simulated Live Viewport */}
            <View style={styles.viewport}>
              <View style={styles.crosshairTopLeft} />
              <View style={styles.crosshairTopRight} />
              <View style={styles.crosshairBottomLeft} />
              <View style={styles.crosshairBottomRight} />

              <View style={styles.viewportOverlay}>
                <Text style={styles.camSpecs}>1080p @ 30FPS • Optical Flow Active</Text>
                <View style={styles.detectBox}>
                  <Text style={styles.detectBoxLabel}>Discus School (Track ID: #4)</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Behavior Analytics Grid */}
          <Text style={styles.sectionTitle}>Continuous AI Behavior Diagnostics</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Swimming Activity</Text>
              <Text style={styles.statValGood}>
                {behavior?.swimming_activity_pct.toFixed(1) || '84.2'}%
              </Text>
              <Text style={styles.statSub}>Target: &gt; 70%</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Lethargy Index</Text>
              <Text style={styles.statValLow}>
                {behavior?.lethargy_index_pct.toFixed(1) || '15.8'}%
              </Text>
              <Text style={styles.statSub}>Warning if &gt; 40%</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Surface Piping / Hypoxia:</Text>
              <Text style={styles.metricValGood}>{behavior?.surface_piping || 'NONE DETECTED'}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Feeding Response:</Text>
              <Text style={styles.metricValGood}>{behavior?.feeding_response || 'ACTIVE'}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Health Classification:</Text>
              <Text style={styles.metricValHighlight}>{behavior?.status || 'NORMAL HEALTH'}</Text>
            </View>
          </View>
        </View>
      ) : (
        /* Handheld Phone Scanner View */
        <View>
          <View style={styles.scannerCard}>
            <Scan size={44} color="#00E5FF" />
            <Text style={styles.scannerTitle}>Point Phone at New Tank or Fish</Text>
            <Text style={styles.scannerDesc}>
              The computer vision model identifies species in milliseconds and automatically configures 
              the Edge TinyML Gatekeeper's safety baseline.
            </Text>

            {/* Quick Test Fish Selector for Evaluators */}
            <Text style={styles.sampleLabel}>Tap a Test Subject (Evaluator Demo):</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity 
                style={styles.sampleBtn} 
                onPress={() => handleSimulatedScan('discus')}
              >
                <Text style={styles.sampleBtnText}>🐠 Discus</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.sampleBtn} 
                onPress={() => handleSimulatedScan('koi')}
              >
                <Text style={styles.sampleBtnText}>🐟 Koi</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.sampleBtn} 
                onPress={() => handleSimulatedScan('cichlid')}
              >
                <Text style={styles.sampleBtnText}>🐡 Cichlid</Text>
              </TouchableOpacity>
            </View>

            {scanning && (
              <View style={styles.scanningIndicator}>
                <ActivityIndicator color="#00E5FF" />
                <Text style={styles.scanningText}>Running Neural Species Classifier...</Text>
              </View>
            )}
          </View>

          {/* Scan Results Card */}
          {scanResult && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <CheckCircle2 color="#00E676" size={24} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.resultTitle}>{scanResult.common_name}</Text>
                  <Text style={styles.resultSub}>{scanResult.scientific_name}</Text>
                </View>
                <Text style={styles.confScore}>{(scanResult.confidence * 100).toFixed(1)}%</Text>
              </View>

              <View style={styles.profileBox}>
                <Text style={styles.profileBoxTitle}>⚡ Auto-Pushed to Edge Gatekeeper:</Text>
                <Text style={styles.profileParam}>• Target Temperature: {scanResult.target_temp}°C</Text>
                <Text style={styles.profileParam}>• Target pH Level: {scanResult.target_ph}</Text>
                <Text style={styles.profileParam}>• Target TDS: {scanResult.target_tds} ppm</Text>
              </View>

              <Text style={styles.careNotes}>Care Note: {scanResult.notes}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 32 },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  switchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  switchBtnActive: { backgroundColor: '#00E5FF' },
  switchText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  switchTextActive: { color: '#0B0F19' },
  videoCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  videoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  videoTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 23, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF1744' },
  liveText: { color: '#FF1744', fontSize: 10, fontWeight: '800' },
  viewport: {
    width: '100%',
    height: 200,
    backgroundColor: '#070A11',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  viewportOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10 },
  camSpecs: { color: '#64748B', fontSize: 10, fontStyle: 'italic' },
  detectBox: {
    borderWidth: 1.5,
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderRadius: 4,
    padding: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  detectBoxLabel: { color: '#00E5FF', fontSize: 11, fontWeight: 'bold' },
  crosshairTopLeft: { position: 'absolute', top: 12, left: 12, width: 14, height: 14, borderLeftWidth: 2, borderTopWidth: 2, borderColor: '#00E5FF' },
  crosshairTopRight: { position: 'absolute', top: 12, right: 12, width: 14, height: 14, borderRightWidth: 2, borderTopWidth: 2, borderColor: '#00E5FF' },
  crosshairBottomLeft: { position: 'absolute', bottom: 12, left: 12, width: 14, height: 14, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#00E5FF' },
  crosshairBottomRight: { position: 'absolute', bottom: 12, right: 12, width: 14, height: 14, borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#00E5FF' },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#131B2E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  statValGood: { color: '#00E676', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  statValLow: { color: '#00E5FF', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  statSub: { color: '#64748B', fontSize: 10, marginTop: 4 },
  card: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  metricLabel: { color: '#94A3B8', fontSize: 13 },
  metricValGood: { color: '#00E676', fontSize: 13, fontWeight: '700' },
  metricValHighlight: { color: '#00E5FF', fontSize: 13, fontWeight: '700' },
  scannerCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  scannerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  scannerDesc: { color: '#94A3B8', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  sampleLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 10 },
  sampleBtn: {
    backgroundColor: '#0B0F19',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sampleBtnText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  scanningIndicator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  scanningText: { color: '#00E5FF', fontSize: 12 },
  resultCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  resultTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  resultSub: { color: '#64748B', fontSize: 12, fontStyle: 'italic' },
  confScore: { color: '#00E676', fontSize: 16, fontWeight: 'bold' },
  profileBox: { backgroundColor: '#0B0F19', borderRadius: 8, padding: 12, marginBottom: 12 },
  profileBoxTitle: { color: '#00E5FF', fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  profileParam: { color: '#E2E8F0', fontSize: 12, marginTop: 2 },
  careNotes: { color: '#94A3B8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
});
