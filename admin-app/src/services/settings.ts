import { getDb } from "@/db";
import { AppSettings } from "@/types";

export const DEFAULT_SETTINGS: AppSettings = {
  hostelName: "My Hostel",
  countryCode: "91",
  currencySymbol: "₹",
  backupReminderDays: 7,
  lastBackupAt: null,
  autoBackupEnabled: true,
  setupComplete: false,
};

/**
 * Settings live in a key/value table so adding one never needs a migration.
 * Values are JSON-encoded, and a malformed or missing row silently falls back
 * to the default rather than breaking app start-up.
 */
export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings;");

  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    try {
      (result as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      // Keep the default for this key.
    }
  }
  return result;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  const entries = Object.entries(patch).filter(([key]) => key in DEFAULT_SETTINGS);
  if (entries.length === 0) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const [key, value] of entries) {
      await txn.runAsync(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
        key,
        JSON.stringify(value ?? null)
      );
    }
  });
}
