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
  Sparkles, 
  Cpu, 
  BarChart3, 
  CheckSquare, 
  HelpCircle,
  Lightbulb
} from 'lucide-react-native';
import { api, XAIExplanationData } from '@/services/api';

export default function XAIHubScreen() {
  const [data, setData] = useState<XAIExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.getXAIExplanation();
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
    const interval = setInterval(loadData, 2500);
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

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
    >
      {/* Root Status Banner */}
      <View style={styles.banner}>
        <View style={styles.headerRow}>
          <Sparkles color="#00E5FF" size={20} />
          <Text style={styles.bannerTitle}>Explainable AI (XAI) Synthesis</Text>
        </View>
        <Text style={styles.headlineText}>{data?.tank_status_headline || 'Analyzing System...'}</Text>
      </View>

      {/* Natural Language Root Cause Explanation */}
      <Text style={styles.sectionTitle}>Root-Cause Causality Analysis</Text>
      <View style={styles.card}>
        <Text style={styles.explanationText}>
          {data?.primary_explanation || 'All multi-modal AI models are operating normally.'}
        </Text>
      </View>

      {/* TinyML Edge Gatekeeper Role Card */}
      <Text style={styles.sectionTitle}>Edge TinyML Intercept Role</Text>
      <View style={styles.edgeRoleCard}>
        <Cpu color="#00E5FF" size={24} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.edgeRoleTitle}>Physical Actuation Protection</Text>
          <Text style={styles.edgeRoleDesc}>
            {data?.edge_gatekeeper_role || 'Continuous edge monitoring active.'}
          </Text>
        </View>
      </View>

      {/* Feature Attribution Weights (SHAP / LIME style) */}
      <Text style={styles.sectionTitle}>Feature Attribution & SHAP Weights</Text>
      <View style={styles.card}>
        <Text style={styles.attrIntro}>
          Relative influence of each telemetry channel on current system classification:
        </Text>

        {data?.attributions.map((attr, idx) => {
          const pct = Math.round(attr.importance_weight * 100);
          return (
            <View key={idx} style={styles.attrRow}>
              <View style={styles.attrHeader}>
                <Text style={styles.attrName}>{attr.feature_name}</Text>
                <Text style={styles.attrWeight}>{pct}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.attrDesc}>{attr.description}</Text>
            </View>
          );
        })}
      </View>

      {/* Prescriptive Recommended Actions */}
      <Text style={styles.sectionTitle}>Prescriptive Operator Guidelines</Text>
      <View style={styles.card}>
        {data?.recommended_actions.map((act, idx) => (
          <View key={idx} style={styles.actionRow}>
            <CheckSquare size={16} color="#00E676" style={{ marginTop: 2 }} />
            <Text style={styles.actionText}>{act}</Text>
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
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bannerTitle: { color: '#00E5FF', fontSize: 13, fontWeight: '700' },
  headlineText: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', lineHeight: 22 },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  card: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  explanationText: { color: '#E2E8F0', fontSize: 13, lineHeight: 20 },
  edgeRoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    padding: 16,
    marginBottom: 20,
  },
  edgeRoleTitle: { color: '#00E5FF', fontSize: 13, fontWeight: 'bold' },
  edgeRoleDesc: { color: '#94A3B8', fontSize: 12, marginTop: 4, lineHeight: 18 },
  attrIntro: { color: '#64748B', fontSize: 11, marginBottom: 14 },
  attrRow: { marginBottom: 14 },
  attrHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  attrName: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  attrWeight: { color: '#00E5FF', fontSize: 13, fontWeight: 'bold' },
  track: { height: 6, backgroundColor: '#0B0F19', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#00E5FF', borderRadius: 3 },
  attrDesc: { color: '#64748B', fontSize: 11, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  actionText: { color: '#E2E8F0', fontSize: 13, flex: 1, lineHeight: 18 },
});
