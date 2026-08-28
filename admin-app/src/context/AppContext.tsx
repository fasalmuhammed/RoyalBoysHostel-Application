import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import { getDb } from "@/db";
import { AppSettings } from "@/types";
import { loadSettings, saveSettings } from "@/services/settings";
import { seedTemplates } from "@/services/messaging";
import { hasPin as hasPinStored } from "@/services/security";

/** Re-lock after this long in the background. */
const AUTO_LOCK_MS = 2 * 60 * 1000;

interface AppContextValue {
  /** False until the database is open, migrated and settings are loaded. */
  ready: boolean;
  /** Set when start-up fails; the app shows this instead of a blank screen. */
  startupError: string | null;
  settings: AppSettings;
  hasPin: boolean;
  locked: boolean;

  /** Bumped whenever data changes, so open screens know to refetch. */
  dataVersion: number;
  invalidate: () => void;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshPinState: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    hostelName: "My Hostel",
    countryCode: "91",
    currencySymbol: "₹",
    defaultRent: 6000,
    feeDueDay: 10,
    backupReminderDays: 7,
    lastBackupAt: null,
    autoBackupEnabled: true,
    setupComplete: false,
  });
  const [hasPin, setHasPin] = useState(false);
  const [locked, setLocked] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await getDb();
        await seedTemplates();
        const [loaded, pinExists] = await Promise.all([loadSettings(), hasPinStored()]);
        if (cancelled) return;

        setSettings(loaded);
        setHasPin(pinExists);
        // With no PIN set there is nothing to unlock; first run handles setup.
        setLocked(pinExists);
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        setStartupError(error instanceof Error ? error.message : String(error));
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Locks again after a spell in the background. Time-based rather than
   * immediate, so glancing at WhatsApp to send a reminder and coming straight
   * back does not force the admin to re-enter their PIN every time.
   */
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since !== null && Date.now() - since > AUTO_LOCK_MS && hasPin) {
          setLocked(true);
        }
      } else if (state === "background") {
        backgroundedAt.current = Date.now();
      }
    };

    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [hasPin]);

  const refreshSettings = useCallback(async () => {
    setSettings(await loadSettings());
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    await saveSettings(patch);
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const refreshPinState = useCallback(async () => {
    setHasPin(await hasPinStored());
  }, []);

  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);
  const unlock = useCallback(() => setLocked(false), []);
  const lock = useCallback(() => setLocked(true), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      startupError,
      settings,
      hasPin,
      locked,
      dataVersion,
      invalidate,
      updateSettings,
      refreshSettings,
      refreshPinState,
      unlock,
      lock,
    }),
    [
      ready, startupError, settings, hasPin, locked, dataVersion,
      invalidate, updateSettings, refreshSettings, refreshPinState, unlock, lock,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
