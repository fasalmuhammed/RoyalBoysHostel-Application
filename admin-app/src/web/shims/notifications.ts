/**
 * Browser stand-in for `expo-notifications`.
 *
 * Scheduled device reminders need a phone's notification service, which a
 * claude.ai artifact does not have. Permission reads as not granted, so the
 * app skips scheduling; the dashboard and notification feed still surface
 * overdue fees and backups whenever the app is open.
 */

const DENIED = { granted: false, status: "denied", canAskAgain: false, expires: "never" } as const;

export const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, MIN: 1, MAX: 5 } as const;

export const SchedulableTriggerInputTypes = {
  MONTHLY: "monthly",
  TIME_INTERVAL: "timeInterval",
  DAILY: "daily",
  WEEKLY: "weekly",
  DATE: "date",
} as const;

export function setNotificationHandler(_handler: unknown): void {}

export async function setNotificationChannelAsync(_id: string, _channel: unknown): Promise<null> {
  return null;
}

export async function getPermissionsAsync() {
  return DENIED;
}

export async function requestPermissionsAsync() {
  return DENIED;
}

export async function getAllScheduledNotificationsAsync(): Promise<never[]> {
  return [];
}

export async function scheduleNotificationAsync(_request: unknown): Promise<string> {
  return "";
}

export async function cancelScheduledNotificationAsync(_id: string): Promise<void> {}

export async function cancelAllScheduledNotificationsAsync(): Promise<void> {}
