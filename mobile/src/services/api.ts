import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Auto-detect the development machine's IP (e.g. 192.168.1.107) from Expo Metro bundler
// Set MANUAL_DEV_IP to e.g. '192.168.1.107' or '10.0.2.2' (Android emulator) if manual override is needed
export const MANUAL_DEV_IP: string | null = null;

const debuggerHost = Constants.expoConfig?.hostUri;
const detectedIp = MANUAL_DEV_IP || (debuggerHost ? debuggerHost.split(':')[0] : '192.168.1.107');

export let API_BASE_URL = Platform.OS === 'android' && !debuggerHost && !MANUAL_DEV_IP
  ? 'http://10.0.2.2:8000'
  : (Platform.OS === 'web' ? 'http://localhost:8000' : `http://${detectedIp}:8000`);

export function setCustomApiHost(host: string) {
  API_BASE_URL = host.startsWith('http') ? host : `http://${host}:8000`;
}

// ---------------------------------------------------------------------------
// Prediction API Interfaces (Random Forest ML Models)
// ---------------------------------------------------------------------------
export interface AmmoniaPredictionInput {
  temperature: number;
  dissolved_oxygen: number;
  ph: number;
  turbidity: number;
  nitrate: number;
  ammonia?: number;
}

export interface WhiteSpotPredictionInput {
  temperature: number;
  dissolved_oxygen: number;
  ph: number;
  turbidity: number;
  ammonia?: number;
  nitrate?: number;
}

export interface PredictionResponse {
  risk_probability: number;
  prediction: 'high_risk' | 'low_risk' | string;
  model: string;
}

// ---------------------------------------------------------------------------
// Prediction Service Functions
// ---------------------------------------------------------------------------

/**
 * Calls backend POST /predict/ammonia with water-quality parameters.
 * Uses the Random Forest ammonia spike model.
 */
export async function predictAmmonia(data: AmmoniaPredictionInput): Promise<PredictionResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/predict/ammonia`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Ammonia prediction failed (${res.status}): ${errorText || res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    console.error('Error calling predictAmmonia:', err);
    throw new Error(err.message || 'Network error while calling ammonia prediction endpoint');
  }
}

/**
 * Calls backend POST /predict/whitespot with water-quality parameters.
 * Uses the Random Forest white spot disease risk model.
 */
export async function predictWhiteSpot(data: WhiteSpotPredictionInput): Promise<PredictionResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/predict/whitespot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`White spot prediction failed (${res.status}): ${errorText || res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    console.error('Error calling predictWhiteSpot:', err);
    throw new Error(err.message || 'Network error while calling white spot prediction endpoint');
  }
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
  predictAmmonia,
  predictWhiteSpot,

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

  async getActiveProfile(): Promise<FishProfile> {
    const res = await fetch(`${API_BASE_URL}/api/fish/active`);
    if (!res.ok) throw new Error('Failed to fetch active profile');
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

    // 1. On iOS & Android Native: Use Expo FileSystem native multipart uploader
    // This streams the file directly from device storage, avoiding FormDataPart crashes
    if (Platform.OS !== 'web') {
      try {
        const { uploadAsync, FileSystemUploadType } = require('expo-file-system/legacy');
        if (uploadAsync && FileSystemUploadType) {
          const isMov = name.toLowerCase().endsWith('.mov');
          const isWebm = name.toLowerCase().endsWith('.webm');
          const uploadRes = await uploadAsync(targetUrl, uri, {
            httpMethod: 'POST',
            uploadType: FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType: isMov ? 'video/quicktime' : (isWebm ? 'video/webm' : 'video/mp4'),
            parameters: {},
          });

          if (uploadRes.status >= 200 && uploadRes.status < 300) {
            const parsed = JSON.parse(uploadRes.body);
            return parsed.data;
          } else {
            throw new Error(`Upload failed (${uploadRes.status}): ${uploadRes.body}`);
          }
        }
      } catch (nativeErr: any) {
        console.warn('Native uploadAsync failed, falling back to Blob upload:', nativeErr?.message);
      }
    }

    // 2. On Web or Fallback: Standard fetch with real Blob
    const formData = new FormData();
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      formData.append('file', blob, name);
    } catch (blobErr) {
      console.warn('Could not convert URI to blob:', blobErr);
      formData.append('file', {
        uri,
        name,
        type: name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4',
      } as any);
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Video behavioral analysis failed: ${res.status} ${errText}`);
    }
    const result = await res.json();
    return result.data;
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

  async getTankConfig(tankId: number = 5): Promise<TankConfig> {
    const res = await fetch(`${API_BASE_URL}/api/tank/config?tank_id=${tankId}`);
    if (!res.ok) throw new Error('Failed to fetch tank configuration');
    return res.json();
  },

  async updateTankConfig(data: {
    tank_id?: number;
    tank_name?: string;
    volume_liters: number;
    fish_types: string[];
    fish_count: number;
  }): Promise<TankConfig> {
    const res = await fetch(`${API_BASE_URL}/api/tank/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update tank configuration');
    return res.json();
  },

  async getHardwareRelays(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/aquio/relays`);
    if (!res.ok) throw new Error('Failed to fetch hardware relays');
    return res.json();
  },

  async toggleHardwareRelay(relayName: 'heater' | 'ph_pump', state?: boolean): Promise<any> {
    const url = state !== undefined 
      ? `${API_BASE_URL}/api/aquio/relays/${relayName}/toggle?state=${state}`
      : `${API_BASE_URL}/api/aquio/relays/${relayName}/toggle`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to toggle ${relayName} relay`);
    return res.json();
  },
};

export interface TankConfig {
  tank_id: number;
  tank_name: string;
  volume_liters: number;
  fish_types: string[];
  fish_count: number;
  bioload_level: 'OPTIMAL' | 'MODERATE' | 'OVERSTOCKED' | string;
  liters_per_fish: number;
  bioload_desc?: string;
  updated_at: string;
  db_engine: string;
}

