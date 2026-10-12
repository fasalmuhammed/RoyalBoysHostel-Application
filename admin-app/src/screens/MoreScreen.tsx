import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Tone, colors, gradients, fontSize, radius, shadow, spacing, toneColor, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { initials } from "@/utils/format";
import { countApplications } from "@/services/admissions";
import HostelSwitch from "@/components/HostelSwitch";
import { LiquidBlobs } from "@/components/Liquid";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "More">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function MoreScreen({ navigation }: Props) {
  const { activeBranch, allHostels, access, user, signOut } = useApp();
  const displayName = user?.name || user?.username || "";
  // Recounted on every live refresh (the context re-renders this screen).
  const waiting = countApplications();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>More</Text>

        <View style={styles.profile}>
          <LinearGradient colors={[...gradients.hero]} start={gradients.heroStart} end={gradients.heroEnd} style={StyleSheet.absoluteFill} />
          <LiquidBlobs scale={0.7} />
          <View style={styles.profileTop}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitials}>{initials(displayName || "?")}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.profileRole} numberOfLines={1}>
                {access.isOwner ? (allHostels ? "Admin · showing both hostels" : "Admin") : "Branch manager"}
              </Text>
            </View>
          </View>
          {access.isOwner ? (
            <HostelSwitch variant="dark" />
          ) : (
            <View style={styles.branchRow}>
              <Ionicons name="business-outline" size={17} color={colors.goldLight} />
              <View style={{ flex: 1 }}>
                <Text style={styles.branchLabel}>Your hostel</Text>
                <Text style={styles.branchName} numberOfLines={1}>
                  {activeBranch?.name ?? "No hostel"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {access.canEdit ? (
          <View style={styles.group}>
            <Row
              icon="people-circle-outline"
              label="Logins"
              sublabel="Manager logins, passwords and access"
              onPress={() => navigation.navigate("Staff")}
              last
            />
          </View>
        ) : null}

        <Text style={styles.groupLabel}>NEW STUDENTS</Text>
        <View style={styles.group}>
          <Row
            icon="person-add-outline"
            label="Applications"
            sublabel={
              waiting > 0
                ? `${waiting} pending for approval`
                : "Forms students sent with the QR code"
            }
            tone={waiting > 0 ? "warning" : undefined}
            onPress={() => navigation.navigate("Admissions")}
          />
          <Row
            icon="qr-code-outline"
            label="Registration QR code"
            sublabel="Students scan it and fill in their own details"
            onPress={() => navigation.navigate("JoinQr")}
            last
          />
        </View>

        <Text style={styles.groupLabel}>DAY TO DAY</Text>
        <View style={styles.group}>
          <Row
            tone="danger"
            icon="alarm-outline"
            label="Dues & collections"
            sublabel="Who owes what, today and this week"
            onPress={() => navigation.navigate("Dues")}
          />
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
            tone="success"
            icon="logo-whatsapp"
            label="WhatsApp messages"
            sublabel="Announcements and fee reminders"
            onPress={() => navigation.navigate("Messages")}
          />
          <Row
            icon="document-text-outline"
            label="Reports"
            sublabel="Download spreadsheets for printing and accounts"
            onPress={() => navigation.navigate("Reports")}
            last
          />
        </View>

        <Text style={styles.groupLabel}>THIS DEVICE</Text>
        <View style={styles.group}>
          {access.isOwner ? (
            <Row
              tone="neutral"
              icon="settings-outline"
              label="Settings"
              sublabel="Hostel name, country code and currency"
              onPress={() => navigation.navigate("Settings")}
            />
          ) : null}
          <Row
            tone="danger"
            icon="log-out-outline"
            label="Log out"
            sublabel={user ? `Signed in as ${user.name || user.username}` : undefined}
            onPress={() => void signOut()}
            last
          />
        </View>

        <Text style={styles.footer}>
          Royal Boys Hostel · v{Constants.expoConfig?.version ?? "—"}{"\n"}
          Records are kept online and update live on every device.
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
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  last?: boolean;
  /** Colours the icon tile; the default is the brand blue. */
  tone?: Tone;
}) {
  const tint = tone ? toneColor[tone] : { fg: colors.primary, bg: colors.primaryLight };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: tint.bg }]}>
        <Ionicons name={icon} size={19} color={tint.fg} />
      </View>
      <View style={[styles.rowBody, !last && styles.rowBorder]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          {sublabel ? (
            <Text style={styles.rowSublabel} numberOfLines={1}>
              {sublabel}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 130 },
  title: { ...type.title, color: colors.text, marginBottom: spacing.md },

  profile: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    overflow: "hidden",
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  profileTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitials: { ...type.section, color: colors.goldLight },
  profileName: { ...type.section, color: colors.onDark },
  profileRole: { ...type.support, color: colors.onDarkMuted, marginTop: 1 },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  branchLabel: { fontSize: fontSize.xs, color: colors.onDarkMuted },
  branchName: { ...type.bodyStrong, color: colors.onDark, marginTop: 1 },
  switchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  switchPillText: { ...type.label, color: colors.primaryDark },

  groupLabel: {
    ...type.label,
    color: colors.textFaint,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
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
    paddingLeft: spacing.md,
  },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: spacing.md - 1,
    minHeight: 60,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { ...type.bodyStrong, color: colors.text },
  rowSublabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  footer: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    textAlign: "center",
    lineHeight: 17,
    marginTop: spacing.sm,
  },
});
