import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Fish,
  Plus,
  QrCode,
  Trash2,
  Sliders,
  Shield,
  Layers,
  Sparkles,
  Thermometer,
  Droplets,
  Activity,
  CheckCircle,
  Zap,
} from 'lucide-react-native';
import {
  tankManagementApi,
  getAuthToken,
  TankItem,
  TankCreatePayload,
  getActiveTankId,
  setActiveTankId,
  deviceProvisionApi,
} from '@/services/api';

export default function TanksScreen() {
  const router = useRouter();
  const [tanks, setTanks] = useState<TankItem[]>([]);
  const [activeTankId, setActiveTankIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [lengthCm, setLengthCm] = useState('90');
  const [widthCm, setWidthCm] = useState('45');
  const [heightCm, setHeightCm] = useState('50');
  const [volumeLiters, setVolumeLiters] = useState('120');
  const [fishTypesStr, setFishTypesStr] = useState('Guppy, Swordtail, Betta');
  const [fishCount, setFishCount] = useState('12');
  const [tankType, setTankType] = useState<'HOME' | 'FARMING'>('HOME');
  const [targetTemp, setTargetTemp] = useState('28.0');
  const [targetPh, setTargetPh] = useState('6.8');
  const [targetTds, setTargetTds] = useState('150');

  const loadTanks = useCallback(async () => {
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    try {
      const [items, currentActiveId] = await Promise.all([
        tankManagementApi.listTanks(),
        getActiveTankId(),
      ]);
      setTanks(items);
      if (currentActiveId && items.some(t => t.id === currentActiveId)) {
        setActiveTankIdState(currentActiveId);
      } else if (items.length > 0) {
        setActiveTankIdState(items[0].id);
        await setActiveTankId(items[0].id);
      }
    } catch (err: any) {
      console.log('Error loading tanks:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSelectActiveTank = async (tankId: string) => {
    setActiveTankIdState(tankId);
    await setActiveTankId(tankId);
  };

  useEffect(() => {
    loadTanks();
  }, [loadTanks]);

  // Auto-calculate volume from dimensions
  const updateDimensions = (l: string, w: string, h: string) => {
    setLengthCm(l);
    setWidthCm(w);
    setHeightCm(h);
    const length = parseFloat(l);
    const width = parseFloat(w);
    const height = parseFloat(h);
    if (!isNaN(length) && !isNaN(width) && !isNaN(height)) {
      const vol = (length * width * height) / 1000.0;
      setVolumeLiters(vol.toFixed(0));
    }
  };

  const handleCreateTank = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a name for your tank.');
      return;
    }
    const vol = parseFloat(volumeLiters);
    const count = parseInt(fishCount, 10);
    if (isNaN(vol) || vol <= 0) {
      Alert.alert('Invalid Volume', 'Please enter a valid tank volume in liters.');
      return;
    }
    if (isNaN(count) || count < 1) {
      Alert.alert('Invalid Fish Count', 'Please specify at least 1 fish.');
      return;
    }

    const types = fishTypesStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload: TankCreatePayload = {
      name: name.trim(),
      dimensions: {
        length_cm: parseFloat(lengthCm) || 90,
        width_cm: parseFloat(widthCm) || 45,
        height_cm: parseFloat(heightCm) || 50,
      },
      volume_liters: vol,
      fish_types: types.length > 0 ? types : ['Discus'],
      fish_count: count,
      tank_type: tankType,
      target_temp_c: parseFloat(targetTemp) || 28.0,
      target_ph: parseFloat(targetPh) || 6.8,
      target_tds_ppm: parseInt(targetTds, 10) || 150,
    };

    setCreating(true);
    try {
      await tankManagementApi.createTank(payload);
      setModalVisible(false);
      setName('');
      loadTanks();
      Alert.alert('Success', 'Aquarium tank created successfully!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create tank.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTank = (tankId: string, tankName: string) => {
    Alert.alert('Delete Tank', `Are you sure you want to delete "${tankName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await tankManagementApi.deleteTank(tankId);
            loadTanks();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  if (!getAuthToken()) {
    return (
      <View style={styles.centerContainer}>
        <Shield size={48} color="#00E5FF" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Sign In Required</Text>
        <Text style={styles.emptySubtitle}>
          You must be logged in to create tanks and register IoT hardware devices.
        </Text>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push('/auth' as any)}
        >
          <Text style={styles.signInBtnText}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTanks(); }} tintColor="#00E5FF" />
        }
      >
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>My Aquariums</Text>
            <Text style={styles.subtitle}>Manage tanks & pair custom ESP32 IoT controllers</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Plus size={18} color="#0B0F19" />
            <Text style={styles.addBtnText}>Add Tank</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#00E5FF" style={{ marginTop: 40 }} />
        ) : tanks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Fish size={44} color="#64748B" />
            <Text style={styles.emptyCardTitle}>No Tanks Created Yet</Text>
            <Text style={styles.emptyCardSubtitle}>
              Create your first tank to configure species, water targets, and link your ESP32-S3 IoT box.
            </Text>
            <TouchableOpacity
              style={styles.createFirstBtn}
              onPress={() => setModalVisible(true)}
            >
              <Plus size={16} color="#0B0F19" />
              <Text style={styles.createFirstBtnText}>Create Tank</Text>
            </TouchableOpacity>
          </View>
        ) : (
          tanks.map((tank) => {
            const isSelected = activeTankId === tank.id;
            return (
              <TouchableOpacity
                key={tank.id}
                style={[styles.tankCard, isSelected && styles.tankCardSelected]}
                activeOpacity={0.9}
                onPress={() => handleSelectActiveTank(tank.id)}
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.tagRow}>
                      {isSelected && (
                        <View style={styles.activeBadge}>
                          <CheckCircle size={10} color="#00E5FF" />
                          <Text style={styles.activeBadgeText}>ACTIVE FOR AI</Text>
                        </View>
                      )}

                      <View style={[styles.typeBadge, tank.tank_type === 'FARMING' ? styles.farmingBadge : styles.homeBadge]}>
                        <Text style={styles.typeBadgeText}>
                          {tank.tank_type === 'FARMING' ? '🌾 COMMERCIAL FARMING' : '🏠 HOME AQUARIUM'}
                        </Text>
                      </View>

                      <View style={[
                        styles.bioloadBadge,
                        tank.bioload.level === 'OPTIMAL' ? styles.bioOk : (tank.bioload.level === 'MODERATE' ? styles.bioMod : styles.bioOver)
                      ]}>
                        <Text style={styles.bioloadText}>BIOLOAD: {tank.bioload.level}</Text>
                      </View>
                    </View>
                    <Text style={styles.tankName}>{tank.name}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteTank(tank.id, tank.name)}
                  >
                    <Trash2 size={16} color="#FF5252" />
                  </TouchableOpacity>
                </View>

                {/* Tank Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{tank.volume_liters} L</Text>
                    <Text style={styles.statLbl}>Volume</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{tank.fish_count} fish</Text>
                    <Text style={styles.statLbl}>{tank.bioload.liters_per_fish} L/fish</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{tank.dimensions ? `${tank.dimensions.length_cm}cm` : '--'}</Text>
                    <Text style={styles.statLbl}>Length</Text>
                  </View>
                </View>

                {/* Species Tags */}
                <View style={styles.speciesContainer}>
                  <Text style={styles.speciesHeader}>Species Stocked:</Text>
                  <View style={styles.speciesTagsRow}>
                    {tank.fish_types.map((type, idx) => (
                      <View key={idx} style={styles.speciesTag}>
                        <Fish size={11} color="#00E5FF" />
                        <Text style={styles.speciesTagText}>{type}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Setpoints Baseline Bar */}
                <View style={styles.setpointsBar}>
                  <View style={styles.setpointItem}>
                    <Thermometer size={12} color="#FF6D00" />
                    <Text style={styles.setpointText}>Target: {tank.target_temp_c}°C</Text>
                  </View>
                  <View style={styles.setpointItem}>
                    <Activity size={12} color="#00E676" />
                    <Text style={styles.setpointText}>pH: {tank.target_ph}</Text>
                  </View>
                  <View style={styles.setpointItem}>
                    <Droplets size={12} color="#2979FF" />
                    <Text style={styles.setpointText}>TDS: {tank.target_tds_ppm} ppm</Text>
                  </View>
                </View>

                {/* Hardware Pairing Status & Action */}
                <View style={styles.footerRow}>
                  <View style={styles.deviceStatus}>
                    <View style={[styles.deviceDot, tank.device_id ? styles.dotOnline : styles.dotOffline]} />
                    <Text style={styles.deviceStatusText}>
                      {tank.device_id ? 'ESP32 Device Paired' : 'No Hardware Assigned'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.pairBtn}
                    onPress={() => router.push({ pathname: '/provision' as any, params: { tank_id: tank.id, tank_name: tank.name } })}
                  >
                    <QrCode size={14} color="#00E5FF" />
                    <Text style={styles.pairBtnText}>{tank.device_id ? 'Device Details' : 'Pair / Bind Hub'}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Tank Creation Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Create New Aquarium</Text>
              <Text style={styles.modalSubtitle}>Configure physical specifications & species targets</Text>

              {/* Tank Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tank Name</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Living Room Discus Tank"
                  placeholderTextColor="#475569"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              {/* Tank Purpose Toggle */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Aquarium Classification</Text>
                <View style={styles.typeToggleRow}>
                  <TouchableOpacity
                    style={[styles.typeOption, tankType === 'HOME' && styles.typeOptionActive]}
                    onPress={() => setTankType('HOME')}
                  >
                    <Text style={[styles.typeOptionText, tankType === 'HOME' && styles.typeOptionTextActive]}>
                      🏠 Normal Home Tank
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeOption, tankType === 'FARMING' && styles.typeOptionActive]}
                    onPress={() => setTankType('FARMING')}
                  >
                    <Text style={[styles.typeOptionText, tankType === 'FARMING' && styles.typeOptionTextActive]}>
                      🌾 Commercial Farming
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Dimensions */}
              <Text style={styles.sectionHeader}>Physical Dimensions (cm)</Text>
              <View style={styles.dimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Length (L)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={lengthCm}
                    onChangeText={(val) => updateDimensions(val, widthCm, heightCm)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Width (W)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={widthCm}
                    onChangeText={(val) => updateDimensions(lengthCm, val, heightCm)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Height (H)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={heightCm}
                    onChangeText={(val) => updateDimensions(lengthCm, widthCm, val)}
                  />
                </View>
              </View>

              {/* Volume & Fish Count */}
              <View style={styles.dimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Volume (Litres)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={volumeLiters}
                    onChangeText={setVolumeLiters}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Fish Count</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={fishCount}
                    onChangeText={setFishCount}
                  />
                </View>
              </View>

              {/* Fish Species List */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Fish Species in Tank (comma-separated)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Guppy, Swordtail, Discus, Betta"
                  placeholderTextColor="#475569"
                  value={fishTypesStr}
                  onChangeText={setFishTypesStr}
                />
              </View>

              {/* Target Parameter Baselines */}
              <Text style={styles.sectionHeader}>Target Setpoints (Synced to ESP32)</Text>
              <View style={styles.dimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Temp (°C)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={targetTemp}
                    onChangeText={setTargetTemp}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>pH Level</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={targetPh}
                    onChangeText={setTargetPh}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>TDS (ppm)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    value={targetTds}
                    onChangeText={setTargetTds}
                  />
                </View>
              </View>

              {/* Modal Action Buttons */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, creating && { opacity: 0.6 }]}
                  onPress={handleCreateTank}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#0B0F19" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save & Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 6,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00E5FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addBtnText: { color: '#0B0F19', fontSize: 12, fontWeight: '800' },
  emptyTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptySubtitle: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  signInBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  signInBtnText: { color: '#0B0F19', fontSize: 14, fontWeight: '800' },
  emptyCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 20,
  },
  emptyCardTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyCardSubtitle: { color: '#94A3B8', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  createFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00E5FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 18,
    gap: 6,
  },
  createFirstBtnText: { color: '#0B0F19', fontSize: 13, fontWeight: '800' },
  tankCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  tankCardSelected: {
    borderColor: '#00E5FF',
    borderWidth: 1.5,
    backgroundColor: '#111E38',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeBadgeText: {
    color: '#00E5FF',
    fontSize: 9,
    fontWeight: '800',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  homeBadge: { backgroundColor: 'rgba(0, 229, 255, 0.12)', borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.3)' },
  farmingBadge: { backgroundColor: 'rgba(255, 179, 0, 0.15)', borderWidth: 1, borderColor: '#FFB300' },
  typeBadgeText: { color: '#00E5FF', fontSize: 9, fontWeight: '800' },
  bioloadBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  bioOk: { backgroundColor: 'rgba(0, 230, 118, 0.12)' },
  bioMod: { backgroundColor: 'rgba(255, 179, 0, 0.15)' },
  bioOver: { backgroundColor: 'rgba(255, 23, 68, 0.2)' },
  bioloadText: { color: '#F8FAFC', fontSize: 9, fontWeight: '800' },
  tankName: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  deleteBtn: { padding: 8 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    justifyContent: 'space-between',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  statLbl: { color: '#64748B', fontSize: 10, marginTop: 2 },
  speciesContainer: { marginTop: 12 },
  speciesHeader: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  speciesTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  speciesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  speciesTagText: { color: '#CBD5E1', fontSize: 11 },
  setpointsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    padding: 8,
    marginTop: 12,
  },
  setpointItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setpointText: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  deviceStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceDot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: '#00E676' },
  dotOffline: { backgroundColor: '#FF5252' },
  deviceStatusText: { color: '#94A3B8', fontSize: 11 },
  pairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  pairBtnText: { color: '#00E5FF', fontSize: 11, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131B2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  modalSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2, marginBottom: 16 },
  formGroup: { marginBottom: 14 },
  formLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  formInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
  },
  typeToggleRow: { flexDirection: 'row', gap: 10 },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  typeOptionActive: { borderColor: '#00E5FF', backgroundColor: 'rgba(0, 229, 255, 0.1)' },
  typeOptionText: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
  typeOptionTextActive: { color: '#00E5FF' },
  sectionHeader: { color: '#00E5FF', fontSize: 12, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  dimRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 20 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },
  saveBtn: {
    flex: 2,
    backgroundColor: '#00E5FF',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: { color: '#0B0F19', fontWeight: '800', fontSize: 14 },
});
