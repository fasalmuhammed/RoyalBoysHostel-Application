import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";

import { Alert } from "@/web/dialog";

/**
 * Picks up a published update while the app is open, then offers a restart
 * in the app's own dialog, instead of leaving the update to apply silently
 * on the next-but-one launch. Checks on start and whenever the app comes back
 * to the front (at most every 10 minutes). Does nothing on the web, in
 * development, or offline.
 */
let lastCheck = 0;
let offered = false;

async function check(): Promise<void> {
  if (offered || Date.now() - lastCheck < 10 * 60 * 1000) return;
  lastCheck = Date.now();
  try {
    const found = await Updates.checkForUpdateAsync();
    if (!found.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) return;
    offered = true;
    Alert.alert("Update ready", "A newer version of the app has been downloaded. Restart now to start using it.", [
      { text: "Later", style: "cancel" },
      { text: "Restart", isPreferred: true, onPress: () => void Updates.reloadAsync() },
    ]);
  } catch {
    // Offline or the update server is unreachable: try again next time.
  }
}

export function watchForUpdates(): () => void {
  if (Platform.OS === "web" || __DEV__ || !Updates.isEnabled) return () => undefined;
  void check();
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") void check();
  });
  return () => subscription.remove();
}

/** "2.0.0 · updated 21 Oct", for the settings screen. */
export function versionLabel(base: string): string {
  if (Platform.OS === "web" || !Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return base;
  const when = Updates.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${base} · updated ${when}`;
}
