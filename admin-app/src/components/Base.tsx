import React, { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  Tone,
  colors,
  font,
  fontSize,
  layout,
  radius,
  shadow,
  spacing,
  toneColor,
  type,
} from "@/constants/theme";
import { PressableScale } from "./Motion";

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
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; onPress?: () => void }>) {
  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.985} style={[styles.card, style] as ViewStyle[]}>
        {children}
      </PressableScale>
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
        style={[styles.detailValue, tone ? { color: toneColor[tone].fg, fontFamily: font.bold } : null]}
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
    // Tablet only: cap the column so a card does not stretch into an
    // unreadable band. Left untouched on phones, where the default stretch is
    // what every screen already relies on -- setting `alignSelf` there would
    // collapse each card to its content width instead.
    ...(layout.isTablet
      ? { maxWidth: 720, width: "100%" as const, alignSelf: "center" as const }
      : null),
    ...shadow.card,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeText: { ...type.label, fontSize: fontSize.xs },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: { ...type.section, color: colors.text },
  empty: { alignItems: "center", paddingVertical: spacing.xl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: { ...type.section, color: colors.text },
  emptyMessage: {
    ...type.support,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  detailLabel: { ...type.support, color: colors.textMuted },
  detailValue: {
    ...type.bodyStrong,
    fontSize: fontSize.sm,
    color: colors.text,
    flexShrink: 1,
    textAlign: "right",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: spacing.sm },
  loading: { paddingVertical: spacing.xl * 2, alignItems: "center", gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: fontSize.sm },
  callout: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  calloutText: { ...type.support, color: colors.text },
});
