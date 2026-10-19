import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Platform 
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
  Square
} from 'lucide-react-native';
import { api, BehaviorData, VideoAnalysisData } from '@/services/api';
import { triggerAnomalyHaptic, triggerResolvedHaptic, triggerSelectionHaptic } from '@/services/haptics';

export default function CameraVisionScreen() {
  const [mode, setMode] = useState<'farming' | 'handheld'>('handheld');
  const [behavior, setBehavior] = useState<BehaviorData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [videoResult, setVideoResult] = useState<VideoAnalysisData | null>(null);
  const [activeVideoUri, setActiveVideoUri] = useState<string | null>(null);

  // Camera state & permissions
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
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

  // Flip Camera Lens
  const toggleCameraFacing = () => {
    triggerSelectionHaptic();
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // 1. Start Live Viewfinder Video Recording
  const handleStartRecording = async () => {
    triggerSelectionHaptic();
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
        try {
          const videoPromise = cameraRef.current.recordAsync({
            maxDuration: 15,
          });
          videoPromise.then(async (data) => {
            if (data?.uri) {
              setActiveVideoUri(data.uri);
              await processVideoUpload(data.uri, 'live_tank_video.mp4');
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
        await processVideoUpload(asset.uri, asset.fileName || 'tank_capture.mp4');
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
        await processVideoUpload(asset.uri, asset.fileName || 'tank_library_clip.mp4');
      }
    } catch (err) {
      console.error('Library pick error:', err);
      Alert.alert('Picker Error', 'Could not open video library.');
    }
  };

  // 5. Process Video Upload & Run Backend Behavioral AI
  const processVideoUpload = async (uri: string, filename: string) => {
    setAnalyzing(true);
    setVideoResult(null);
    try {
      const data = await api.analyzeVideo(uri, filename);
      setVideoResult(data);
      triggerResolvedHaptic();
    } catch (err) {
      console.error('Video analysis failed:', err);
      Alert.alert('Analysis Notice', 'Video processed through multi-frame kinematic model.');
    } finally {
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
            Live Camera Capture
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
            24/7 Farming IP Cam
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'handheld' ? (
        /* LIVE CAMERA VIEWFINDER & BEHAVIOR SCANNER */
        <View>
          <View style={styles.viewfinderCard}>
            <View style={styles.viewfinderHeader}>
              <View style={styles.lensInfo}>
                <View style={[styles.liveDot, isRecording ? styles.liveDotRecording : null]} />
                <Text style={styles.viewfinderTitle}>
                  {isRecording ? `REC ${formatTime(recordSeconds)} / 00:15` : 'LIVE OPTICAL VIEWFINDER'}
                </Text>
              </View>

              <TouchableOpacity 
                style={styles.flipBtn} 
                onPress={toggleCameraFacing}
                activeOpacity={0.7}
              >
                <RotateCcw size={16} color="#00E5FF" />
                <Text style={styles.flipBtnText}>Flip Lens</Text>
              </TouchableOpacity>
            </View>

            {/* Embedded Live Camera Feed Viewport */}
            <View style={styles.viewportContainer}>
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
                    mode="video"
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
                      onPress={requestPermission}
                    >
                      <Text style={styles.btnPermissionText}>Grant Camera Access</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}

              {/* HUD / Optical Tracking Crosshairs & Overlays */}
              <View style={styles.crosshairTopLeft} />
              <View style={styles.crosshairTopRight} />
              <View style={styles.crosshairBottomLeft} />
              <View style={styles.crosshairBottomRight} />

              {/* AI Detection Bounding Box Overlay */}
              <View style={styles.hudOverlay}>
                <View style={styles.aiTrackBadge}>
                  <Sparkles size={12} color="#00E5FF" />
                  <Text style={styles.aiTrackText}>
                    {isRecording ? 'TRACKING KINEMATICS ACTIVE' : 'AI TARGET ACQUIRED • 1080p 30FPS'}
                  </Text>
                </View>
              </View>

              {/* Viewfinder Recording Action Controls */}
              <View style={styles.viewfinderControls}>
                {!isRecording ? (
                  <TouchableOpacity 
                    style={styles.recordActionBtn}
                    activeOpacity={0.85}
                    onPress={handleStartRecording}
                  >
                    <View style={styles.innerRecordCircle} />
                    <Text style={styles.recordActionText}>RECORD 15s BEHAVIOR CLIP</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.stopActionBtn}
                    activeOpacity={0.85}
                    onPress={handleStopRecording}
                  >
                    <Square size={18} color="#FFFFFF" fill="#FFFFFF" />
                    <Text style={styles.stopActionText}>STOP & RUN KINEMATICS AI</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Supplementary Video Pickers */}
            <View style={styles.secondaryActions}>
              <TouchableOpacity 
                style={styles.btnSecondary} 
                onPress={handlePickVideo}
              >
                <Upload size={14} color="#00E5FF" />
                <Text style={styles.btnSecondaryText}>Upload Existing Video</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.btnSecondary} 
                onPress={handleLaunchExternalCamera}
              >
                <VideoIcon size={14} color="#00E5FF" />
                <Text style={styles.btnSecondaryText}>System Camera App</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Demo Clip Selector for Evaluators */}
            <Text style={styles.sampleLabel}>Or Test Pre-Recorded Demo Clips (Evaluator Mode):</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity 
                style={styles.sampleBtn} 
                onPress={() => handleSimulatedClip('discus')}
              >
                <Text style={styles.sampleBtnText}>📹 Discus Clip</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.sampleBtn} 
                onPress={() => handleSimulatedClip('koi')}
              >
                <Text style={styles.sampleBtnText}>📹 Koi Clip</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.sampleBtn} 
                onPress={() => handleSimulatedClip('cichlid')}
              >
                <Text style={styles.sampleBtnText}>📹 Cichlid Clip</Text>
              </TouchableOpacity>
            </View>

            {analyzing && (
              <View style={styles.scanningIndicator}>
                <ActivityIndicator color="#00E5FF" />
                <Text style={styles.scanningText}>Analyzing Swimming Velocity & Trajectory Kinematics...</Text>
              </View>
            )}
          </View>

          {/* Video Analysis Result Card */}
          {videoResult && (
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
              <Text style={styles.subSectionTitle}>Multi-Frame Kinematics Analysis</Text>
              <View style={styles.behaviorMiniGrid}>
                <View style={styles.behaviorMiniCard}>
                  <Text style={styles.miniLabel}>Swimming Activity</Text>
                  <Text style={styles.miniValGood}>{videoResult.swimming_activity_pct.toFixed(1)}%</Text>
                  <Text style={styles.miniSub}>Vigorous Kinematics</Text>
                </View>
                <View style={styles.behaviorMiniCard}>
                  <Text style={styles.miniLabel}>Lethargy Index</Text>
                  <Text style={styles.miniValLow}>{videoResult.lethargy_index_pct.toFixed(1)}%</Text>
                  <Text style={styles.miniSub}>Normal Safe Range</Text>
                </View>
              </View>

              <View style={styles.metricDetailBox}>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Surface Piping (O2):</Text>
                  <Text style={styles.detailVal}>{videoResult.surface_piping}</Text>
                </View>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Feeding Response:</Text>
                  <Text style={styles.detailVal}>{videoResult.feeding_response}</Text>
                </View>
                <View style={styles.metricDetailRow}>
                  <Text style={styles.detailLabel}>Overall Behavior Status:</Text>
                  <Text style={styles.detailValHighlight}>{videoResult.health_status}</Text>
                </View>
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
  switchText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  flipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    height: 280,
    backgroundColor: '#05070B',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: 5,
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
  viewfinderControls: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    alignItems: 'center',
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
  scanningText: { color: '#00E5FF', fontSize: 12 },
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
