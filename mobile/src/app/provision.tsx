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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
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
} from 'lucide-react-native';
import { deviceProvisionApi, ProvisionDeviceResponse } from '@/services/api';

export default function DeviceProvisionScreen() {
  const router = useRouter();
  const { tank_id, tank_name } = useLocalSearchParams<{ tank_id: string; tank_name: string }>();

  const [loading, setLoading] = useState(true);
  const [provisionData, setProvisionData] = useState<ProvisionDeviceResponse | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'WAITING' | 'CLAIMED' | 'FAILED'>('WAITING');
  const [checkCount, setCheckCount] = useState(0);

  // Manual Device UID Input
  const [manualUid, setManualUid] = useState('AG-ESP32-DEV01');
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (tank_id) {
      generateToken();
    }
  }, [tank_id]);

  // Poll server every 3 seconds to see if the ESP32 has claimed the token
  useEffect(() => {
    if (!tank_id || pairingStatus === 'CLAIMED') return;

    const interval = setInterval(async () => {
      try {
        const device = await deviceProvisionApi.getDeviceForTank(tank_id);
        if (device && device.status === 'ACTIVE') {
          setPairingStatus('CLAIMED');
          clearInterval(interval);
        }
      } catch {
        // Still waiting
      }
      setCheckCount((c) => c + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, [tank_id, pairingStatus]);

  const generateToken = async () => {
    setLoading(true);
    setPairingStatus('WAITING');
    try {
      const data = await deviceProvisionApi.generateProvisionToken(tank_id as string);
      setProvisionData(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate device claim token');
    } finally {
      setLoading(false);
    }
  };

  const handleManualBind = async () => {
    if (!manualUid.trim()) {
      Alert.alert('Required', 'Please enter a device UID (e.g. AG-ESP32-DEV01)');
      return;
    }
    setBinding(true);
    try {
      await deviceProvisionApi.bindDeviceManually(tank_id as string, manualUid.trim());
      setPairingStatus('CLAIMED');
      Alert.alert(
        'Device Assigned!',
        `Device ${manualUid.trim().toUpperCase()} has been paired to this tank. Live telemetry, TinyML gatekeeper, and AI models are now unlocked!`,
        [{ text: 'Go to Dashboard', onPress: () => router.replace('/') }]
      );
    } catch (err: any) {
      Alert.alert('Binding Failed', err.message || 'Could not bind device');
    } finally {
      setBinding(false);
    }
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
        <Text style={styles.title}>Pair ESP32 IoT Device</Text>
        <Text style={styles.subtitle}>
          Assign an autonomous Edge TinyML controller to:
        </Text>
        <Text style={styles.tankHighlight}>{tank_name || 'Selected Aquarium'}</Text>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#00E5FF" />
          <Text style={styles.loadingText}>Generating secure hardware claim token...</Text>
        </View>
      ) : provisionData ? (
        <>
          {/* Manual Device Registration Card (No physical device needed yet) */}
          <View style={styles.manualCard}>
            <View style={styles.manualHeader}>
              <Cpu size={20} color="#00E5FF" />
              <Text style={styles.manualTitle}>Manual Device Assignment</Text>
            </View>
            <Text style={styles.manualSubtitle}>
              Still assembling your ESP32-S3 hardware? Enter a device UID or use the simulator ID to unlock all AI features immediately:
            </Text>

            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                value={manualUid}
                onChangeText={setManualUid}
                placeholder="e.g. AG-ESP32-DEV01"
                placeholderTextColor="#475569"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[styles.manualBindBtn, binding && { opacity: 0.6 }]}
                onPress={handleManualBind}
                disabled={binding}
              >
                {binding ? (
                  <ActivityIndicator color="#0B0F19" size="small" />
                ) : (
                  <Text style={styles.manualBindBtnText}>Assign Hub</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetPill}
                onPress={() => setManualUid('AG-ESP32-DEV01')}
              >
                <Zap size={11} color="#00E5FF" />
                <Text style={styles.presetText}>Default: AG-ESP32-DEV01</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetPill}
                onPress={() => setManualUid('AG-ESP32-TESTBED')}
              >
                <Zap size={11} color="#FFB300" />
                <Text style={styles.presetText}>Simulator: AG-ESP32-TESTBED</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR SCAN HARDWARE QR CODE</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.qrCard}>
          {/* Status Indicator Banner */}
          <View
            style={[
              styles.statusBanner,
              pairingStatus === 'CLAIMED' ? styles.statusSuccess : styles.statusWaiting,
            ]}
          >
            {pairingStatus === 'CLAIMED' ? (
              <>
                <CheckCircle size={16} color="#00E676" />
                <Text style={styles.statusSuccessText}>DEVICE PAIRED & STREAMING</Text>
              </>
            ) : (
              <>
                <Radio size={14} color="#00E5FF" />
                <Text style={styles.statusWaitingText}>
                  WAITING FOR ESP32 TO CONNECT ({checkCount}s)...
                </Text>
              </>
            )}
          </View>

          {/* QR Code Container */}
          <View style={styles.qrWrapper}>
            <QRCode
              value={provisionData.qr_payload}
              size={210}
              color="#0B0F19"
              backgroundColor="#FFFFFF"
            />
          </View>

          {/* Token String for Manual Entry */}
          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>ONE-TIME PROVISION TOKEN</Text>
            <Text style={styles.tokenValue} numberOfLines={1} selectable>
              {provisionData.provision_token}
            </Text>
            <Text style={styles.tokenExpire}>Valid for 15 minutes</Text>
          </View>

          {/* Instructions Step-by-Step */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>Hardware Pairing Steps:</Text>

            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>1</Text>
              </View>
              <Text style={styles.stepText}>
                Power on your ESP32-S3 IoT box using the 12V 2A adapter.
              </Text>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>2</Text>
              </View>
              <Text style={styles.stepText}>
                Connect your phone to the device Wi-Fi AP:
                <Text style={{ color: '#00E5FF', fontWeight: 'bold' }}> AquaGuard-Setup</Text>.
              </Text>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>3</Text>
              </View>
              <Text style={styles.stepText}>
                Enter your home Wi-Fi credentials and paste the token above into the setup page.
              </Text>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>4</Text>
              </View>
              <Text style={styles.stepText}>
                The ESP32 will auto-claim, synchronize targets, and begin autonomous control!
              </Text>
            </View>
          </View>

          {pairingStatus === 'CLAIMED' ? (
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => router.replace('/' as any)}
            >
              <CheckCircle size={18} color="#0B0F19" />
              <Text style={styles.doneBtnText}>Return to Live Telemetry Dashboard</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.refreshBtn} onPress={generateToken}>
              <RefreshCw size={14} color="#94A3B8" />
              <Text style={styles.refreshBtnText}>Regenerate New Token</Text>
            </TouchableOpacity>
          )}
        </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backBtnText: { color: '#00E5FF', fontSize: 13, fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 20 },
  badgeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  tankHighlight: { fontSize: 15, fontWeight: '800', color: '#00E5FF', marginTop: 2 },
  centerBox: { alignItems: 'center', marginTop: 40, gap: 12 },
  loadingText: { color: '#94A3B8', fontSize: 13 },
  manualCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  manualHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  manualTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  manualSubtitle: { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 14 },
  manualInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  manualInput: {
    flex: 1,
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    color: '#00E5FF',
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    fontWeight: '700',
  },
  manualBindBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
  },
  manualBindBtnText: { color: '#0B0F19', fontSize: 12, fontWeight: '900' },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  presetText: { color: '#CBD5E1', fontSize: 10, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1E293B' },
  dividerText: { color: '#64748B', fontSize: 10, fontWeight: '800' },
  qrCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 8,
    marginBottom: 18,
    width: '100%',
    justifyContent: 'center',
  },
  statusWaiting: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  statusWaitingText: { color: '#00E5FF', fontSize: 11, fontWeight: '800' },
  statusSuccess: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderWidth: 1,
    borderColor: '#00E676',
  },
  statusSuccessText: { color: '#00E676', fontSize: 11, fontWeight: '900' },
  qrWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  tokenBox: {
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 18,
  },
  tokenLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  tokenValue: { color: '#00E5FF', fontSize: 14, fontWeight: '800', marginTop: 4 },
  tokenExpire: { color: '#94A3B8', fontSize: 10, marginTop: 4 },
  instructionsContainer: { width: '100%', gap: 10, marginBottom: 20 },
  instructionsTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '800', marginBottom: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00E5FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  stepNumText: { color: '#0B0F19', fontSize: 11, fontWeight: '900' },
  stepText: { color: '#CBD5E1', fontSize: 12, flex: 1, lineHeight: 18 },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E676',
    width: '100%',
    height: 48,
    borderRadius: 10,
    gap: 8,
  },
  doneBtnText: { color: '#0B0F19', fontSize: 13, fontWeight: '800' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  refreshBtnText: { color: '#94A3B8', fontSize: 12 },
});
