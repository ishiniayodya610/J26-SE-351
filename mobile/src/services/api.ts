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
  // v2 multi-track fields (optional so older backend responses still parse)
  video?: VideoMeta;
  summary?: TrackSummaryCounts;
  tracks?: TrackResult[];
  timeline?: TimelineEntry[];
  annotated_video_url?: string | null;
}

export type TrackBehaviorStatus =
  | 'PROTOTYPE_NORMAL'
  | 'PROTOTYPE_ABNORMAL'
  | 'INSUFFICIENT_DATA'
  | 'UNKNOWN_SPECIES';
export type TrackPosition = 'Top' | 'Middle' | 'Bottom';
export type TrackDirection = 'Left' | 'Right' | 'Up' | 'Down' | 'Stationary';
/** Normalised [x1, y1, x2, y2], each 0–1 of the source frame. */
export type NormBox = [number, number, number, number];

export interface VideoMeta {
  width: number;
  height: number;
  fps: number;
  analyzed_fps: number;
  duration_s: number;
  truncated?: boolean;
}

export interface TrackSummaryCounts {
  tracked: number;
  normal: number;
  abnormal: number;
  insufficient: number;
  /** Tracks dropped as non-fish (low confidence / implausible shape). Older responses omit it. */
  filtered?: number;
}

export interface TrackResult {
  track_id: number;
  species: string;
  species_confidence: number;
  first_t: number;
  last_t: number;
  frames: number;
  avg_speed_bl_s: number;
  max_speed_bl_s: number;
  stationary_percent: number;
  position: TrackPosition;
  direction: TrackDirection;
  behavior_status: TrackBehaviorStatus;
  reason: string[];
}

export interface TimelineBox {
  id: number;
  xyxy: NormBox;
  species?: string;
  speed?: number;
  dir?: TrackDirection;
  status?: string;
}

export interface TimelineEntry {
  t: number;
  boxes: TimelineBox[];
}

/** One box in a live `tracks` WS message. `status` is ANALYSING until ≥ 3 s history. */
export interface LiveBox extends TimelineBox {
  confidence?: number;
  position?: TrackPosition;
  reason?: string[];
}

export type LiveServerMessage =
  | { type: 'tracks'; t: number; analysis_fps: number; frame_w: number; frame_h: number; boxes: LiveBox[] }
  | { type: 'error'; detail: string };

export function resolveApiUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** WS URL for live tracking, derived from the current API base URL. */
export function liveTrackingWsUrl(): string {
  return `${API_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/api/comp2/live`;
}

export interface LiveTrackingClient {
  sendFrame(jpegB64: string, t: number): boolean;
  reset(): void;
  close(): void;
}

