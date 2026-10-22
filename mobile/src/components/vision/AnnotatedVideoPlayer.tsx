import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import { TrackOverlay } from '@/components/vision/TrackOverlay';
import { nearestTimelineEntry } from '@/features/vision/track-utils';
import { resolveApiUrl, type VideoAnalysisData } from '@/services/api';

interface AnnotatedVideoPlayerProps {
  data: VideoAnalysisData;
  /** Local URI of the uploaded clip. Preferred: the overlay draws boxes on top of it. */
  localUri?: string | null;
}

/**
 * Plays the analysed clip with ByteTrack boxes synced to playback time.
 * - local clip → live overlay from `timeline`
 * - no local clip but `annotated_video_url` → server video with boxes burned in (no overlay)
 * - neither (fixture/demo) → dark placeholder with a looping clock so the overlay still animates
 */
export function AnnotatedVideoPlayer({ data, localUri }: AnnotatedVideoPlayerProps) {
  const timeline = useMemo(() => data.timeline ?? [], [data.timeline]);
  const serverUrl = data.annotated_video_url ? resolveApiUrl(data.annotated_video_url) : null;
  const source = localUri ?? serverUrl;
  const drawOverlay = !!localUri || !serverUrl;
  const duration = data.video?.duration_s ?? (timeline.length ? timeline[timeline.length - 1].t : 0);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime: ct }) => setCurrentTime(ct));

  // Placeholder clock when there is no video at all.
  useEffect(() => {
    if (source || duration <= 0) return;
    const started = Date.now();
    const id = setInterval(() => setCurrentTime(((Date.now() - started) / 1000) % duration), 100);
    return () => clearInterval(id);
  }, [source, duration]);

  const entry = useMemo(() => nearestTimelineEntry(timeline, currentTime), [timeline, currentTime]);

  const aspect = data.video?.width && data.video?.height ? data.video.width / data.video.height : 16 / 9;
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={[styles.frame, { aspectRatio: aspect }]} onLayout={onLayout}>
      {source ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Text style={styles.placeholderText}>Preview (no video source)</Text>
        </View>
      )}
      {drawOverlay && entry && (
        <TrackOverlay
          boxes={entry.boxes}
          width={size.width}
          height={size.height}
          sourceWidth={data.video?.width}
          sourceHeight={data.video?.height}
          tweenMs={100}
        />
      )}
      <View style={styles.timeBadge}>
        <Text style={styles.timeText}>
          {currentTime.toFixed(1)}s{duration ? ` / ${duration.toFixed(1)}s` : ''} · {entry?.boxes.length ?? 0} tracks
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: '#0B1A24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: '#3A5566', fontSize: 12 },
  timeBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timeText: { color: '#fff', fontSize: 11, fontVariant: ['tabular-nums'] },
});
