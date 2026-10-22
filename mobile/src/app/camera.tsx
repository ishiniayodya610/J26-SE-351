import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Platform,
  Linking 
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { 
  Video as VideoIcon, 
  Scan, 
  CheckCircle2, 
  Activity, 
  Eye, 
  Radio, 
  RefreshCw,
  Film,
  Upload,
  Play,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Sparkles,
  Camera as CameraIcon,
  RotateCcw,
  Square,
  Target,
  X
} from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { api, BehaviorData, VideoAnalysisData } from '@/services/api';
import { LiveTrackingView } from '@/components/vision/LiveTrackingView';
import { VisionMonitor } from '@/components/vision/VisionMonitor';
import fixtureV2 from '@/features/vision/__fixtures__/analyze-video-v2.json';
import { triggerAnomalyHaptic, triggerResolvedHaptic, triggerSelectionHaptic } from '@/services/haptics';

export interface LiveTargetData {
  id?: number;
  detected?: boolean;
  species_id?: string;
  common_name?: string;
  scientific_name?: string;
  confidence?: number;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  position?: string;
  posture?: string;
  speed_bl_s?: number;
  status?: string;
  target_parameters?: {
    temp: number;
    ph: number;
    tds: number;
  };
  message?: string;
}

// Fluid Reanimated Multi-Fish Reticle with Spring Motion Interpolation
interface FishReticleProps {
  target: LiveTargetData;
  viewportWidth: number;
  viewportHeight: number;
}

