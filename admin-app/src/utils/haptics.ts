import * as Haptics from "expo-haptics";

/**
 * Haptic feedback.
 *
 * Every call is fire-and-forget and swallows its error: a device without a
 * vibration motor, or one with system haptics switched off, must never turn a
 * successful save into a crash. Feedback is a garnish, not a result.
 */

/** Light tick for an ordinary tap. */
export function tapFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Firmer tick for a committing action, e.g. collecting a payment. */
export function selectFeedback(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** Something was saved or completed. */
export function successFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** A validation failure or a rejected action. */
export function errorFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/** A destructive confirmation, e.g. deleting a record. */
export function warningFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
