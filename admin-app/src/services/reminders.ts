import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Local reminders for the admin.
 *
 * These are on-device notifications only -- there is no push server and no
 * account. They nudge the person holding the phone ("fees are due", "you have
 * not backed up in a week"); they never reach students. Student contact goes
 * out through WhatsApp, which the admin sends by hand.
 */

const CHANNEL_ID = "hostel-reminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function initReminders(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Hostel reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

async function cancelByTag(tag: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if ((item.content.data as { tag?: string } | undefined)?.tag === tag) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch {
    // Nothing scheduled yet.
  }
}

/**
 * Schedules a monthly nudge a few days before fees fall due, so the admin has
 * time to run the reminder queue before the deadline rather than after it.
 */
export async function scheduleFeeReminder(dueDay: number, daysBefore = 3): Promise<void> {
  await cancelByTag("fee-due");
  try {
    const day = Math.min(Math.max(dueDay - daysBefore, 1), 28);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Hostel fees are due soon",
        body: "Open Messages to send WhatsApp reminders to students with pending fees.",
        data: { tag: "fee-due", route: "Messages" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day,
        hour: 10,
        minute: 0,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Scheduling is a convenience; the dashboard also surfaces due fees.
  }
}

/**
 * Weekly backup nudge. Losing the phone is the single largest risk in a
 * local-only design, so this deliberately repeats rather than firing once.
 */
export async function scheduleBackupReminder(everyDays: number): Promise<void> {
  await cancelByTag("backup");
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Time to back up your hostel data",
        body: "Export a backup and save it somewhere safe off this phone.",
        data: { tag: "backup", route: "Backup" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(everyDays, 1) * 24 * 60 * 60,
        repeats: true,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Ignore -- the Backup screen shows the same warning inline.
  }
}

export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing to cancel.
  }
}
