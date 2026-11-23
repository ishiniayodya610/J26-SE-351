import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Cpu, QrCode, Zap, ShieldAlert, ArrowRight, Fish } from 'lucide-react-native';
import { deviceProvisionApi, TankItem } from '@/services/api';

interface HubRequiredBannerProps {
  activeTank: TankItem | null;
  featureName?: string;
  onDeviceBound?: () => void;
}

export default function HubRequiredBanner({
  activeTank,
  featureName = 'AI & Live Telemetry',
  onDeviceBound,
}: HubRequiredBannerProps) {
  const router = useRouter();
  const [deviceUid, setDeviceUid] = useState('AG-ESP32-DEV01');
  const [binding, setBinding] = useState(false);

  const handleQuickBind = async () => {
    if (!activeTank) {
      Alert.alert('No Aquarium', 'Please create an aquarium first.', [
        { text: 'Create Aquarium', onPress: () => router.push('/tanks' as any) },
      ]);
      return;
    }

    if (!deviceUid.trim()) {
      Alert.alert('Required', 'Please enter a device UID.');
      return;
    }

    setBinding(true);
    try {
      await deviceProvisionApi.bindDeviceManually(activeTank.id, deviceUid.trim());
      Alert.alert(
        'Hub Assigned!',
        `Device ${deviceUid.trim().toUpperCase()} is now registered to ${activeTank.name}. ${featureName} is now active!`
      );
      if (onDeviceBound) {
        onDeviceBound();
      }
    } catch (err: any) {
      Alert.alert('Binding Error', err.message || 'Failed to bind device.');
    } finally {
      setBinding(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Cpu size={38} color="#00E5FF" />
      </View>

      <Text style={styles.title}>IoT Hardware Hub Required</Text>
      <Text style={styles.subtitle}>
        {featureName} activates automatically once an autonomous ESP32 controller or testbed simulator is assigned to your tank.
      </Text>

      {/* Active Tank Indicator */}
      <View style={styles.tankPill}>
        <Fish size={14} color="#00E5FF" />
        <Text style={styles.tankPillText}>
          {activeTank ? activeTank.name : 'No Tank Selected'}
        </Text>
      </View>

      {/* Manual UID Entry Box for Testing/Simulators */}
      <View style={styles.manualBox}>
        <Text style={styles.manualLabel}>QUICK DEVICE REGISTRATION (NO HARDWARE NEEDED)</Text>
        <Text style={styles.manualDesc}>
          Enter your prototype device UID or testbed simulator ID below:
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={deviceUid}
            onChangeText={setDeviceUid}
            placeholder="e.g. AG-ESP32-DEV01"
            placeholderTextColor="#475569"
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.bindBtn, binding && { opacity: 0.6 }]}
            onPress={handleQuickBind}
            disabled={binding}
          >
            {binding ? (
              <ActivityIndicator color="#0B0F19" size="small" />
            ) : (
              <Text style={styles.bindBtnText}>Assign Hub</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Preset buttons */}
        <View style={styles.presetRow}>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => setDeviceUid('AG-ESP32-DEV01')}
          >
            <Zap size={11} color="#00E5FF" />
            <Text style={styles.presetBtnText}>Default: AG-ESP32-DEV01</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => setDeviceUid('AG-ESP32-TESTBED')}
          >
            <Zap size={11} color="#FFB300" />
            <Text style={styles.presetBtnText}>Simulator: AG-ESP32-TESTBED</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Alternative Options */}
      <View style={styles.actionRow}>
        {activeTank && (
          <TouchableOpacity
            style={styles.qrBtn}
            onPress={() =>
              router.push({
                pathname: '/provision' as any,
                params: { tank_id: activeTank.id, tank_name: activeTank.name },
              })
            }
          >
            <QrCode size={14} color="#00E5FF" />
            <Text style={styles.qrBtnText}>Provision via QR Code</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.manageBtn}
          onPress={() => router.push('/tanks' as any)}
        >
          <Text style={styles.manageBtnText}>Manage Aquariums</Text>
          <ArrowRight size={13} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#131B2E',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    margin: 16,
    marginTop: 20,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  title: { fontSize: 19, fontWeight: '800', color: '#F8FAFC', marginBottom: 6 },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  tankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
    marginBottom: 18,
  },
  tankPillText: { color: '#00E5FF', fontSize: 12, fontWeight: '700' },
  manualBox: {
    backgroundColor: '#0B0F19',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  manualLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  manualDesc: { color: '#94A3B8', fontSize: 11, marginTop: 4, marginBottom: 10, lineHeight: 15 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: {
    flex: 1,
    backgroundColor: '#131B2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    color: '#00E5FF',
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    fontWeight: '700',
  },
  bindBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    height: 42,
  },
  bindBtnText: { color: '#0B0F19', fontSize: 12, fontWeight: '900' },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131B2E',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  presetBtnText: { color: '#CBD5E1', fontSize: 10, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  qrBtnText: { color: '#00E5FF', fontSize: 11, fontWeight: '700' },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  manageBtnText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
});
