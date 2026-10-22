import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnnotatedVideoPlayer } from '@/components/vision/AnnotatedVideoPlayer';
import { TrackSummary } from '@/components/vision/TrackSummary';
import type { VideoAnalysisData } from '@/services/api';

/** Result view for v2 responses: annotated player + multi-track summary. */
export function VisionMonitor({ data, localUri }: { data: VideoAnalysisData; localUri?: string | null }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Vision Monitor</Text>
      <Text style={styles.sub}>
        {data.video_filename}
        {data.video?.truncated ? ' · analysis truncated' : ''}
      </Text>
      <AnnotatedVideoPlayer data={data} localUri={localUri} />
      <TrackSummary tracks={data.tracks ?? []} summary={data.summary} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1B24',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  title: { color: '#00E5FF', fontSize: 18, fontWeight: '800' },
  sub: { color: '#8FA3B0', fontSize: 11, marginBottom: 10 },
});
