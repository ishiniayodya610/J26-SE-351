import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Triggers distinct tactile haptic feedback on mobile device
 * when an edge anomaly or hardware lockout is intercepted.
 */
export const triggerAnomalyHaptic = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 75, 150, 75, 250]);
      }
    } else {
      // Strong double-buzz error haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } catch (_) {}
      }, 180);
    }
  } catch (err) {
    // Graceful fallback for devices without vibration actuators
    console.debug('Haptics error:', err);
  }
};

/**
 * Triggers a crisp success tactile confirmation
 * when tank metrics return to optimal baseline.
 */
export const triggerResolvedHaptic = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(80);
      }
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch (err) {
    console.debug('Haptics error:', err);
  }
};

/**
 * Light tap feedback for interactive button presses
 */
export const triggerSelectionHaptic = async () => {
  try {
    if (Platform.OS !== 'web') {
      await Haptics.selectionAsync();
    }
  } catch (_) {}
};
