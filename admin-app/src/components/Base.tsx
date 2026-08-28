import React, { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, fontSize, radius, shadow, spacing, Tone, toneColor } from "@/constants/theme";

/** Full-screen container with the standard background and safe-area insets. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
}: PropsWithChildren<{ scroll?: boolean; padded?: boolean; style?: ViewStyle }>) {
  const inner = (
    <View style={[padded && { padding: spacing.lg }, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: PropsWithChildren<{ style?: ViewStyle; onPress?: () => void }>) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { fg, bg } = toneColor[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

/** Label/value line used across every detail screen. */
export function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: Tone;
}) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, tone ? { color: toneColor[tone].fg, fontWeight: "700" } : null]}
      >
        {text}
      </Text>
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.loadingText}>{label}</Text> : null}
    </View>
  );
}

/** Inline notice used for warnings and explanations that need to stay visible. */
export function Callout({
  tone = "info",
  icon = "information-circle-outline",
  children,
}: PropsWithChildren<{ tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }>) {
  const { fg, bg } = toneColor[tone];
  return (
    <View style={[styles.callout, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export function CalloutText({ children, style }: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text style={[styles.calloutText, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.3 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  empty: { alignItems: "center", paddingVertical: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  emptyMessage: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    lineHeight: 19,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  detailLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  loading: { paddingVertical: spacing.xl * 2, alignItems: "center", gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: fontSize.sm },
  callout: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  calloutText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
});
