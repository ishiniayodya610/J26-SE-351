import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

// Native Xcode builds may not populate expoConfig.hostUri. Use Metro's
// actual bundle URL as the fallback so physical devices follow the current Mac.
export const MANUAL_DEV_IP: string | null = null;
const sourceCode = NativeModules.SourceCode;
const scriptURL = sourceCode?.getConstants?.().scriptURL || sourceCode?.scriptURL;
const debuggerHost = Constants.expoConfig?.hostUri;
const detectedHost = MANUAL_DEV_IP || debuggerHost || scriptURL;
const detectedIp = detectedHost
  ? new URL(detectedHost.includes('://') ? detectedHost : `http://${detectedHost}`).hostname
  : (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');

export let API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${detectedIp}:8000`;
const VIDEO_TIMEOUT_MS = 120_000;

export function setCustomApiHost(host: string) {
  API_BASE_URL = host.startsWith('http') ? host : `http://${host}:8000`;
}

export interface TelemetryData {
  system_status: string;
  timing_ms: { dsp: number; classification: number; anomaly: number };
  ml_confidence: { [key: string]: number };
  telemetry: { temperature_c: number; ph: number; tds_ppm: number };
  diagnostics: {
    temperature: { fault_detected: boolean; imputed: boolean };
    ph: { fault_detected: boolean; imputed: boolean };
    tds: { fault_detected: boolean; imputed: boolean };
  };
  gatekeeper: { heater_lockout: boolean; ph_pump_lockout: boolean; thermal_runaway?: boolean };
  deltas?: {
    delta_temp: number;
    delta_ph: number;
    delta_tds: number;
  };
  tank_profile?: {
    species: string;
    target_temp: number;
    target_ph: number;
    target_tds: number;
  };
  thermal_runaway?: {
    active: boolean;
    headline: string;
    message: string;
    slope_per_min?: number;
    time_to_critical_min?: number;
    lethal_temp?: number;
    action: string;
  };
  data_source?: {
    type: 'REMOTE_ESP32' | 'SIMULATED_TESTBED' | 'PHYSICAL_EDGE';
    label: string;
    is_real_hardware: boolean;
    timestamp?: string;
  };
}

export interface FishProfile {
  species_id: string;
  common_name: string;
  scientific_name: string;
  water_requirements: {
    temperature_c: number;
    ph: number;
    tds_ppm: number;
    temp_tolerance: number[];
    ph_tolerance: number[];
    tds_tolerance: number[];
  };
  behavior_baseline: string;
  vulnerability_notes: string;
}

export interface DiseaseRiskData {
  species: string;
  ammonia_spike_risk_pct: number;
  ammonia_status: string;
  whitespot_disease_risk_pct: number;
  disease_status: string;
  temperature_trend_c: number;
  forecast_horizon_hours: number;
  contributing_factors: string[];
}

export interface XAIExplanationData {
  tank_status_headline: string;
  primary_explanation: string;
  edge_gatekeeper_role: string;
  attributions: Array<{ feature_name: string; importance_weight: number; description: string }>;
  recommended_actions: string[];
}

export interface VideoAnalysisData {
  species_id: string;
  common_name: string;
  scientific_name: string;
  confidence: number;
  video_filename: string;
  video_size_kb: number;
  frames_processed: number;
  swimming_activity_pct: number;
  lethargy_index_pct: number;
  average_speed_bl_s?: number;
  maximum_speed_bl_s?: number;
  stationary_percent?: number;
  position?: string;
  direction?: string;
  posture?: string;
  behavior_status?: string;
  reasons?: string[];
  surface_piping: string;
  feeding_response: string;
  health_status: string;
  target_parameters: { temp: number; ph: number; tds: number };
  care_notes: string;
}

export interface BehaviorData {
  species: string;
  confidence: number;
  swimming_activity_pct: number;
  lethargy_index_pct: number;
  surface_piping: string;
  feeding_response: string;
  status: string;
}

