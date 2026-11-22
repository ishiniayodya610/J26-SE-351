import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { TrackOverlay } from '@/components/vision/TrackOverlay';
import { connectLiveTracking, type LiveBox, type LiveTrackingClient } from '@/services/api';

const FRAME_INTERVAL_MS = 250; // fastest pace (~4 FPS); real pace follows server replies
const REPLY_TIMEOUT_MS = 1500; // send anyway if the server never answers a frame
const JPEG_QUALITY = 0.5;
// Server analyses at 480 px, so a 12 MP iPhone photo is pure waste: base64-encoding it on the
// JS thread 4x/s froze the UI. Prefer a small capture preset.
const PREFERRED_SIZES = ['640x480', '352x288', 'Low', 'Medium', '1280x720'];

function pickPictureSize(sizes: string[]): string | undefined {
  for (const s of PREFERRED_SIZES) if (sizes.includes(s)) return s;
  const dims = sizes
    .map((s) => ({ s, w: Number(s.split('x')[0]) }))
    .filter((d) => d.w >= 480)
    .sort((a, b) => a.w - b.w);
  return dims[0]?.s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LiveTrackingViewProps {
  active: boolean;
}

/** Live camera preview with ByteTrack boxes from `WS /api/comp2/live`. Latest-wins: one capture in flight at a time. */
export function LiveTrackingView({ active: activeProp }: LiveTrackingViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const clientRef = useRef<LiveTrackingClient | null>(null);
  const replyRef = useRef<(() => void) | null>(null);
  const [focused, setFocused] = useState(true);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [boxes, setBoxes] = useState<LiveBox[]>([]);
  const [fps, setFps] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Release the camera + socket when the user leaves the Vision tab.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const active = activeProp && focused;

  // Socket lifecycle
  useEffect(() => {
    if (!active) return;
    const client = connectLiveTracking({
      onOpen: () => {
        setConnected(true);
        setError(null);
        client.reset();
      },
      onClose: () => setConnected(false),
      onError: setError,
      onMessage: (msg) => {
        if (msg.type === 'tracks') {
          replyRef.current?.();
          setBoxes(msg.boxes);
          setFps(msg.analysis_fps);
          setError(null);
        } else if (msg.type === 'error') {
          setError(msg.detail);
        }
      },
    });
    clientRef.current = client;
    return () => {
      client.close();
      clientRef.current = null;
      setBoxes([]);
      setFps(null);
      setConnected(false);
      setCameraReady(false); // CameraView unmounts with `active`; wait for the next onCameraReady

    };
  }, [active]);

  // Capture loop with back-pressure: one frame in flight, next one only after the server replies.
  useEffect(() => {
    if (!active || !connected || !cameraReady) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const started = Date.now();
        try {
          const photo = await cameraRef.current?.takePictureAsync({
            quality: JPEG_QUALITY,
            base64: true,
            skipProcessing: true,
            shutterSound: false,
          });
          if (cancelled) break;
          if (photo?.base64) {
            const replied = new Promise<void>((resolve) => {
              replyRef.current = resolve;
            });
            clientRef.current?.sendFrame(photo.base64, Date.now());
            await Promise.race([replied, sleep(REPLY_TIMEOUT_MS)]);
            replyRef.current = null;
          }
        } catch {
          await sleep(500); // camera busy / dropped frame; back off briefly
        }
        const wait = FRAME_INTERVAL_MS - (Date.now() - started);
        if (wait > 0) await sleep(wait);
      }
    })();
    return () => {
      cancelled = true;
      replyRef.current?.();
    };
  }, [active, connected, cameraReady]);

  const onCameraReady = async () => {
    setCameraReady(true);
    try {
      const sizes = (await cameraRef.current?.getAvailablePictureSizesAsync()) ?? [];
      setPictureSize(pickPictureSize(sizes));
    } catch {
      // Keep the default size; capture still works, just heavier.
    }
  };

  if (!permission) return <View style={styles.frame} />;
  if (!permission.granted) {
    return (
      <View style={[styles.frame, styles.center]}>
        <Text style={styles.msg}>Camera permission needed for live tracking.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const analysing = boxes.length > 0 && boxes.every((b) => b.status === 'ANALYSING');
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={styles.frame} onLayout={onLayout}>
      {active && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter={false}
          pictureSize={pictureSize}
          onCameraReady={onCameraReady}
        />
      )}
      {/* CameraView fills the frame (cover) so boxes map straight to the container. */}
      <TrackOverlay boxes={boxes} width={size.width} height={size.height} tweenMs={FRAME_INTERVAL_MS} />

      <View style={styles.badgeRow}>
        <View style={[styles.liveBadge, { backgroundColor: connected ? '#FF1744' : '#555' }]}>
          <Text style={styles.liveText}>{connected ? 'LIVE' : 'CONNECTING'}</Text>
        </View>
        {fps !== null && <Text style={styles.fps}>{fps.toFixed(1)} FPS analysis</Text>}
        {analysing && <Text style={styles.analysing}>ANALYSING…</Text>}
      </View>
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 },
  msg: { color: '#B0BEC5', textAlign: 'center' },
  btn: { backgroundColor: '#00E5FF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: '#000', fontWeight: '700' },
  badgeRow: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  fps: { color: '#fff', fontSize: 11, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, borderRadius: 4 },
  analysing: { color: '#FFB300', fontSize: 11, fontWeight: '800' },
  errorBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,23,68,0.85)', padding: 6 },
  errorText: { color: '#fff', fontSize: 11 },
});