/** Thin WS client for `/api/comp2/live`. Only sends when the socket is open. */
export function connectLiveTracking(handlers: {
  onMessage: (msg: LiveServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (detail: string) => void;
}): LiveTrackingClient {
  const ws = new WebSocket(liveTrackingWsUrl());
  ws.onopen = () => handlers.onOpen?.();
  ws.onclose = () => handlers.onClose?.();
  ws.onerror = () => handlers.onError?.(`Live tracking socket error (${liveTrackingWsUrl()})`);
  ws.onmessage = (ev) => {
    try {
      handlers.onMessage(JSON.parse(String(ev.data)) as LiveServerMessage);
    } catch {
      handlers.onError?.('Malformed live tracking message');
    }
  };
  const send = (obj: object) => {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  };
  return {
    sendFrame: (jpegB64, t) => send({ type: 'frame', t, jpeg_b64: jpegB64 }),
    reset: () => void send({ type: 'reset' }),
    close: () => ws.close(),
  };
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

  async analyzeVideo(uri: string, filename?: string, annotate = false): Promise<VideoAnalysisData> {
    const targetUrl = `${API_BASE_URL}/api/comp2/analyze-video${annotate ? '?annotate=true' : ''}`;
    const name = filename || uri.split('/').pop() || 'captured_tank_video.mp4';

    const connection = new AbortController();
    const connectionTimer = setTimeout(() => connection.abort(), 15_000);
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
              void task.cancelAsync().catch(() => { });
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

// ---------------------------------------------------------------------------
// Phase 2: Auth, Multi-Tank & Device Provisioning Interfaces & Client
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

let authToken: string | null = null;
const TOKEN_KEY = '@aquaguard_auth_token';

export async function initAuthSession(): Promise<string | null> {
  try {
    const saved = await AsyncStorage.getItem(TOKEN_KEY);
    authToken = saved;
    return saved;
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string | null) {
  authToken = token;
  try {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage fallback
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface TankCreatePayload {
  name: string;
  dimensions?: { length_cm: number; width_cm: number; height_cm: number };
  volume_liters: number;
  fish_types: string[];
  fish_count: number;
  tank_type: 'HOME' | 'FARMING';
  target_temp_c?: number;
  target_ph?: number;
  target_tds_ppm?: number;
}

export interface TankItem {
  id: string;
  owner_id: string;
  name: string;
  dimensions?: { length_cm: number; width_cm: number; height_cm: number };
  volume_liters: number;
  fish_types: string[];
  fish_count: number;
  tank_type: string;
  target_temp_c: number;
  target_ph: number;
  target_tds_ppm: number;
  bioload: {
    liters_per_fish: number;
    level: 'OPTIMAL' | 'MODERATE' | 'OVERSTOCKED';
    description: string;
  };
  device_id: string | null;
  created_at: string;
}

export interface ProvisionDeviceResponse {
  provision_token: string;
  device_uid_prefix: string;
  expires_in_seconds: number;
  qr_payload: string;
}

export const authApi = {
  async register(data: { full_name: string; email: string; password: string }): Promise<UserProfile> {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Invalid email or password');
    }
    const result: AuthResponse = await res.json();
    setAuthToken(result.access_token);
    return result;
  },

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }).catch(() => {});
    setAuthToken(null);
  },
};

export const tankManagementApi = {
  async listTanks(): Promise<TankItem[]> {
    const res = await fetch(`${API_BASE_URL}/tanks`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch tanks');
    return res.json();
  },

  async createTank(data: TankCreatePayload): Promise<TankItem> {
    const res = await fetch(`${API_BASE_URL}/tanks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create tank');
    }
    return res.json();
  },

  async getTank(tankId: string): Promise<TankItem> {
    const res = await fetch(`${API_BASE_URL}/tanks/${tankId}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch tank details');
    return res.json();
  },

  async updateTank(tankId: string, data: Partial<TankCreatePayload>): Promise<TankItem> {
    const res = await fetch(`${API_BASE_URL}/tanks/${tankId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update tank');
    return res.json();
  },

  async deleteTank(tankId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/tanks/${tankId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete tank');
  },
};

export const deviceProvisionApi = {
  async generateProvisionToken(tankId: string): Promise<ProvisionDeviceResponse> {
    const res = await fetch(`${API_BASE_URL}/devices/provision`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tank_id: tankId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to generate device provision token');
    }
    return res.json();
  },

  async getDeviceForTank(tankId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/devices/tank/${tankId}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  },

  async bindDeviceManually(tankId: string, deviceUid: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/devices/bind`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tank_id: tankId, device_uid: deviceUid }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to bind device to tank');
    }
    return res.json();
  },
};

const ACTIVE_TANK_KEY = '@aquaguard_active_tank_id';

export async function getActiveTankId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_TANK_KEY);
  } catch {
    return null;
  }
}

export async function setActiveTankId(tankId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_TANK_KEY, tankId);
  } catch {}
}

export async function checkHasAssignedHub(): Promise<{ hasHub: boolean; activeTank: TankItem | null; allTanks: TankItem[] }> {
  try {
    const tanks = await tankManagementApi.listTanks();
    if (!tanks || tanks.length === 0) {
      return { hasHub: false, activeTank: null, allTanks: [] };
    }
    const savedTankId = await getActiveTankId();
    const activeTank = tanks.find((t) => t.id === savedTankId) || tanks[0];
    const hasHub = Boolean(activeTank && activeTank.device_id);
    return { hasHub, activeTank, allTanks: tanks };
  } catch {
    return { hasHub: false, activeTank: null, allTanks: [] };
  }
}