export const api = {
  async getLatestTelemetry(): Promise<TelemetryData> {
    const res = await fetch(`${API_BASE_URL}/api/telemetry/latest`);
    if (!res.ok) throw new Error('Failed to fetch telemetry');
    return res.json();
  },

  async simulateInput(temp: number, ph: number, tds: number): Promise<TelemetryData> {
    const res = await fetch(`${API_BASE_URL}/api/telemetry/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp, ph, tds }),
    });
    if (!res.ok) throw new Error('Simulation execution failed');
    return res.json();
  },

  async getFishProfiles(): Promise<FishProfile[]> {
    const res = await fetch(`${API_BASE_URL}/api/fish/profiles`);
    if (!res.ok) throw new Error('Failed to fetch fish profiles');
    return res.json();
  },

  async setActiveProfile(speciesId: string): Promise<FishProfile> {
    const res = await fetch(`${API_BASE_URL}/api/fish/set-active/${speciesId}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to set active profile');
    return res.json();
  },

  async getDiseaseRisk(): Promise<DiseaseRiskData> {
    const res = await fetch(`${API_BASE_URL}/api/comp3/risk-assessment`);
    if (!res.ok) throw new Error('Failed to fetch disease risk');
    return res.json();
  },

  async getXAIExplanation(): Promise<XAIExplanationData> {
    const res = await fetch(`${API_BASE_URL}/api/comp4/explanation`);
    if (!res.ok) throw new Error('Failed to fetch XAI explanation');
    return res.json();
  },

  async getLiveBehavior(): Promise<BehaviorData> {
    const res = await fetch(`${API_BASE_URL}/api/comp2/live-behavior`);
    if (!res.ok) throw new Error('Failed to fetch behavior');
    return res.json();
  },

  async analyzeVideo(uri: string, filename?: string): Promise<VideoAnalysisData> {
    const targetUrl = `${API_BASE_URL}/api/comp2/analyze-video`;
    const name = filename || uri.split('/').pop() || 'captured_tank_video.mp4';

    const connection = new AbortController();
    const connectionTimer = setTimeout(() => connection.abort(), 8_000);
    try {
      const status = await fetch(`${API_BASE_URL}/`, { signal: connection.signal });
      if (!status.ok) throw new Error(`Backend returned ${status.status}.`);
    } catch {
      throw new Error(`Cannot reach the backend at ${API_BASE_URL}. Start the backend and connect both devices to the same Wi-Fi.`);
    } finally {
      clearTimeout(connectionTimer);
    }

    const type = name.toLowerCase().endsWith('.mov') ? 'video/quicktime'
      : name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4';
    const timeoutMessage = 'Video analysis timed out after 2 minutes. Check the backend connection or try a shorter clip.';

    if (Platform.OS !== 'web') {
      const { createUploadTask, FileSystemUploadType, FileSystemSessionType } = await import('expo-file-system/legacy');
      const task = createUploadTask(targetUrl, uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        sessionType: FileSystemSessionType.FOREGROUND,
        fieldName: 'file',
        mimeType: type,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          task.uploadAsync(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error(timeoutMessage));
              void task.cancelAsync().catch(() => {});
            }, VIDEO_TIMEOUT_MS);
          }),
        ]);
        if (!response) throw new Error('Video upload was cancelled.');
        const result = JSON.parse(response.body);
        if (response.status < 200 || response.status >= 300 || !result.success || !result.data) {
          throw new Error(result.detail || `Video analysis failed (${response.status}).`);
        }
        return result.data;
      } finally {
        clearTimeout(timer);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VIDEO_TIMEOUT_MS);
    try {
      const file = await fetch(uri, { signal: controller.signal });
      const formData = new FormData();
      formData.append('file', await file.blob(), name);
      const response = await fetch(targetUrl, { method: 'POST', body: formData, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.detail || `Video analysis failed (${response.status}).`);
      }
      return result.data;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(timeoutMessage);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },

  async identifyFish(uri: string, filename?: string): Promise<any> {
    const targetUrl = `${API_BASE_URL}/api/comp2/identify-fish`;
    const name = filename || uri.split('/').pop() || 'fish_snapshot.jpg';

    if (Platform.OS !== 'web') {
      try {
        const { uploadAsync, FileSystemUploadType } = require('expo-file-system/legacy');
        if (uploadAsync && FileSystemUploadType) {
          const uploadRes = await uploadAsync(targetUrl, uri, {
            httpMethod: 'POST',
            uploadType: FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType: 'image/jpeg',
            parameters: {},
          });

          if (uploadRes.status >= 200 && uploadRes.status < 300) {
            const parsed = JSON.parse(uploadRes.body);
            return parsed.data;
          }
        }
      } catch (err: any) {
        console.warn('Native identifyFish uploadAsync failed, falling back:', err?.message);
      }
    }

    const formData = new FormData();
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      formData.append('file', blob, name);
    } catch {
      formData.append('file', { uri, name, type: 'image/jpeg' } as any);
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Fish snapshot identification failed');
    const result = await res.json();
    return result.data;
  },

  async sendLiveFrame(base64Image: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/comp2/live-frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64Image }),
    });
    if (!res.ok) throw new Error('Live frame stream error');
    return res.json();
  },

  async getAquioStatus(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/aquio/status`);
    if (!res.ok) throw new Error('Failed to fetch Aquio bridge status');
    return res.json();
  },

  async syncAquioNow(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/aquio/sync-now`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger manual Aquio sync');
    return res.json();
  },
};
