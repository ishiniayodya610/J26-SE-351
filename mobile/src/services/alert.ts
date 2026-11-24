import { Alert, Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform alert utility.
 * In React Native Web, Alert.alert is a silent NO-OP.
 * showAlert seamlessly falls back to window.alert or window.confirm on web,
 * and executes button callbacks reliably across platforms.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  if (Platform.OS === 'web') {
    const fullMsg = message ? `${title}\n\n${message}` : title;
    if (!buttons || buttons.length <= 1) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(fullMsg);
      }
      if (buttons && buttons[0]?.onPress) {
        buttons[0].onPress();
      }
    } else {
      // 2 or more buttons (e.g., Cancel & Delete / Confirm)
      const confirmBtn = buttons.find(b => b.style !== 'cancel') || buttons[buttons.length - 1];
      const cancelBtn = buttons.find(b => b.style === 'cancel');
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const agreed = window.confirm(fullMsg);
        if (agreed) {
          confirmBtn?.onPress?.();
        } else {
          cancelBtn?.onPress?.();
        }
      } else {
        confirmBtn?.onPress?.();
      }
    }
  } else {
    Alert.alert(title, message, buttons);
  }
}
