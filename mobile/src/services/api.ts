import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Auto-detect the development machine's IP (e.g. 192.168.1.107) from Expo Metro bundler
const debuggerHost = Constants.expoConfig?.hostUri;
const detectedIp = debuggerHost ? debuggerHost.split(':')[0] : '192.168.1.107';

export let API_BASE_URL = Platform.OS === 'android' && !debuggerHost
  ? 'http://10.0.2.2:8000'
  : (Platform.OS === 'web' ? 'http://localhost:8000' : `http://${detectedIp}:8000`);

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
    const formData = new FormData();
    const name = filename || uri.split('/').pop() || 'captured_tank_video.mp4';

    if (Platform.OS === 'web') {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append('file', blob, name);
      } catch (e) {
        formData.append('file', { uri, name, type: 'video/mp4' } as any);
      }
    } else {
      formData.append('file', {
        uri,
        name,
        type: 'video/mp4',
      } as any);
    }

    const res = await fetch(`${API_BASE_URL}/api/comp2/analyze-video`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Video behavioral analysis failed');
    const result = await res.json();
    return result.data;
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
