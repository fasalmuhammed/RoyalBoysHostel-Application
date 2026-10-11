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

import { AppSettings, Branch } from "@/types";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/services/settings";
import { seedTemplates } from "@/services/messaging";
import { hasPin as hasPinStored } from "@/services/security";
import { getBranch, listBranches, seedBranches, setActiveBranchId } from "@/services/branches";
import { closeStore, openStore, storePending, storeProblem, subscribeStore } from "@/store/cloud";
import { currentPeriod, raiseDueBills } from "@/services/fees";
import { startBackend } from "@/backend";
import type { FirebaseBackend, Session } from "@/backend/firebase";

/** Re-lock after this long in the background. */
const AUTO_LOCK_MS = 2 * 60 * 1000;

/** What the signed-in login may do, as the server decides it. */
export interface Access {
  /** The admin: both hostels, the admin panel, staff, settings and backups. */
  isOwner: boolean;
  /** Same as isOwner; kept for the screens that ask "may this person administer?". */
  canEdit: boolean;
  /** False only when nobody is signed in. */
  canWrite: boolean | null;
  /** The one hostel a manager is held to; null for the admin. */
  branchId: string | null;
}

/** Who is signed in, for display. */
export interface SignedIn {
  username: string;
  name: string;
  role: "admin" | "manager";
}

const NO_ACCESS: Access = { isOwner: false, canEdit: false, canWrite: false, branchId: null };

interface AppContextValue {
  /** False until the app knows whether someone is signed in. */
  ready: boolean;
  /** Set when start-up fails; the app shows this instead of a blank screen. */
  startupError: string | null;
  /** Null on the login screen. */
  user: SignedIn | null;
  /** True between a successful login and the records finishing loading. */
  opening: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  settings: AppSettings;
  hasPin: boolean;
  locked: boolean;

  /** Every branch this login can work in. */
  branches: Branch[];
  /**
   * The branch being operated. Null until chosen, which is what gates the app
   * behind the branch picker -- writing a record with no branch would leave it
   * invisible from either hostel. A manager's is set for them.
   */
  activeBranch: Branch | null;
  chooseBranch: (branchId: string) => Promise<void>;
  clearBranch: () => void;

  /**
   * Bumped whenever data changes -- here or on any other device -- so open
   * screens refetch and every list stays live.
   */
  dataVersion: number;
  invalidate: () => void;

  access: Access;
  /** Set while live updates from the server have stopped. */
  syncProblem: string | null;
  /** Changes made without a connection that are still waiting to be sent. */
  pendingSync: number;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshPinState: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function accessOf(session: Session): Access {
  const admin = session.staff.role === "admin";
  return { isOwner: admin, canEdit: admin, canWrite: true, branchId: admin ? null : session.staff.branchId };
}

export function AppProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [user, setUser] = useState<SignedIn | null>(null);
  const [opening, setOpening] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [locked, setLocked] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [access, setAccess] = useState<Access>(NO_ACCESS);
  const [syncProblem, setSyncProblem] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(0);

  const backendRef = useRef<FirebaseBackend | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  /** The login whose records are open, so the same session is not opened twice. */
  const openedFor = useRef<string | null>(null);
  /** The month automatic billing last ran for, so it runs once per month per session. */
  const billedPeriod = useRef<string | null>(null);

  /**
   * Monthly bills raise themselves: when the app opens, and when it is brought
   * back on a day in a new month. Quiet on failure -- it simply runs again.
   */
  const autoBill = useCallback(() => {
    const period = currentPeriod();
    if (!openedFor.current || billedPeriod.current === period) return;
    billedPeriod.current = period;
    raiseDueBills(period).catch(() => {
      billedPeriod.current = null;
    });
  }, []);

  /** Forgets everything on screen and closes the records. */
  const leave = useCallback(() => {
    openedFor.current = null;
    billedPeriod.current = null;
    closeStore();
    setActiveBranchId(null);
    setActiveBranch(null);
    setBranches([]);
    setUser(null);
    setAccess(NO_ACCESS);
    setSyncProblem(null);
    setPendingSync(0);
    setDataVersion((v) => v + 1);
  }, []);