const FishTargetReticle: React.FC<FishReticleProps> = ({ target, viewportWidth, viewportHeight }) => {
  const targetX = Math.max(0, (target.box?.x ?? 0) * viewportWidth);
  const targetY = Math.max(0, (target.box?.y ?? 0) * viewportHeight);
  const targetW = Math.min(viewportWidth, Math.max(80, (target.box?.width ?? 0.2) * viewportWidth));
  const targetH = Math.min(viewportHeight, Math.max(60, (target.box?.height ?? 0.15) * viewportHeight));

  const animX = useSharedValue(targetX);
  const animY = useSharedValue(targetY);
  const animW = useSharedValue(targetW);
  const animH = useSharedValue(targetH);

  useEffect(() => {
    animX.value = withSpring(targetX, { damping: 15, stiffness: 90 });
    animY.value = withSpring(targetY, { damping: 15, stiffness: 90 });
    animW.value = withSpring(targetW, { damping: 15, stiffness: 90 });
    animH.value = withSpring(targetH, { damping: 15, stiffness: 90 });
  }, [targetX, targetY, targetW, targetH]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: animX.value },
      { translateY: animY.value }
    ],
    width: animW.value,
    height: animH.value,
  }));

  const isBetta = target.species_id?.toLowerCase() === 'betta';
  const isGuppy = target.species_id?.toLowerCase() === 'guppy';
  // Distinct neon palette: Betta (Cyan #00E5FF), Guppy (Emerald #00E676), Swordtail (Amber #FF9100)
  const themeColor = isBetta ? '#00E5FF' : isGuppy ? '#00E676' : '#FF9100';
  const isNearTop = (target.box?.y ?? 0) < 0.28;

  return (
    <Animated.View
      style={[
        styles.liveTargetBox,
        animatedStyle,
        { 
          borderColor: themeColor,
          backgroundColor: isBetta ? 'rgba(0, 229, 255, 0.08)' : isGuppy ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 145, 0, 0.08)'
        }
      ]}
      pointerEvents="none"
    >
      {/* High-tech Reticle Corner Brackets */}
      <View style={[styles.reticleTL, { borderColor: themeColor }]} />
      <View style={[styles.reticleTR, { borderColor: themeColor }]} />
      <View style={[styles.reticleBL, { borderColor: themeColor }]} />
      <View style={[styles.reticleBR, { borderColor: themeColor }]} />

      {/* Floating Telemetry Glass Card */}
      <View style={[
        styles.floatingHud,
        isNearTop ? styles.floatingHudBelow : styles.floatingHudAbove,
        { borderColor: themeColor }
      ]}>
        <View style={styles.floatingHudHeader}>
          <View style={[styles.livePulseDot, { backgroundColor: themeColor }]} />
          <Text style={styles.floatingFishName} numberOfLines={1}>
            {target.common_name || 'Fish'}
          </Text>
          <View style={[styles.floatingConfBadge, { borderColor: themeColor }]}>
            <Text style={[styles.floatingConfidence, { color: themeColor }]}>
              {((target.confidence || 0) * 100).toFixed(0)}%
            </Text>
          </View>
        </View>

        <View style={styles.floatingHudDivider} />

        <View style={styles.floatingHudBody}>
          <Text style={styles.floatingStat}>
            SPEED: <Text style={[styles.floatingHighlight, { color: themeColor }]}>
              {target.speed_bl_s !== undefined ? `${target.speed_bl_s.toFixed(2)} BL/s` : '0.30 BL/s'}
            </Text> • {target.status}
          </Text>
          <Text style={styles.floatingStat}>
            POSTURE: <Text style={[styles.floatingHighlight, { color: themeColor }]}>{target.posture || 'Normal'}</Text>
          </Text>
          <Text style={styles.floatingStat}>
            ZONE: <Text style={[styles.floatingHighlight, { color: themeColor }]}>{target.position || 'Middle'}</Text>
          </Text>
          {target.target_parameters && (
            <Text style={[styles.floatingParam, { color: themeColor }]}>
              TARGET: {target.target_parameters.temp}°C | pH {target.target_parameters.ph} | {target.target_parameters.tds}ppm
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

export default function CameraVisionScreen() {
  const [mode, setMode] = useState<'farming' | 'handheld'>('handheld');
  const [behavior, setBehavior] = useState<BehaviorData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [videoResult, setVideoResult] = useState<VideoAnalysisData | null>(null);
  const [activeVideoUri, setActiveVideoUri] = useState<string | null>(null);
  const [liveTracking, setLiveTracking] = useState(false);

  // Hybrid 60 FPS Viewfinder & Multi-Fish Target Lock State
  const [autoRadar, setAutoRadar] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [liveTargets, setLiveTargets] = useState<LiveTargetData[]>([]);
  const [scanFeedbackMsg, setScanFeedbackMsg] = useState<string | null>(null);
  const [viewportDim, setViewportDim] = useState({ width: 0, height: 0 });
  const liveInFlightRef = useRef(false);
  const feedbackTimeoutRef = useRef<any>(null);

  // Camera state & permissions
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraAvailable = Platform.OS === 'web' || permission?.granted;
  const analysisInFlightRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  
  // Native camera ref
  const cameraRef = useRef<CameraView>(null);
  const recordIntervalRef = useRef<any>(null);

  // Web webcam fallback refs
  const webVideoRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<any>(null);

  const loadBehavior = async () => {
    try {
      const data = await api.getLiveBehavior();
      setBehavior(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadBehavior();
    const interval = setInterval(loadBehavior, 3000);
    return () => clearInterval(interval);
  }, []);

  // Web Camera Stream Initializer
  useEffect(() => {
    if (Platform.OS === 'web') {
      let isMounted = true;
      const initWebCam = async () => {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { width: 1280, height: 720 },
              audio: false,
            });
            if (isMounted) {
              webStreamRef.current = stream;
              if (webVideoRef.current) {
                webVideoRef.current.srcObject = stream;
                webVideoRef.current.play().catch(() => {});
              }
            }
          }
        } catch (e) {
          console.log('Webcam permission or device not accessible:', e);
        }
      };

      initWebCam();

      return () => {
        isMounted = false;
        if (webStreamRef.current) {
          webStreamRef.current.getTracks().forEach((track: any) => track.stop());
        }
      };
    }
  }, [mode]);

  // Recording Timer
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds(prev => {
          if (prev >= 15) {
            handleStopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    }
    return () => {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, [isRecording]);

  // 1-Tap Snapshot Scan & Lock Target (Silky 60 FPS Camera Viewfinder)
  const handleScanFish = async () => {
    if (isScanning || isRecording || liveInFlightRef.current) return;
    triggerSelectionHaptic();
    setIsScanning(true);
    liveInFlightRef.current = true;
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setScanFeedbackMsg('SCANNING WATER COLUMN...');

    const applyDetectionResult = (data: any) => {
      if (data.detected && data.targets && data.targets.length > 0) {
        setLiveTargets(data.targets);
        triggerResolvedHaptic();
        setScanFeedbackMsg(`LOCKED ${data.targets.length} FISH IN WATER COLUMN`);
      } else if (data.detected) {
        setLiveTargets([data]);
        triggerResolvedHaptic();
        setScanFeedbackMsg(`LOCKED: ${data.common_name?.toUpperCase()}`);
      } else {
        setLiveTargets([]);
        setScanFeedbackMsg('No fish in frame. Point at Betta, Guppy, or Swordtail.');
      }
    };

    try {
      if (Platform.OS === 'web') {
        if (webVideoRef.current && webVideoRef.current.videoWidth > 0) {
          const video = webVideoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480) || 270;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const b64 = canvas.toDataURL('image/jpeg', 0.5);
            const data = await api.sendLiveFrame(b64);
            applyDetectionResult(data);
          }
        }
      } else {
        // Native iOS / Android (Single lightweight snapshot on demand)
        if (cameraRef.current) {
          const photo = await (cameraRef.current as any).takePictureAsync({
            quality: 0.35,
            base64: true,
            skipProcessing: true,
          });
          if (photo?.base64) {
            const data = await api.sendLiveFrame(photo.base64);
            applyDetectionResult(data);
          }
        }
      }
    } catch (err) {
      console.warn('Scan frame error:', err);
      setScanFeedbackMsg('Scan connection issue. Check server.');
    } finally {
      setIsScanning(false);
      liveInFlightRef.current = false;
      feedbackTimeoutRef.current = setTimeout(() => {
        setScanFeedbackMsg(null);
      }, 3500);
    }
  };

  const handleClearLock = () => {
    triggerSelectionHaptic();
    setLiveTargets([]);
    setScanFeedbackMsg(null);
  };

  // Optional Throttled Auto-Radar (Cadence of 2.5s to preserve 60 FPS fluid preview)
  useEffect(() => {
    if (!autoRadar || isRecording || mode !== 'handheld') return;

    const interval = setInterval(() => {
      handleScanFish();
    }, 2500);

    return () => clearInterval(interval);
  }, [autoRadar, isRecording, mode]);

  // Flip Camera Lens
  const toggleCameraFacing = () => {
    triggerSelectionHaptic();
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // 1. Start Live Viewfinder Video Recording
  const handleStartRecording = async () => {
    triggerSelectionHaptic();
    if (!cameraAvailable || analyzing) return;
    setIsRecording(true);

    if (Platform.OS === 'web') {
      try {
        if (!webStreamRef.current) {
          Alert.alert('Webcam Error', 'Webcam stream not active. Please check browser permissions.');
          setIsRecording(false);
          return;
        }
        recordedChunksRef.current = [];
        const recorder = new (window as any).MediaRecorder(webStreamRef.current, {
          mimeType: 'video/webm',
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event: any) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const uri = URL.createObjectURL(blob);
          setActiveVideoUri(uri);
          await processVideoUpload(uri, 'live_webcam_clip.webm');
        };

        recorder.start();
      } catch (err) {
        console.error('Web recording error:', err);
        setIsRecording(false);
      }
    } else {
      // Native (iOS / Android)
      if (cameraRef.current) {
        setTimeout(async () => {
          if (!cameraRef.current) return;
          try {
            const videoPromise = cameraRef.current.recordAsync({
              maxDuration: 15,
            });
            videoPromise.then(async (data) => {
              if (data?.uri) {
                setActiveVideoUri(data.uri);
                const fname = data.uri.split('/').pop() || 'live_tank_video.mp4';
                await processVideoUpload(data.uri, fname);
              }
            }).catch(err => {
              console.error('Record error:', err);
            }).finally(() => {
              setIsRecording(false);
            });
          } catch (err) {
            console.error('Native record start error:', err);
            setIsRecording(false);
          }
        }, 150);
      }
    }
  };

  // 2. Stop Recording
  const handleStopRecording = () => {
    triggerSelectionHaptic();
    setIsRecording(false);

    if (Platform.OS === 'web') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } else {
      if (cameraRef.current) {
        cameraRef.current.stopRecording();
      }
    }
  };

  // 3. Fallback: Launch External OS Camera
  const handleLaunchExternalCamera = async () => {
    try {
      triggerSelectionHaptic();
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Required', 'Please enable camera access to record tank behavior videos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 15,
        quality: 0.8,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setActiveVideoUri(asset.uri);
        const fname = asset.fileName || asset.uri.split('/').pop() || 'tank_capture.mp4';
        await processVideoUpload(asset.uri, fname);
      }
    } catch (err) {
      console.error('External camera error:', err);
      Alert.alert('Recording Note', 'Use the live viewfinder above or select from gallery.');
    }
  };

  // 4. Pick Existing Tank Video from Device Library
  const handlePickVideo = async () => {
    try {
      triggerSelectionHaptic();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.8,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setActiveVideoUri(asset.uri);
        const fname = asset.fileName || asset.uri.split('/').pop() || 'tank_library_clip.mp4';
        await processVideoUpload(asset.uri, fname);
      }
    } catch (err) {
      console.error('Library pick error:', err);
      Alert.alert('Picker Error', 'Could not open video library.');
    }
  };

  // 5. Process Video Upload & Run Backend Behavioral AI
  const processVideoUpload = async (uri: string, filename: string) => {
    if (analysisInFlightRef.current) return;
    analysisInFlightRef.current = true;
    setAnalyzing(true);
    setVideoResult(null);
    try {
      const data = await api.analyzeVideo(uri, filename);
      setVideoResult(data);
      triggerResolvedHaptic();
    } catch (err) {
      console.error('Video analysis failed:', err);
      Alert.alert('Analysis failed', err instanceof Error ? err.message : 'Could not analyze this video. Check the backend connection and try again.');
    } finally {
      analysisInFlightRef.current = false;
      setAnalyzing(false);
    }
  };

  // 6. Quick 1-Click Demo Tank Clip for Evaluators
  const handleSimulatedClip = async (speciesKey: string) => {
    triggerSelectionHaptic();
    setAnalyzing(true);
    setVideoResult(null);
    setActiveVideoUri(null);
    try {
      await new Promise(r => setTimeout(r, 1200));
      const res = await api.setActiveProfile(speciesKey);
      
      const mockResult: VideoAnalysisData = {
        species_id: res.species_id,
        common_name: res.common_name,
        scientific_name: res.scientific_name,
        confidence: 0.982,
        video_filename: `${speciesKey}_tank_behavior_1080p.mp4`,
        video_size_kb: 3420.5,
        frames_processed: 240,
        swimming_activity_pct: 88.5,
        lethargy_index_pct: 11.5,
        surface_piping: "None Detected (Optimal O2)",
        feeding_response: "Active & Responsive",
        health_status: "VIGOROUS / NORMAL HEALTH",
        target_parameters: {
          temp: res.water_requirements.temperature_c,
          ph: res.water_requirements.ph,
          tds: res.water_requirements.tds_ppm,
        },
        care_notes: res.vulnerability_notes,
      };
      setVideoResult(mockResult);
      triggerResolvedHaptic();
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Format seconds as MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode Switcher Tabs */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity 
          style={[styles.switchBtn, mode === 'handheld' && styles.switchBtnActive]} 
          onPress={() => {
            triggerSelectionHaptic();
            setMode('handheld');
          }}
        >
          <Film size={16} color={mode === 'handheld' ? '#0B0F19' : '#94A3B8'} />
          <Text style={[styles.switchText, mode === 'handheld' && styles.switchTextActive]}>
            Camera
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.switchBtn, mode === 'farming' && styles.switchBtnActive]} 
          onPress={() => {
            triggerSelectionHaptic();
            setMode('farming');
          }}
        >
          <Radio size={16} color={mode === 'farming' ? '#0B0F19' : '#94A3B8'} />
          <Text style={[styles.switchText, mode === 'farming' && styles.switchTextActive]}>
            IP Camera
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.btnSecondary, { alignSelf: 'flex-start', marginBottom: 12 }, liveTracking && { backgroundColor: 'rgba(255,23,68,0.2)' }]}
        onPress={() => setLiveTracking((v) => !v)}
      >
        <Radio size={14} color={liveTracking ? '#FF1744' : '#00E5FF'} />
        <Text style={styles.btnSecondaryText}>{liveTracking ? 'Stop Live Tracking' : 'Live Tracking'}</Text>
      </TouchableOpacity>

      {liveTracking ? (
        <LiveTrackingView active={liveTracking} />
      ) : mode === 'handheld' ? (
        /* LIVE CAMERA VIEWFINDER & BEHAVIOR SCANNER */
        <View>
          <View style={styles.viewfinderCard}>
            <View style={styles.viewfinderHeader}>
              <View style={styles.lensInfo}>
                <View style={[styles.liveDot, isRecording ? styles.liveDotRecording : null]} />
                <Text style={styles.viewfinderTitle}>
                  {isRecording ? `REC ${formatTime(recordSeconds)} / 00:15` : 'Live camera'}
                </Text>
              </View>

              <View style={styles.headerBtnGroup}>
                <TouchableOpacity 
                  style={[styles.arToggleBtn, autoRadar && styles.arToggleBtnActive]} 
                  onPress={() => {
                    triggerSelectionHaptic();
                    setAutoRadar(!autoRadar);
                  }}
                  activeOpacity={0.7}
                >
                  <Radio size={13} color={autoRadar ? '#0B0F19' : '#00E5FF'} />
                  <Text style={[styles.arToggleBtnText, autoRadar && styles.arToggleBtnTextActive]}>
                    {autoRadar ? 'Radar on' : 'Radar off'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.flipBtn} 
                  onPress={toggleCameraFacing}
                  activeOpacity={0.7}
                >
                  <RotateCcw size={14} color="#00E5FF" />
                  <Text style={styles.flipBtnText}>Flip</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Embedded Live Camera Feed Viewport */}
            <View 
              style={styles.viewportContainer}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) {
                  setViewportDim({ width, height });
                }
              }}
            >
              {Platform.OS === 'web' ? (
                /* Web Browser Webcam Feed */
                <View style={styles.cameraFrame}>
                  <video
                    ref={webVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: 12,
                      transform: facing === 'front' ? 'scaleX(-1)' : 'none',
                    }}
                  />
                </View>
              ) : (
                /* Native Mobile Device Camera (iOS / Android) */
                permission?.granted ? (
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing={facing}
                    mode={isRecording ? 'video' : 'picture'}
                  />
                ) : (
                  <View style={styles.permissionBox}>
                    <CameraIcon size={36} color="#00E5FF" />
                    <Text style={styles.permissionTitle}>Camera Permission Needed</Text>
                    <Text style={styles.permissionSub}>
                      Enable camera access to view the live fish tank stream and record behavioral kinematics.
                    </Text>
                    <TouchableOpacity 
                      style={styles.btnPermission}
                      onPress={() => permission?.canAskAgain ? requestPermission() : Linking.openSettings()}
                    >
                      <Text style={styles.btnPermissionText}>{permission?.canAskAgain ? 'Allow Camera' : 'Open Settings'}</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}

              {cameraAvailable && (<>
              {/* Tap Viewfinder Screen to Scan */}
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={0.9}
                onPress={handleScanFish}
              />

              {/* Real Water Column Depth Strata Guides (matching backend 33.3% / 66.7% thresholds) */}
              <View style={styles.strataOverlay} pointerEvents="none">
                <View style={styles.strataZoneTop}>
                  <View style={styles.strataTag}>
                    <Text style={styles.strataTagText}>Surface</Text>
                  </View>
                </View>
                <View style={styles.strataZoneMid}>
                  <View style={styles.strataTag}>
                    <Text style={styles.strataTagText}>Middle</Text>
                  </View>
                </View>
                <View style={styles.strataZoneBot}>
                  <View style={styles.strataTag}>
                    <Text style={styles.strataTagText}>Bottom</Text>
                  </View>
                </View>
              </View>

              {/* Active Laser Scanning Beam Animation */}
              {isScanning && (
                <View style={styles.scanBeamContainer} pointerEvents="none">
                  <View style={styles.scanBeamGlow} />
                  <View style={styles.scanBeamLine} />
                </View>
              )}

              {/* Dynamic Multi-Fish AR Targets with Reanimated Spring Smoothing */}
              {!isRecording && liveTargets.length > 0 && viewportDim.width > 0 && (
                liveTargets.map((tgt, i) => (
                  <FishTargetReticle
                    key={tgt.id || i}
                    target={tgt}
                    viewportWidth={viewportDim.width}
                    viewportHeight={viewportDim.height}
                  />
                ))
              )}

              {/* HUD / Optical Tracking Crosshairs & Overlays */}
              <View style={styles.crosshairTopLeft} pointerEvents="none" />
              <View style={styles.crosshairTopRight} pointerEvents="none" />
              <View style={styles.crosshairBottomLeft} pointerEvents="none" />
              <View style={styles.crosshairBottomRight} pointerEvents="none" />

              {/* Status Header Overlay */}
              <View style={styles.hudOverlay} pointerEvents="none">
                <View style={[styles.aiTrackBadge, liveTargets.length > 0 && styles.aiTrackBadgeLocked]}>
                  <Sparkles size={12} color={liveTargets.length > 0 ? '#00E676' : isScanning ? '#FFD600' : '#00E5FF'} />
                  <Text style={[styles.aiTrackText, liveTargets.length > 0 && { color: '#00E676' }]}>
                    {isRecording 
                      ? 'TRACKING KINEMATICS ACTIVE • 15s REC' 
                      : isScanning
                      ? 'AI SCANNING WATER COLUMN...'
                      : scanFeedbackMsg
                      ? scanFeedbackMsg
                      : liveTargets.length > 0
                      ? `LOCKED ${liveTargets.length} FISH IN TANK`
                      : 'Tap to scan'}
                  </Text>
                </View>
              </View>

              {/* Viewfinder Recording Action Controls */}
              <View style={styles.viewfinderControls}>
                {!isRecording ? (
                  <View style={styles.controlsRow}>
                    <TouchableOpacity 
                      style={[styles.scanActionBtn, isScanning && styles.scanActionBtnBusy]}
                      activeOpacity={0.8}
                      onPress={handleScanFish}
                      disabled={isScanning || analyzing || isRecording}
                    >
                      {isScanning ? (
                        <ActivityIndicator size="small" color="#0B0F19" />
                      ) : (
                        <Target size={16} color="#0B0F19" />
                      )}
                      <Text style={styles.scanActionText}>
                        {isScanning ? 'SCANNING...' : liveTargets.length > 0 ? `RESCAN (${liveTargets.length} LOCKED)` : 'Scan'}
                      </Text>
                    </TouchableOpacity>

                    {liveTargets.length > 0 && (
                      <TouchableOpacity 
                        style={styles.clearLockBtn}
                        activeOpacity={0.7}
                        onPress={handleClearLock}
                      >
                        <X size={16} color="#FF1744" />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity 
                      style={styles.recordActionMiniBtn}
                      activeOpacity={0.85}
                      onPress={handleStartRecording}
                      disabled={analyzing}
                    >
                      <View style={styles.innerRecordCircle} />
                      <Text style={styles.recordActionMiniText}>Record 15s</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.stopActionBtn}
                    activeOpacity={0.85}
                    onPress={handleStopRecording}
                  >
                    <Square size={18} color="#FFFFFF" fill="#FFFFFF" />
                    <Text style={styles.stopActionText}>Stop & Analyze</Text>
                  </TouchableOpacity>
                )}
              </View>
              </>)}
            </View>

            {/* Supplementary Video Pickers */}
            <View style={styles.secondaryActions}>
              <TouchableOpacity 
                style={styles.btnSecondary} 
                onPress={handlePickVideo}
                disabled={analyzing || isRecording}
              >
                <Upload size={14} color="#00E5FF" />
                <Text style={styles.btnSecondaryText}>Upload Video</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.btnSecondary} 
                onPress={handleLaunchExternalCamera}
                disabled={analyzing || isRecording}
              >
                <VideoIcon size={14} color="#00E5FF" />
                <Text style={styles.btnSecondaryText}>Open Camera</Text>
              </TouchableOpacity>

              {__DEV__ && (
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => {
                    setActiveVideoUri(null);
                    setVideoResult(fixtureV2.data as unknown as VideoAnalysisData);
                  }}
                  disabled={analyzing || isRecording}
                >
                  <Film size={14} color="#00E5FF" />
                  <Text style={styles.btnSecondaryText}>Load Fixture</Text>
                </TouchableOpacity>
              )}
            </View>



            {analyzing && (
              <View style={styles.scanningIndicator}>
                <ActivityIndicator color="#00E5FF" />
                <Text style={styles.scanningText}>Analyzing video… Up to 2 minutes.</Text>
              </View>
            )}
          </View>

          {/* Video Analysis Result Card */}
          {videoResult && videoResult.tracks && videoResult.tracks.length > 0 && (
            <VisionMonitor data={videoResult} localUri={activeVideoUri} />
          )}
          {videoResult && !(videoResult.tracks && videoResult.tracks.length > 0) && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <CheckCircle2 color="#00E676" size={24} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.resultTitle}>{videoResult.common_name}</Text>
                  <Text style={styles.resultSub}>{videoResult.scientific_name}</Text>
                </View>
                <View style={styles.confBadge}>
                  <Text style={styles.confScore}>{(videoResult.confidence * 100).toFixed(1)}%</Text>
                  <Text style={styles.confLabel}>CONFIDENCE</Text>
                </View>
              </View>

              {/* Video Metadata Chip */}
              <View style={styles.videoMetaBar}>
                <Film size={14} color="#00E5FF" />
                <Text style={styles.videoMetaText}>
                  {videoResult.video_filename} • {videoResult.frames_processed} Frames Processed • {videoResult.video_size_kb.toFixed(0)} KB
                </Text>
              </View>

              {/* Behavioral Metrics Grid */}
              <Text style={styles.subSectionTitle}>Species-Aware Fish Kinematics & Posture</Text>
              <View style={styles.behaviorMiniGrid}>
                <View style={styles.behaviorMiniCard}>
                  <Text style={styles.miniLabel}>Avg Speed</Text>
                  <Text style={styles.miniValGood}>
                    {videoResult.average_speed_bl_s !== undefined ? `${videoResult.average_speed_bl_s.toFixed(3)} BL/s` : `${videoResult.swimming_activity_pct.toFixed(0)}%`}
                  </Text>
                  <Text style={styles.miniSub}>Body Lengths/sec</Text>
                </View>
                <View style={styles.behaviorMiniCard}>
                  <Text style={styles.miniLabel}>Stationary</Text>
                  <Text style={styles.miniValLow}>
                    {videoResult.stationary_percent !== undefined ? `${videoResult.stationary_percent.toFixed(1)}%` : `${videoResult.lethargy_index_pct.toFixed(1)}%`}
                  </Text>
                  <Text style={styles.miniSub}>Resting Ratio</Text>
                </View>
              </View>

              <View style={styles.metricDetailBox}>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Swimming Posture:</Text>
                  <Text style={[
                    styles.detailVal,
                    videoResult.posture && videoResult.posture.includes('Head') ? { color: '#FFB300', fontWeight: 'bold' } : { color: '#00E676' }
                  ]}>
                    {videoResult.posture || 'Horizontal (Normal)'}
                  </Text>
                </View>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Tank Water Column:</Text>
                  <Text style={styles.detailVal}>{videoResult.position || 'Middle'} Zone</Text>
                </View>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Surface Piping (O2):</Text>
                  <Text style={styles.detailVal}>{videoResult.surface_piping}</Text>
                </View>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Overall Behavior Audit:</Text>
                  <Text style={[
                    styles.detailValHighlight,
                    videoResult.behavior_status === 'PROTOTYPE_ABNORMAL' ? { color: '#FF1744' } : { color: '#00E676' }
                  ]}>
                    {videoResult.health_status}
                  </Text>
                </View>

                {videoResult.reasons && videoResult.reasons.length > 0 && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)' }}>
                    <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Audit Findings:</Text>
                    {videoResult.reasons.map((r, i) => (
                      <Text key={i} style={{ color: '#E2E8F0', fontSize: 11, lineHeight: 16 }}>• {r}</Text>
                    ))}
                  </View>
                )}
              </View>

              {/* Auto-Synchronized Edge Gatekeeper Parameters */}
              <View style={styles.profileBox}>
                <View style={styles.profileBoxHeader}>
                  <Zap size={14} color="#00E5FF" />
                  <Text style={styles.profileBoxTitle}>Edge Gatekeeper Safety Baseline Synced:</Text>
                </View>
                <Text style={styles.profileParam}>• Target Temperature: {videoResult.target_parameters.temp}°C</Text>
                <Text style={styles.profileParam}>• Target pH Level: {videoResult.target_parameters.ph}</Text>
                <Text style={styles.profileParam}>• Target TDS: {videoResult.target_parameters.tds} ppm</Text>
              </View>

              <Text style={styles.careNotes}>Biological Note: {videoResult.care_notes}</Text>
            </View>
          )}
        </View>
      ) : (
        /* 24/7 FARMING IP CAMERA & CONTINUOUS MONITORING VIEW */
        <View>
          <View style={styles.videoCard}>
            <View style={styles.videoHeader}>
              <Text style={styles.videoTitle}>Tank #1: Aquaculture Farm Cam (Live Stream)</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>RTSP LIVE</Text>
              </View>
            </View>

            {/* Viewport for Continuous IP Camera */}
            <View style={styles.viewportContainer}>
              {Platform.OS === 'web' ? (
                <View style={styles.cameraFrame}>
                  <video
                    ref={webVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: 12,
                    }}
                  />
                </View>
              ) : permission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  mode="video"
                />
              ) : (
                <View style={styles.permissionBox}>
                  <CameraIcon size={36} color="#00E5FF" />
                  <Text style={styles.permissionTitle}>IP Cam Feed Active</Text>
                  <Text style={styles.permissionSub}>
                    RTSP optical flow stream active at 1080p @ 30FPS.
                  </Text>
                </View>
              )}

              {/* Crosshairs & Overlay */}
              <View style={styles.crosshairTopLeft} />
              <View style={styles.crosshairTopRight} />
              <View style={styles.crosshairBottomLeft} />
              <View style={styles.crosshairBottomRight} />

              <View style={styles.viewportOverlay}>
                <Text style={styles.camSpecs}>1080p @ 30FPS • Optical Flow Tracking Active</Text>
                <View style={styles.detectBox}>
                  <Text style={styles.detectBoxLabel}>Discus School (Track ID: #4)</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Behavior Analytics Grid */}
          <Text style={styles.sectionTitle}>Continuous AI Behavior Diagnostics</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Swimming Activity</Text>
              <Text style={styles.statValGood}>
                {behavior?.swimming_activity_pct.toFixed(1) || '84.2'}%
              </Text>
              <Text style={styles.statSub}>Target: &gt; 70%</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Lethargy Index</Text>
              <Text style={styles.statValLow}>
                {behavior?.lethargy_index_pct.toFixed(1) || '15.8'}%
              </Text>
              <Text style={styles.statSub}>Warning if &gt; 40%</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Surface Piping / Hypoxia:</Text>
              <Text style={styles.metricValGood}>{behavior?.surface_piping || 'NONE DETECTED'}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Feeding Response:</Text>
              <Text style={styles.metricValGood}>{behavior?.feeding_response || 'ACTIVE'}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Health Classification:</Text>
              <Text style={styles.metricValHighlight}>{behavior?.status || 'NORMAL HEALTH'}</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  content: { padding: 16, paddingBottom: 32 },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#131B2E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  switchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  switchBtnActive: { backgroundColor: '#00E5FF' },
  switchText: { color: '#94A3B8', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  switchTextActive: { color: '#0B0F19' },
  viewfinderCard: {
    backgroundColor: '#131B2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  viewfinderHeader: {
    gap: 10,
    marginBottom: 12,
  },
  lensInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewfinderTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  arToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  arToggleBtnActive: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  arToggleBtnText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '800',
  },
  arToggleBtnTextActive: {
    color: '#0B0F19',
  },
  flipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  flipBtnText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '700',
  },
  viewportContainer: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#05070B',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  strataOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
  },
  strataZoneTop: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    borderStyle: 'dashed',
    padding: 10,
    justifyContent: 'flex-start',
  },
  strataZoneMid: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    borderStyle: 'dashed',
    padding: 10,
    justifyContent: 'flex-start',
  },
  strataZoneBot: {
    flex: 1,
    padding: 10,
    justifyContent: 'flex-start',
  },
  strataTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(11, 15, 25, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  strataTagText: {
    color: '#00E5FF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cameraFrame: {
    width: '100%',
    height: '100%',
  },
  permissionBox: {
    alignItems: 'center',
    padding: 20,
  },
  permissionTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 10,
  },
  permissionSub: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 240,
  },
  btnPermission: {
    backgroundColor: '#00E5FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 14,
  },
  btnPermissionText: {
    color: '#0B0F19',
    fontSize: 12,
    fontWeight: 'bold',
  },
  hudOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aiTrackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 15, 25, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  aiTrackText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiTrackBadgeLocked: {
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
    borderColor: '#00E676',
  },
  liveTargetBox: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 1.5,
    borderRadius: 8,
  },
  reticleTL: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderLeftWidth: 3, borderTopWidth: 3, borderColor: '#00E5FF' },
  reticleTR: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRightWidth: 3, borderTopWidth: 3, borderColor: '#00E5FF' },
  reticleBL: { position: 'absolute', bottom: -2, left: -2, width: 10, height: 10, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: '#00E5FF' },
  reticleBR: { position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRightWidth: 3, borderBottomWidth: 3, borderColor: '#00E5FF' },
  floatingHud: {
    position: 'absolute',
    minWidth: 175,
    maxWidth: 230,
    backgroundColor: 'rgba(11, 15, 25, 0.92)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.45)',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  floatingHudAbove: {
    bottom: '100%',
    marginBottom: 6,
    left: 0,
  },
  floatingHudBelow: {
    top: '100%',
    marginTop: 6,
    left: 0,
  },
  floatingHudHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'space-between',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00E676',
  },
  floatingFishName: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  floatingConfBadge: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#00E676',
  },
  floatingConfidence: {
    color: '#00E676',
    fontSize: 9,
    fontWeight: '800',
  },
  floatingHudDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 4,
  },
  floatingHudBody: {
    gap: 2,
  },
  floatingStat: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 13,
  },
  floatingHighlight: {
    color: '#00E5FF',
    fontWeight: '800',
  },
  floatingParam: {
    color: '#00E676',
    fontSize: 8.5,
    fontWeight: '700',
    marginTop: 2,
  },
  scanBeamContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBeamGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  scanBeamLine: {
    width: '100%',
    height: 3,
    backgroundColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  viewfinderControls: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  scanActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    paddingHorizontal: 10,
    minHeight: 44,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  scanActionBtnBusy: {
    backgroundColor: 'rgba(0, 229, 255, 0.65)',
  },
  scanActionText: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#0B0F19',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  clearLockBtn: {
    backgroundColor: 'rgba(255, 23, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#FF1744',
    padding: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordActionMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF1744',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 25,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  recordActionMiniText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  recordActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF1744',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 10,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  innerRecordCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  recordActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stopActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D50000',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 10,
    borderWidth: 2,
    borderColor: '#FFD600',
  },
  stopActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  crosshairTopLeft: { position: 'absolute', top: 12, left: 12, width: 14, height: 14, borderLeftWidth: 2, borderTopWidth: 2, borderColor: '#00E5FF' },
  crosshairTopRight: { position: 'absolute', top: 12, right: 12, width: 14, height: 14, borderRightWidth: 2, borderTopWidth: 2, borderColor: '#00E5FF' },
  crosshairBottomLeft: { position: 'absolute', bottom: 12, left: 12, width: 14, height: 14, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#00E5FF' },
  crosshairBottomRight: { position: 'absolute', bottom: 12, right: 12, width: 14, height: 14, borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#00E5FF' },
  secondaryActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  btnSecondaryText: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  videoCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  videoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  videoTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 23, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00E676' },
  liveDotRecording: { backgroundColor: '#FF1744' },
  liveText: { color: '#FF1744', fontSize: 10, fontWeight: '800' },
  viewportOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10 },
  camSpecs: { color: '#64748B', fontSize: 10, fontStyle: 'italic' },
  detectBox: {
    borderWidth: 1.5,
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderRadius: 4,
    padding: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  detectBoxLabel: { color: '#00E5FF', fontSize: 11, fontWeight: 'bold' },
  sectionTitle: { color: '#E2E8F0', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#131B2E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  statValGood: { color: '#00E676', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  statValLow: { color: '#00E5FF', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  statSub: { color: '#64748B', fontSize: 10, marginTop: 4 },
  card: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  metricLabel: { color: '#94A3B8', fontSize: 13 },
  metricValGood: { color: '#00E676', fontSize: 13, fontWeight: '700' },
  metricValHighlight: { color: '#00E5FF', fontSize: 13, fontWeight: '700' },
  sampleLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  sampleBtn: {
    backgroundColor: '#0B0F19',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sampleBtnText: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  scanningIndicator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, justifyContent: 'center' },
  scanningText: { color: '#00E5FF', fontSize: 12, flexShrink: 1 },
  resultCard: {
    backgroundColor: '#131B2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 230, 118, 0.35)',
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  resultTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: 'bold' },
  resultSub: { color: '#64748B', fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  confBadge: { alignItems: 'flex-end' },
  confScore: { color: '#00E676', fontSize: 16, fontWeight: 'bold' },
  confLabel: { color: '#64748B', fontSize: 9, fontWeight: '700' },
  videoMetaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    marginBottom: 14,
  },
  videoMetaText: { color: '#38BDF8', fontSize: 11, fontWeight: '600' },
  subSectionTitle: { color: '#E2E8F0', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  behaviorMiniGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  behaviorMiniCard: {
    flex: 1,
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  miniLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  miniValGood: { color: '#00E676', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  miniValLow: { color: '#00E5FF', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  miniSub: { color: '#64748B', fontSize: 9, marginTop: 4 },
  metricDetailBox: {
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: { color: '#94A3B8', fontSize: 11 },
  detailVal: { color: '#F8FAFC', fontSize: 11, fontWeight: '600' },
  detailValHighlight: { color: '#00E5FF', fontSize: 13, fontWeight: '700' },
  profileBox: { backgroundColor: 'rgba(0, 229, 255, 0.06)', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0, 229, 255, 0.2)' },
  profileBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  profileBoxTitle: { color: '#00E5FF', fontSize: 12, fontWeight: 'bold' },
  profileParam: { color: '#E2E8F0', fontSize: 12, marginTop: 2 },
  careNotes: { color: '#94A3B8', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
});
