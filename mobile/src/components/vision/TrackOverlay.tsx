import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { TimelineBox } from '@/services/api';
import { boxDetail, letterboxRect, statusColor } from '@/features/vision/track-utils';

interface TrackOverlayProps {
  boxes: TimelineBox[];
  /** Overlay container size in px (same as the video/camera view). */
  width: number;
  height: number;
  /** Source frame size, used to undo `contentFit="contain"` letterboxing. Omit for `cover`/stretch. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Tween duration between box updates (ms). 0 = jump. */
  tweenMs?: number;
}

/** Absolute ByteTrack boxes over a video/camera view. Boxes are normalised xyxy (0–1). */
export function TrackOverlay({ boxes, width, height, sourceWidth, sourceHeight, tweenMs = 0 }: TrackOverlayProps) {
  if (!width || !height) return null;
  const rect = sourceWidth && sourceHeight
    ? letterboxRect(width, height, sourceWidth, sourceHeight)
    : { x: 0, y: 0, w: width, h: height };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {boxes.map((box) => (
        <TrackBox key={box.id} box={box} rect={rect} tweenMs={tweenMs} />
      ))}
    </View>
  );
}

interface TrackBoxProps {
  box: TimelineBox;
  rect: { x: number; y: number; w: number; h: number };
  tweenMs: number;
}

function TrackBox({ box, rect, tweenMs }: TrackBoxProps) {
  const [x1, y1, x2, y2] = box.xyxy;
  const left = rect.x + x1 * rect.w;
  const top = rect.y + y1 * rect.h;
  const w = Math.max(2, (x2 - x1) * rect.w);
  const h = Math.max(2, (y2 - y1) * rect.h);

  const l = useSharedValue(left);
  const t = useSharedValue(top);
  const bw = useSharedValue(w);
  const bh = useSharedValue(h);

  useEffect(() => {
    const cfg = { duration: tweenMs };
    l.value = tweenMs ? withTiming(left, cfg) : left;
    t.value = tweenMs ? withTiming(top, cfg) : top;
    bw.value = tweenMs ? withTiming(w, cfg) : w;
    bh.value = tweenMs ? withTiming(h, cfg) : h;
  }, [left, top, w, h, tweenMs, l, t, bw, bh]);

  const animStyle = useAnimatedStyle(() => ({
    left: l.value,
    top: t.value,
    width: bw.value,
    height: bh.value,
  }));

  const color = statusColor(box.status);
  // Label sits above the box; flip it inside/below when the box touches the top edge.
  const flip = top - rect.y < LABEL_HEIGHT;
  return (
    <Animated.View style={[styles.box, { borderColor: color }, animStyle]}>
      <View style={[styles.label, flip ? styles.labelBelow : styles.labelAbove, { backgroundColor: color }]}>
        {/* Two short lines instead of one long one, so nothing gets truncated on small boxes. */}
        <Text style={styles.labelText}>{`#${box.id} ${box.species ?? ''}`.trim()}</Text>
        <Text style={styles.statusText}>{boxDetail(box)}</Text>
      </View>
    </Animated.View>
  );
}

const LABEL_HEIGHT = 40;

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 4,
  },
  label: {
    position: 'absolute',
    left: -3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 120,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  labelAbove: { bottom: '100%', marginBottom: 2 },
  labelBelow: { top: '100%', marginTop: 2 },
  labelText: { color: '#000', fontSize: 13, fontWeight: '800' },
  statusText: { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
});