  /** Opens the records for a login and puts a manager straight into their hostel. */
  const enter = useCallback(async (session: Session) => {
    if (openedFor.current === session.user.uid) return;
    openedFor.current = session.user.uid;
    setOpening(true);
    try {
      const nextAccess = accessOf(session);
      await openStore();
      if (nextAccess.isOwner) {
        // First open of a brand-new project: the two branches and the built-in
        // templates. Both use fixed ids, so doing this twice changes nothing.
        await seedBranches().catch(() => undefined);
        await seedTemplates().catch(() => undefined);
      }
      const [loaded, pinExists, allBranches] = await Promise.all([loadSettings(), hasPinStored(), listBranches()]);

      setAccess(nextAccess);
      setSettings(loaded);
      setBranches(allBranches);
      setHasPin(pinExists);
      // With no PIN on this device there is nothing to unlock.
      setLocked(pinExists);

      // A manager works in their own hostel. The admin opens on the hostel
      // they last worked in (the first one on a new device) and switches
      // between the two from the top of the dashboard.
      const start = nextAccess.branchId
        ? allBranches.find((b) => b.id === nextAccess.branchId) ?? null
        : allBranches.find((b) => b.id === loaded.activeBranchId) ?? allBranches[0] ?? null;
      setActiveBranchId(start ? start.id : null);
      setActiveBranch(start);

      setUser({ username: session.staff.username, name: session.staff.name, role: session.staff.role });
      setDataVersion((v) => v + 1);
      autoBill();
    } catch (error) {
      openedFor.current = null;
      closeStore();
      throw error;
    } finally {
      setOpening(false);
    }
  }, [autoBill]);

  // Start-up: connect, then pick up a login this device already holds.
  useEffect(() => {
    let cancelled = false;
    let stopSession: (() => void) | null = null;

    (async () => {
      try {
        const backend = startBackend();
        backendRef.current = backend;
        const session = await backend.ready();
        if (cancelled) return;
        if (session) await enter(session);
        if (cancelled) return;
        setReady(true);

        // A login switched off (or moved to the other hostel) by the admin
        // while the app is open goes back to the login screen.
        stopSession = backend.onSession((next) => {
          if (!next && openedFor.current) leave();
        });
      } catch (error) {
        if (cancelled) return;
        setStartupError(error instanceof Error ? error.message : String(error));
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      stopSession?.();
    };
  }, [enter, leave]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const backend = backendRef.current;
      if (!backend) throw new Error("The app is still starting. Try again in a moment.");
      const session = await backend.signIn(username, password);
      await enter(session);
    },
    [enter]
  );

  const signOut = useCallback(async () => {
    leave();
    await backendRef.current?.signOut();
  }, [leave]);

  /**
   * Live updates. Any change on the server -- this device or another --
   * refreshes the open screens, the shared settings and the branch list.
   */
  useEffect(() => {
    if (!user) return;
    return subscribeStore(() => {
      setDataVersion((v) => v + 1);
      setSyncProblem(storeProblem());
      setPendingSync(storePending());
      loadSettings().then(setSettings).catch(() => undefined);
      listBranches()
        .then((next) => {
          setBranches(next);
          setActiveBranch((current) => (current ? next.find((b) => b.id === current.id) ?? current : current));
        })
        .catch(() => undefined);
    });
  }, [user]);

  /**
   * Locks again after a spell in the background. Time-based rather than
   * immediate, so glancing at WhatsApp to send a reminder and coming straight
   * back does not force a PIN every time. The hostel being worked in stays
   * as it was.
   */
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        autoBill();
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
  }, [hasPin, autoBill]);

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

  /**
   * Selects the branch to operate.
   *
   * The id is pushed into the service layer *before* the React state updates,
   * so any query a screen fires on the next render is already scoped.
   */
  const chooseBranch = useCallback(
    async (branchId: string) => {
      // A manager works in their own hostel only; the server would refuse the rest.
      if (access.branchId && branchId !== access.branchId) return;
      const branch = await getBranch(branchId);
      if (!branch) return;
      setActiveBranchId(branch.id);
      setActiveBranch(branch);
      await saveSettings({ activeBranchId: branch.id });
      setSettings((current) => ({ ...current, activeBranchId: branch.id }));
      setDataVersion((v) => v + 1);
    },
    [access.branchId]
  );

  const clearBranch = useCallback(() => {
    if (access.branchId) return;
    setActiveBranchId(null);
    setActiveBranch(null);
  }, [access.branchId]);

  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);
  const unlock = useCallback(() => setLocked(false), []);
  const lock = useCallback(() => setLocked(true), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      startupError,
      user,
      opening,
      signIn,
      signOut,
      settings,
      hasPin,
      locked,
      branches,
      activeBranch,
      chooseBranch,
      clearBranch,
      dataVersion,
      invalidate,
      access,
      syncProblem,
      pendingSync,
      updateSettings,
      refreshSettings,
      refreshPinState,
      unlock,
      lock,
    }),
    [
      ready, startupError, user, opening, signIn, signOut, settings, hasPin, locked, branches,
      activeBranch, chooseBranch, clearBranch, dataVersion, invalidate, access, syncProblem, pendingSync,
      updateSettings, refreshSettings, refreshPinState, unlock, lock,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
