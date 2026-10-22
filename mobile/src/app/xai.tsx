import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert
} from 'react-native';
import { 
  Sparkles, 
  Cpu, 
  BarChart3, 
  CheckSquare, 
  Database,
  Layers,
  Fish,
  Droplets,
  Edit3,
  Plus,
  Minus,
  Save,
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react-native';
import { api, XAIExplanationData, TankConfig } from '@/services/api';

const AVAILABLE_SPECIES = ['Guppy', 'Swordtail', 'Betta'];

export default function XAIHubScreen() {
  const [data, setData] = useState<XAIExplanationData | null>(null);
  const [tankConfig, setTankConfig] = useState<TankConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal edit state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editVolume, setEditVolume] = useState('120');
  const [editFishCount, setEditFishCount] = useState(8);
  const [editSpecies, setEditSpecies] = useState<string[]>(['Guppy', 'Swordtail', 'Betta']);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [xaiRes, tankRes] = await Promise.allSettled([
        api.getXAIExplanation(),
        api.getTankConfig(5),
      ]);

      if (xaiRes.status === 'fulfilled') setData(xaiRes.value);
      if (tankRes.status === 'fulfilled') {
        setTankConfig(tankRes.value);
        setEditVolume(String(tankRes.value.volume_liters));
        setEditFishCount(tankRes.value.fish_count);
        setEditSpecies(tankRes.value.fish_types);
      }
    } catch (err) {
      console.error('Error loading XAI or Tank config:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenEdit = () => {
    if (tankConfig) {
      setEditVolume(String(tankConfig.volume_liters));
      setEditFishCount(tankConfig.fish_count);
      setEditSpecies([...tankConfig.fish_types]);
    }
    setIsEditModalOpen(true);
  };

  const handleToggleSpecies = (species: string) => {
    if (editSpecies.includes(species)) {
      if (editSpecies.length === 1) {
        Alert.alert('Required', 'At least one species must be present in the tank.');
        return;
      }
      setEditSpecies(editSpecies.filter(s => s !== species));
    } else {
      setEditSpecies([...editSpecies, species]);
    }
  };

  const handleSaveTankConfig = async () => {
    const volNum = parseFloat(editVolume);
    if (isNaN(volNum) || volNum < 10 || volNum > 5000) {
      Alert.alert('Invalid Volume', 'Please enter a valid tank volume between 10 and 5000 Liters.');
      return;
    }
    if (editFishCount < 1) {
      Alert.alert('Invalid Count', 'Fish count must be at least 1.');
      return;
    }
    if (editSpecies.length === 0) {
      Alert.alert('Select Species', 'Please select at least one species.');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateTankConfig({
        tank_id: tankConfig?.tank_id || 5,
        tank_name: tankConfig?.tank_name || 'Albino Red Cover - Tank #5',
        volume_liters: volNum,
        fish_types: editSpecies,
        fish_count: editFishCount,
      });
      setTankConfig(updated);
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Database Error', err?.message || 'Failed to update tank configuration in database.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data && !tankConfig) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  // Bioload badge styling
  const bioloadLevel = tankConfig?.bioload_level || 'OPTIMAL';
  const isBioloadAlert = bioloadLevel === 'OVERSTOCKED';
  const isBioloadMod = bioloadLevel === 'MODERATE';

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
    >
      {/* ── Tank Database Configuration Card ── */}
      <View style={styles.tankCard}>
        <View style={styles.tankCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Database size={18} color="#00E5FF" />
            <Text style={styles.tankCardTitle}>
              Tank Metadata & Biomass DB
            </Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={handleOpenEdit}>
            <Edit3 size={14} color="#00E5FF" />
            <Text style={styles.editBtnText}>Manage</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tankSubtext}>
          Persistent storage ({tankConfig?.db_engine?.toUpperCase() || 'SQLITE'} engine) for thermal inertia and bioload attribution.
        </Text>

        <View style={styles.metricsGrid}>
          {/* Volume */}
          <View style={styles.metricBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Droplets size={14} color="#00E5FF" />
              <Text style={styles.metricLabel}>Water Volume</Text>
            </View>
            <Text style={styles.metricVal}>
              {tankConfig?.volume_liters || 120} <Text style={styles.metricUnit}>L</Text>
            </Text>
          </View>

          {/* Population */}
          <View style={styles.metricBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Fish size={14} color="#00E676" />
              <Text style={styles.metricLabel}>Total Population</Text>
            </View>
            <Text style={styles.metricVal}>
              {tankConfig?.fish_count || 8} <Text style={styles.metricUnit}>Fish</Text>
            </Text>
          </View>

          {/* Density Ratio */}
          <View style={styles.metricBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Layers size={14} color="#FFD600" />
              <Text style={styles.metricLabel}>Density Ratio</Text>
            </View>
            <Text style={styles.metricVal}>
              {tankConfig?.liters_per_fish || 15.0} <Text style={styles.metricUnit}>L/fish</Text>
            </Text>
          </View>
        </View>

        {/* Bioload Status Pill */}
        <View style={[
          styles.bioloadBanner,
          isBioloadAlert ? styles.bioloadBannerAlert : (isBioloadMod ? styles.bioloadBannerMod : styles.bioloadBannerOk)
        ]}>
          <Text style={[
            styles.bioloadText,
            isBioloadAlert ? styles.bioloadTextAlert : (isBioloadMod ? styles.bioloadTextMod : styles.bioloadTextOk)
          ]}>
            ● {bioloadLevel} STOCKING: {tankConfig?.bioload_desc || 'Safe biological biomass capacity.'}
          </Text>
        </View>

        {/* Species Inhabitants Pills */}
        <Text style={styles.speciesHeaderLabel}>Inhabitant Species in Tank:</Text>
        <View style={styles.speciesChipsRow}>
          {tankConfig?.fish_types?.map((sp, idx) => (
            <View key={idx} style={styles.speciesPill}>
              <CheckCircle size={12} color="#00E5FF" />
              <Text style={styles.speciesPillText}>{sp}</Text>
            </View>
          ))}
        </View>
      </View>

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
          Relative influence of each telemetry and biomass channel on system risk:
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

      {/* ── Edit Tank Modal ── */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Database size={20} color="#00E5FF" />
                <Text style={styles.modalTitle}>Manage Tank & Biomass DB</Text>
              </View>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Volume Input */}
              <Text style={styles.modalInputLabel}>Tank Water Volume (Liters):</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={editVolume}
                onChangeText={setEditVolume}
                placeholder="e.g. 120"
                placeholderTextColor="#64748B"
              />

              {/* Quick Presets */}
              <View style={styles.presetRow}>
                {['60', '100', '120', '200'].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.presetBtn, editVolume === preset && styles.presetBtnActive]}
                    onPress={() => setEditVolume(preset)}
                  >
                    <Text style={[styles.presetBtnText, editVolume === preset && styles.presetBtnTextActive]}>
                      {preset}L
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Fish Count Stepper */}
              <Text style={styles.modalInputLabel}>Total Fish Inhabitants:</Text>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditFishCount(Math.max(1, editFishCount - 1))}
                >
                  <Minus size={18} color="#00E5FF" />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{editFishCount} Fish</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditFishCount(Math.min(500, editFishCount + 1))}
                >
                  <Plus size={18} color="#00E5FF" />
                </TouchableOpacity>
              </View>

              {/* Species Multi-Select */}
              <Text style={styles.modalInputLabel}>Select Species in Tank:</Text>
              <View style={styles.chipsRow}>
                {AVAILABLE_SPECIES.map((species) => {
                  const selected = editSpecies.includes(species);
                  return (
                    <TouchableOpacity
                      key={species}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => handleToggleSpecies(species)}
                    >
                      {selected && <CheckCircle size={14} color="#00E5FF" style={{ marginRight: 6 }} />}
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {species}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.modalHint}>
                Saving writes directly to persistent database ({tankConfig?.db_engine || 'sqlite'}) and recalibrates XAI bioload ratios.
              </Text>

              {/* Action Buttons */}
              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsEditModalOpen(false)}
                  disabled={saving}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveTankConfig}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#0B0F19" />
                  ) : (
                    <>
                      <Save size={16} color="#0B0F19" />
                      <Text style={styles.saveBtnText}>Save to Database</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F19' },

  // Tank Card Styles
  tankCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    marginBottom: 20,
  },
  tankCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tankCardTitle: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '700',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  editBtnText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  tankSubtext: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  metricVal: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 4,
  },
  metricUnit: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: 'normal',
  },
  bioloadBanner: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 12,
  },
  bioloadBannerOk: {
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  bioloadBannerMod: {
    backgroundColor: 'rgba(255, 214, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 0, 0.3)',
  },
  bioloadBannerAlert: {
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  bioloadText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  bioloadTextOk: { color: '#00E676' },
  bioloadTextMod: { color: '#FFD600' },
  bioloadTextAlert: { color: '#FF5252' },

  speciesHeaderLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  speciesChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  speciesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  speciesPillText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalInputLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  presetBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  presetBtnTextActive: {
    color: '#00E5FF',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 6,
    justifyContent: 'space-between',
  },
  stepperBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00E5FF',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#00E5FF',
  },
  modalHint: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14,
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#00E5FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: {
    color: '#0B0F19',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Existing XAI Hub Styles
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
