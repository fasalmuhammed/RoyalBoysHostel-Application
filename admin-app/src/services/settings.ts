import { AppSettings } from "@/types";
import { find, logActivity, patch, put } from "@/store/cloud";

export const DEFAULT_SETTINGS: AppSettings = {
  hostelName: "Royal Boys Hostel",
  countryCode: "91",
  currencySymbol: "₹",
  activeBranchId: null,
  backupReminderDays: 7,
  lastBackupAt: null,
  autoBackupEnabled: true,
  setupComplete: false,
};

/**
 * Settings shared by everyone live in one Claude storage document,
 * `config/settings`. The branch picked on the last visit is a per-person
 * convenience, so it stays in this browser instead of being shared: two
 * wardens working different hostels must not flip each other's branch.
 */
const SETTINGS_DOC = "settings";
const PER_DEVICE: (keyof AppSettings)[] = ["activeBranchId"];
const LOCAL_PREFIX = "hostel.setting.";
/** Changes worth showing in the admin panel's activity feed. */
const NOTEWORTHY: (keyof AppSettings)[] = ["hostelName", "countryCode", "currencySymbol", "backupReminderDays"];

function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value ?? null));
  } catch {
    // Blocked storage: the branch picker simply starts unselected next time.
  }
}

/**
 * A missing or unreadable value falls back to the default rather than
 * breaking app start-up, as it always has.
 */
export async function loadSettings(): Promise<AppSettings> {
  const shared = find<Record<string, unknown>>("config", SETTINGS_DOC) ?? {};
  const result = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const value = PER_DEVICE.includes(key) ? readLocal(key) : shared[key];
    if (value !== undefined) result[key] = value;
  }
  return result as unknown as AppSettings;
}

export async function saveSettings(change: Partial<AppSettings>): Promise<void> {
  const entries = Object.entries(change).filter(([key]) => key in DEFAULT_SETTINGS) as [
    keyof AppSettings,
    unknown,
  ][];
  if (entries.length === 0) return;

  const shared: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (PER_DEVICE.includes(key)) writeLocal(key, value);
    else shared[key] = value ?? null;
  }
  if (Object.keys(shared).length === 0) return;

  if (find("config", SETTINGS_DOC)) await patch("config", SETTINGS_DOC, shared);
  else await put("config", SETTINGS_DOC, shared);

  if (entries.some(([key]) => NOTEWORTHY.includes(key))) {
    logActivity({ action: "updated", entity: "settings", entityId: SETTINGS_DOC, label: "Hostel settings", branchId: null });
  }
}
