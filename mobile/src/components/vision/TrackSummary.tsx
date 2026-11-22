import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TrackResult, TrackSummaryCounts } from '@/services/api';
import { directionArrow, statusColor, statusLabel, TRACK_COLORS } from '@/features/vision/track-utils';

interface TrackSummaryProps {
  tracks: TrackResult[];
  summary?: TrackSummaryCounts;
}

/** Tracked / Normal / Abnormal counts plus one card per ByteTrack track. Prototype classification only. */
export function TrackSummary({ tracks, summary }: TrackSummaryProps) {
  const counts = summary ?? {
    tracked: tracks.length,
    normal: tracks.filter((t) => t.behavior_status === 'PROTOTYPE_NORMAL').length,
    abnormal: tracks.filter((t) => t.behavior_status === 'PROTOTYPE_ABNORMAL').length,
    insufficient: tracks.filter((t) => t.behavior_status === 'INSUFFICIENT_DATA').length,
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.countRow}>
        <Count label="Tracked" value={counts.tracked} color="#00E5FF" />
        <Count label="Normal" value={counts.normal} color={TRACK_COLORS.normal} />
        <Count label="Abnormal" value={counts.abnormal} color={TRACK_COLORS.abnormal} />
        {counts.insufficient > 0 && <Count label="Too short" value={counts.insufficient} color={TRACK_COLORS.neutral} />}
      </View>

      {tracks.map((track) => {
        const color = statusColor(track.behavior_status);
        return (
          <View key={track.track_id} style={[styles.card, { borderLeftColor: color }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.trackTitle}>
                Track #{track.track_id} · {track.species}
                <Text style={styles.conf}> {(track.species_confidence * 100).toFixed(0)}%</Text>
              </Text>
              <View style={[styles.pill, { backgroundColor: color }]}>
                <Text style={styles.pillText}>{statusLabel(track.behavior_status)}</Text>
              </View>
            </View>
            <Text style={styles.metrics}>
              Avg {track.avg_speed_bl_s.toFixed(2)} BL/s · Max {track.max_speed_bl_s.toFixed(2)} BL/s · Still{' '}
              {track.stationary_percent.toFixed(0)}%
            </Text>
            <Text style={styles.metrics}>
              {track.position} zone · {track.direction} {directionArrow(track.direction)} ·{' '}
              {(track.last_t - track.first_t).toFixed(1)}s, {track.frames} frames
            </Text>
            {track.reason.length > 0 && (
              <View style={styles.reasons}>
                {track.reason.map((r) => (
                  <Text key={r} style={[styles.reason, { color }]}>• {r}</Text>
                ))}
              </View>
            )}
          </View>
        );
      })}
      <Text style={styles.disclaimer}>
        Prototype behaviour classification, not a diagnosis. Track IDs are tracker IDs, not physical fish identity.
      </Text>
    </View>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 12 },
  countRow: { flexDirection: 'row', gap: 8 },
  count: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  countValue: { fontSize: 22, fontWeight: '800' },
  countLabel: { color: '#8FA3B0', fontSize: 11, marginTop: 2 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 12,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  trackTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  conf: { color: '#8FA3B0', fontSize: 12, fontWeight: '400' },
  pill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#000', fontSize: 10, fontWeight: '800' },
  metrics: { color: '#B0BEC5', fontSize: 12 },
  reasons: { marginTop: 4 },
  reason: { fontSize: 12 },
  disclaimer: { color: '#607D8B', fontSize: 10, fontStyle: 'italic' },
});
