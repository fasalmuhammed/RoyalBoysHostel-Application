import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { formatDateTime } from "@/utils/format";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "More">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function MoreScreen({ navigation }: Props) {
  const { settings, lock, activeBranch, clearBranch } = useApp();

  const overdueBackup =
    settings.lastBackupAt === null ||
    Date.now() - settings.lastBackupAt > settings.backupReminderDays * 86_400_000;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>More</Text>

        <Pressable style={styles.branchCard} onPress={clearBranch}>
          <View style={styles.branchBadge}>
            <Text style={styles.branchBadgeText}>{activeBranch?.code ?? "?"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.branchLabel}>Operating</Text>
            <Text style={styles.branchName} numberOfLines={1}>
              {activeBranch?.name ?? "No branch selected"}
            </Text>
          </View>
          <View style={styles.switchPill}>
            <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
            <Text style={styles.switchPillText}>Switch</Text>
          </View>
        </Pressable>

        <View style={styles.group}>
          <Row
            icon="search-outline"
            label="Search everything"
            sublabel="Inmates, rooms, bills and notices"
            onPress={() => navigation.navigate("Search")}
          />
          <Row
            icon="notifications-outline"
            label="Notifications"
            sublabel="What needs your attention"
            onPress={() => navigation.navigate("Notifications")}
          />
          <Row
            icon="megaphone-outline"
            label="Notice board"
            sublabel="Post notices and send them to inmates"
            onPress={() => navigation.navigate("Notices")}
          />
          <Row
            icon="logo-whatsapp"
            label="WhatsApp messages"
            sublabel="Announcements and fee reminders"
            onPress={() => navigation.navigate("Messages")}
          />
          <Row
            icon="cloud-upload-outline"
            label="Backup & restore"
            sublabel={
              settings.lastBackupAt
                ? `Last backup ${formatDateTime(settings.lastBackupAt)}`
                : "Never backed up"
            }
            warn={overdueBackup}
            onPress={() => navigation.navigate("Backup")}
          />
          <Row
            icon="document-text-outline"
            label="Reports & CSV export"
            sublabel="Spreadsheets for printing and accounts"
            onPress={() => navigation.navigate("Reports")}
            last
          />
        </View>

        <View style={styles.group}>
          <Row
            icon="settings-outline"
            label="Settings"
            sublabel="Hostel details, PIN, reminders"
            onPress={() => navigation.navigate("Settings")}
          />
          <Row icon="lock-closed-outline" label="Lock the app now" onPress={lock} last />
        </View>

        <Text style={styles.footer}>
          Hostel Manager · v1.0.0{"\n"}
          All data stays on this phone. Nothing is uploaded.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  sublabel,
  onPress,
  last,
  warn,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  last?: boolean;
  warn?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, warn && { backgroundColor: colors.warningBg }]}>
        <Ionicons name={icon} size={19} color={warn ? colors.warning : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.rowSublabel, warn && { color: colors.warning }]} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.text, marginBottom: spacing.lg },
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  branchBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  branchBadgeText: { color: colors.goldLight, fontSize: fontSize.lg, fontWeight: "800" },
  branchLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  branchName: { fontSize: fontSize.md, fontWeight: "700", color: colors.text, marginTop: 1 },
  switchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  switchPillText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.primary },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  rowSublabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  footer: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    textAlign: "center",
    lineHeight: 17,
    marginTop: spacing.md,
  },
});
