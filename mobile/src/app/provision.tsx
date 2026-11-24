import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  QrCode,
  Wifi,
  Cpu,
  CheckCircle,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  Radio,
  Zap,
  Camera,
  Layers,
  Sparkles,
} from 'lucide-react-native';
import { deviceProvisionApi } from '@/services/api';
import { triggerResolvedHaptic, triggerSelectionHaptic } from '@/services/haptics';
import { showAlert } from '@/services/alert';

export default function DeviceProvisionScreen() {
  const router = useRouter();
  const { tank_id, tank_name } = useLocalSearchParams<{ tank_id: string; tank_name: string }>();

  // Mode: 'SCAN' (Camera Scanner) or 'MANUAL' (UID input)
  const [activeTab, setActiveTab] = useState<'SCAN' | 'MANUAL'>(Platform.OS === 'web' ? 'MANUAL' : 'SCAN');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [binding, setBinding] = useState(false);
  const [manualUid, setManualUid] = useState('AG-ESP32-DEV01');
  const [pairingStatus, setPairingStatus] = useState<'WAITING' | 'CLAIMED'>('WAITING');
  const [assignedUid, setAssignedUid] = useState<string | null>(null);

  // Check if device is already active for this tank
  useEffect(() => {
    if (!tank_id) return;
    const checkExisting = async () => {
      try {
        const device = await deviceProvisionApi.getDeviceForTank(tank_id as string);
        if (device && device.status === 'ACTIVE') {
          setPairingStatus('CLAIMED');
          setAssignedUid(device.device_uid);
        }
      } catch {}
    };
    checkExisting();
  }, [tank_id]);

  // Execute device binding with target tank
  const executeBind = async (rawUid: string) => {
    if (!tank_id) {
      showAlert('Missing Tank', 'No active aquarium selected.');
      return;
    }

    // Clean payload (handle raw UID or JSON formatted string)
    let uid = rawUid.trim();
    try {
      if (uid.startsWith('{')) {
        const parsed = JSON.parse(uid);
        uid = parsed.device_uid || parsed.uid || uid;
      } else if (uid.includes('uid=')) {
        uid = uid.split('uid=')[1].split('&')[0];
      }
    } catch {}

    if (!uid) {
      showAlert('Invalid QR Code', 'Could not read a valid device UID from the QR code.');
      setScanned(false);
      return;
    }

    setBinding(true);
    try {
      await deviceProvisionApi.bindDeviceManually(tank_id as string, uid);
      triggerResolvedHaptic();
      setPairingStatus('CLAIMED');
      setAssignedUid(uid);
      showAlert(
        'IoT Hub Registered!',
        `Device ${uid.toUpperCase()} is now officially assigned to ${tank_name || 'your aquarium'}.\n\nAll AI features (Live Telemetry, TinyML Edge Gatekeeper, Disease Risk Predictor, and XAI Hub) are now live!`,
        [
          {
            text: 'Open Dashboard',
            onPress: () => router.replace('/'),
          },
        ]
      );
    } catch (err: any) {
      showAlert('Registration Failed', err.message || 'Failed to bind device to tank.');
      setScanned(false);
    } finally {
      setBinding(false);
    }
  };

  // Handler for camera QR detection
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || binding || pairingStatus === 'CLAIMED') return;
    setScanned(true);
    triggerSelectionHaptic();
    executeBind(data);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back Button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <ArrowLeft size={16} color="#00E5FF" />
        <Text style={styles.backBtnText}>Back to Aquariums</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badgeIcon}>
          <QrCode size={30} color="#00E5FF" />
        </View>
        <Text style={styles.title}>Register IoT Hardware Hub</Text>
        <Text style={styles.subtitle}>Pairing autonomous ESP32 controller to:</Text>
        <Text style={styles.tankHighlight}>{tank_name || 'Selected Aquarium'}</Text>
      </View>

      {/* Pairing Success Card */}
      {pairingStatus === 'CLAIMED' ? (
        <View style={styles.claimedCard}>
          <CheckCircle size={44} color="#00E676" />
          <Text style={styles.claimedTitle}>Hub Successfully Paired!</Text>
          <Text style={styles.claimedSubtitle}>
            Device <Text style={{ color: '#00E5FF', fontWeight: 'bold' }}>{assignedUid}</Text> is
            actively transmitting telemetry and running Edge TinyML safety interlocks for this tank.
          </Text>
          <TouchableOpacity style={styles.dashboardBtn} onPress={() => router.replace('/')}>
            <Sparkles size={16} color="#0B0F19" />
            <Text style={styles.dashboardBtnText}>Go to Live AI Dashboard</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Segment Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'SCAN' && styles.tabBtnActive]}
              onPress={() => {
                triggerSelectionHaptic();
                setActiveTab('SCAN');
              }}
            >
              <Camera size={14} color={activeTab === 'SCAN' ? '#0B0F19' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'SCAN' && styles.tabTextActive]}>
                Scan Device QR
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'MANUAL' && styles.tabBtnActive]}
              onPress={() => {
                triggerSelectionHaptic();
                setActiveTab('MANUAL');
              }}
            >
              <Cpu size={14} color={activeTab === 'MANUAL' ? '#0B0F19' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'MANUAL' && styles.tabTextActive]}>
                Enter UID Manually
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: Camera Scanner */}
          {activeTab === 'SCAN' && (
            <View style={styles.cameraCard}>
              <View style={styles.cameraHeader}>
                <Radio size={14} color="#00E5FF" />
                <Text style={styles.cameraTitle}>Point Camera at IoT Display QR Code</Text>
              </View>

              {!permission?.granted ? (
                <View style={styles.permissionBox}>
                  <Camera size={36} color="#64748B" />
                  <Text style={styles.permText}>
                    Camera permission is required to scan the registration QR code on your ESP32 display.
                  </Text>
                  <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>Grant Camera Access</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.cameraWrapper}>
                  <CameraView
                    style={styles.cameraView}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  />
                  {/* Viewfinder Overlay Reticle */}
                  <View style={styles.reticleOverlay}>
                    <View style={styles.reticleBox}>
                      <View style={[styles.corner, styles.cornerTL]} />
                      <View style={[styles.corner, styles.cornerTR]} />
                      <View style={[styles.corner, styles.cornerBL]} />
                      <View style={[styles.corner, styles.cornerBR]} />
                      {binding && (
                        <View style={styles.scanningIndicator}>
                          <ActivityIndicator size="small" color="#00E5FF" />
                          <Text style={styles.scanningText}>Binding...</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {scanned && !binding && (
                <TouchableOpacity
                  style={styles.rescanBtn}
                  onPress={() => setScanned(false)}
                >
                  <RefreshCw size={13} color="#00E5FF" />
                  <Text style={styles.rescanBtnText}>Tap to Scan Again</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* TAB 2: Manual UID Entry */}
          {activeTab === 'MANUAL' && (
            <View style={styles.manualCard}>
              <Text style={styles.manualLabel}>DEVICE HARDWARE UID</Text>
              <Text style={styles.manualDesc}>
                Enter the UID printed on your device display (or use simulator for testing):
              </Text>

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={manualUid}
                  onChangeText={setManualUid}
                  placeholder="e.g. AG-ESP32-84F703"
                  placeholderTextColor="#475569"
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.bindBtn, binding && { opacity: 0.6 }]}
                  onPress={() => executeBind(manualUid)}
                  disabled={binding}
                >
                  {binding ? (
                    <ActivityIndicator color="#0B0F19" size="small" />
                  ) : (
                    <Text style={styles.bindBtnText}>Register</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Presets */}
              <View style={styles.presetsRow}>
                <TouchableOpacity
                  style={styles.presetPill}
                  onPress={() => setManualUid('AG-ESP32-DEV01')}
                >
                  <Zap size={11} color="#00E5FF" />
                  <Text style={styles.presetPillText}>Default: AG-ESP32-DEV01</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.presetPill}
                  onPress={() => setManualUid('AG-ESP32-TESTBED')}
                >
                  <Zap size={11} color="#FFB300" />
                  <Text style={styles.presetPillText}>Simulator: AG-ESP32-TESTBED</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Step-by-Step IoT Hardware Setup Flow */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>How IoT Provisioning Works:</Text>

            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Power On the Device</Text>
                <Text style={styles.stepBody}>
                  Connect the 12V 2A power supply to your AquaGuard controller box.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Connect Device to Home Wi-Fi</Text>
                <Text style={styles.stepBody}>
                  On first boot, connect your phone to Wi-Fi <Text style={{ color: '#00E5FF' }}>AquaGuard-Setup</Text>. A captive portal will open asking for your home Wi-Fi password.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Scan the Screen QR Code</Text>
                <Text style={styles.stepBody}>
                  Once connected to Wi-Fi, the device screen will display its Registration QR Code. Point this app's camera at the screen to pair!
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 18, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, cursor: 'pointer' as any },
  backBtnText: { color: '#00E5FF', fontSize: 13, fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 18 },
  badgeIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  tankHighlight: { fontSize: 14, fontWeight: '800', color: '#00E5FF', marginTop: 2 },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    cursor: 'pointer' as any,
  },
  tabBtnActive: {
    backgroundColor: '#00E5FF',
  },
  tabText: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  tabTextActive: { color: '#0B0F19' },

  // Camera Scanner Card
  cameraCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  cameraHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cameraTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  cameraWrapper: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  cameraView: { flex: 1 },
  reticleOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  reticleBox: {
    width: 170,
    height: 170,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#00E5FF',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scanningText: { color: '#00E5FF', fontSize: 11, fontWeight: '700' },
  permissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 12,
  },
  permText: { color: '#94A3B8', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  permBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    cursor: 'pointer' as any,
  },
  permBtnText: { color: '#0B0F19', fontSize: 12, fontWeight: '800' },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
    cursor: 'pointer' as any,
  },
  rescanBtnText: { color: '#00E5FF', fontSize: 12, fontWeight: '700' },

  // Manual Card
  manualCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  manualLabel: { color: '#00E5FF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  manualDesc: { color: '#94A3B8', fontSize: 12, marginTop: 4, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
  },
  bindBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    cursor: 'pointer' as any,
  },
  bindBtnText: { color: '#0B0F19', fontSize: 13, fontWeight: '800' },
  presetsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    cursor: 'pointer' as any,
  },
  presetPillText: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },

  // Claimed Success Card
  claimedCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#00E676',
    gap: 10,
    marginBottom: 16,
  },
  claimedTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  claimedSubtitle: { color: '#94A3B8', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00E5FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
    cursor: 'pointer' as any,
  },
  dashboardBtnText: { color: '#0B0F19', fontSize: 13, fontWeight: '800' },

  // Instructions
  instructionsCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  instructionsTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '800', marginBottom: 12 },
  stepItem: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: { color: '#00E5FF', fontSize: 11, fontWeight: '800' },
  stepContent: { flex: 1 },
  stepHeading: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  stepBody: { color: '#94A3B8', fontSize: 11, marginTop: 2, lineHeight: 16 },
});
