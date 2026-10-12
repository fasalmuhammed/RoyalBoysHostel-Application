import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, shadow, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

/**
 * A small pill that floats above the tab bar while the app is out of touch
 * with the server: either changes are waiting to be sent, or live updates
 * have stopped. It disappears by itself when everything is in step again.
 */
export default function SyncBanner() {
  const { user, pendingSync, syncProblem } = useApp();
  const insets = useSafeAreaInsets();
  if (!user || (pendingSync === 0 && !syncProblem)) return null;

  const waiting = pendingSync > 0;
  const text = waiting
    ? `Offline · ${pendingSync} ${pendingSync === 1 ? "change" : "changes"} will be sent when the connection is back. Keep the app open.`
    : syncProblem;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 80 }]}>
      <View style={[styles.pill, !waiting && styles.pillProblem]}>
        <Ionicons name={waiting ? "cloud-offline-outline" : "sync-outline"} size={16} color={colors.onDark} />
        <Text style={styles.text} numberOfLines={3}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.md, right: spacing.md, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxWidth: 480,
    ...shadow.raised,
  },
  pillProblem: { backgroundColor: colors.warning },
  text: { ...type.support, color: colors.onDark, flexShrink: 1 },
});
