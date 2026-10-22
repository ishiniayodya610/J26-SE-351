import type { TimelineBox, TimelineEntry, TrackDirection } from '@/services/api';

export const TRACK_COLORS = {
  normal: '#00E676',
  abnormal: '#FF1744',
  neutral: '#9E9E9E',
  analysing: '#FFB300',
} as const;

/** Map a box/track status string (prototype verdicts or live short forms) to an overlay colour. */
export function statusColor(status?: string): string {
  if (!status) return TRACK_COLORS.neutral;
  if (status.includes('ABNORMAL')) return TRACK_COLORS.abnormal;
  if (status.includes('NORMAL')) return TRACK_COLORS.normal;
  if (status === 'ANALYSING') return TRACK_COLORS.analysing;
  return TRACK_COLORS.neutral;
}

export function statusLabel(status?: string): string {
  if (!status) return 'UNKNOWN';
  if (status.includes('ABNORMAL')) return 'ABNORMAL';
  if (status.includes('NORMAL')) return 'NORMAL';
  if (status === 'INSUFFICIENT_DATA') return 'INSUFFICIENT DATA';
  if (status === 'UNKNOWN_SPECIES') return 'UNKNOWN SPECIES';
  return status;
}

const ARROWS: Record<TrackDirection, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→', Stationary: '•' };

export function directionArrow(dir?: TrackDirection): string {
  return dir ? ARROWS[dir] ?? '' : '';
}

/** Second overlay line: "0.91 BL/s ↑ · NORMAL" */
export function boxDetail(box: TimelineBox): string {
  const parts: string[] = [];
  if (box.speed !== undefined) parts.push(`${box.speed.toFixed(2)} BL/s ${directionArrow(box.dir)}`.trim());
  if (box.status) parts.push(statusLabel(box.status));
  return parts.join(' · ');
}

/** "#18 Swordtail · 0.91 BL/s ↑" */
export function boxLabel(box: TimelineBox): string {
  const parts = [`#${box.id}`];
  if (box.species) parts.push(box.species);
  let label = parts.join(' ');
  if (box.speed !== undefined) label += ` · ${box.speed.toFixed(2)} BL/s`;
  const arrow = directionArrow(box.dir);
  return arrow ? `${label} ${arrow}` : label;
}

/** Binary search for the timeline entry closest to `t` (timeline sorted by t ascending). */
export function nearestTimelineEntry(timeline: TimelineEntry[], t: number, maxGap = 0.5): TimelineEntry | null {
  if (timeline.length === 0) return null;
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  let best = timeline[lo];
  if (lo > 0 && Math.abs(timeline[lo - 1].t - t) < Math.abs(best.t - t)) best = timeline[lo - 1];
  return Math.abs(best.t - t) <= maxGap ? best : null;
}

/** Rect actually covered by a `contentFit="contain"` frame inside a container. */
export function letterboxRect(containerW: number, containerH: number, srcW: number, srcH: number) {
  if (!containerW || !containerH || !srcW || !srcH) return { x: 0, y: 0, w: containerW, h: containerH };
  const scale = Math.min(containerW / srcW, containerH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h };
}
