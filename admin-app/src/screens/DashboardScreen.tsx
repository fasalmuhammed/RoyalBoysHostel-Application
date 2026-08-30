import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, Loading, SectionTitle } from "@/components/Base";
import { QuickAction, StatCard } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { colors, fontSize, radius, shadow, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { inmateCounts } from "@/services/inmates";
import { occupancyTotals } from "@/services/rooms";
import { currentPeriod, feeTotals, listDueForReminder } from "@/services/fees";
import { formatMoney, formatPeriod, relativeDays, toIsoDate } from "@/utils/format";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Dashboard">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function DashboardScreen({ navigation }: Props) {
  const { settings, activeBranch } = useApp();
  const period = currentPeriod();

  const { data, loading, reload } = useAsyncData(async () => {
    const [inmates, occupancy, fees, due] = await Promise.all([
      inmateCounts(),
      occupancyTotals(),
      feeTotals(period),
      listDueForReminder(toIsoDate()),
    ]);
    return { inmates, occupancy, fees, due };
  }, [period]);

  const backupAgeDays = settings.lastBackupAt
    ? Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000)
    : null;
  const backupOverdue =
    backupAgeDays === null || backupAgeDays >= settings.backupReminderDays;

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <Loading label="Loading your hostel…" />
      </SafeAreaView>
    );
  }

  const symbol = settings.currencySymbol;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Pressable
            onPress={() => navigation.navigate("Notifications")}
            style={styles.iconButton}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("Settings")}
            style={styles.iconButton}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerGreeting}>{greeting()} 👋</Text>
            <Text style={styles.bannerHostel} numberOfLines={1}>
              {activeBranch?.shortName ?? settings.hostelName}
            </Text>
            <Text style={styles.bannerNote} numberOfLines={1}>
              {data && data.due.length > 0
                ? `${data.due.length} fee${data.due.length === 1 ? "" : "s"} overdue today`
                : "Everything is up to date."}
            </Text>
          </View>
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>{activeBranch?.code ?? "?"}</Text>
          </View>
        </View>

        <SectionTitle title="Overview" />

        {backupOverdue ? (
          <Pressable onPress={() => navigation.navigate("Backup")}>
            <Callout tone="warning" icon="cloud-upload-outline">
              <CalloutText style={{ fontWeight: "700" }}>
                {backupAgeDays === null
                  ? "You have never backed up"
                  : `Last backup was ${backupAgeDays} days ago`}
              </CalloutText>
              <CalloutText style={{ marginTop: 2 }}>
                If this phone is lost or broken, everything goes with it. Tap to export a backup.
              </CalloutText>
            </Callout>
          </Pressable>
        ) : null}

        <View style={styles.statRow}>
          <StatCard
            label="Inmates"
            value={data?.inmates.active ?? 0}
            icon="people-outline"
            tone="info"
            onPress={() => navigation.navigate("Tabs", { screen: "Inmates" })}
          />
          <StatCard
            label="Beds occupied"
            value={`${data?.occupancy.occupied ?? 0}/${data?.occupancy.beds ?? 0}`}
            icon="bed-outline"
            tone="success"
            onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
          />
        </View>

        <View style={styles.statRow}>
          <StatCard
            label="Vacant beds"
            value={data?.occupancy.vacant ?? 0}
            icon="home-outline"
            tone="neutral"
            onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
          />
          <StatCard
            label="Unassigned"
            value={data?.inmates.unassigned ?? 0}
            icon="alert-circle-outline"
            tone={data?.inmates.unassigned ? "warning" : "neutral"}
            onPress={() =>
              navigation.navigate("Tabs", {
                screen: "Inmates",
                params: { filter: "unassigned" },
              })
            }
          />
        </View>

        <SectionTitle title={`Fees · ${formatPeriod(period)}`} />
        <Card onPress={() => navigation.navigate("Tabs", { screen: "Fees" })}>
          <View style={styles.feeRow}>
            <View style={styles.feeCell}>
              <Text style={styles.feeValue}>{formatMoney(data?.fees.collected ?? 0, symbol)}</Text>
              <Text style={styles.feeLabel}>Collected</Text>
            </View>
            <View style={styles.feeDivider} />
            <View style={styles.feeCell}>
              <Text style={[styles.feeValue, { color: colors.danger }]}>
                {formatMoney(data?.fees.outstanding ?? 0, symbol)}
              </Text>
              <Text style={styles.feeLabel}>Outstanding</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${
                    data && data.fees.billed > 0
                      ? Math.min((data.fees.collected / data.fees.billed) * 100, 100)
                      : 0
                  }%`,
                },
              ]}
            />
          </View>

          <View style={styles.pillRow}>
            <MiniPill label="Paid" value={data?.fees.paidCount ?? 0} tone={colors.success} />
            <MiniPill label="Partial" value={data?.fees.partialCount ?? 0} tone={colors.warning} />
            <MiniPill label="Unpaid" value={data?.fees.unpaidCount ?? 0} tone={colors.danger} />
          </View>
        </Card>

        <SectionTitle title="Quick actions" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          <QuickAction
            label="Add inmate"
            icon="person-add-outline"
            onPress={() => navigation.navigate("InmateForm")}
          />
          <QuickAction
            label="Add room"
            icon="add-circle-outline"
            onPress={() => navigation.navigate("RoomForm")}
          />
          <QuickAction
            label="Raise fees"
            icon="receipt-outline"
            onPress={() => navigation.navigate("GenerateInvoices")}
          />
          <QuickAction
            label="Complaints"
            icon="construct-outline"
            onPress={() => navigation.navigate("Complaints")}
          />
          <QuickAction
            label="Notice"
            icon="megaphone-outline"
            onPress={() => navigation.navigate("NoticeForm")}
          />
          <QuickAction
            label="WhatsApp"
            icon="logo-whatsapp"
            onPress={() => navigation.navigate("Messages")}
          />
        </ScrollView>

        {data && data.due.length > 0 ? (
          <>
            <SectionTitle
              title={`Overdue fees (${data.due.length})`}
              action={
                <Pressable
                  onPress={() =>
                    navigation.navigate("Compose", {
                      kind: "fee_reminder",
                      feeIds: data.due.map((f) => f.id),
                    })
                  }
                >
                  <Text style={styles.link}>Remind all</Text>
                </Pressable>
              }
            />
            {data.due.slice(0, 5).map((fee) => (
              <Card
                key={fee.id}
                onPress={() => navigation.navigate("FeeDetail", { feeId: fee.id })}
                style={styles.dueCard}
              >
                <Avatar name={fee.studentName} photoFile={fee.photoFile} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dueName} numberOfLines={1}>
                    {fee.studentName}
                  </Text>
                  <Text style={styles.dueMeta}>
                    {fee.roomLabel ? `Room ${fee.roomLabel} · ` : ""}
                    due {relativeDays(fee.dueDate)}
                  </Text>
                </View>
                <Text style={styles.dueAmount}>{formatMoney(fee.balance, symbol)}</Text>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.miniPill}>
      <View style={[styles.miniDot, { backgroundColor: tone }]} />
      <Text style={styles.miniText}>
        {label} {value}
      </Text>
    </View>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerTitle: { flex: 1, fontSize: fontSize.xl, fontWeight: "800", color: colors.text },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  bannerGreeting: { color: colors.primaryOn, fontSize: fontSize.lg, fontWeight: "800" },
  bannerHostel: { color: "rgba(255,255,255,0.92)", fontSize: fontSize.sm, marginTop: 2 },
  bannerNote: { color: "rgba(255,255,255,0.78)", fontSize: fontSize.xs, marginTop: spacing.xs },
  bannerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerBadgeText: { color: colors.primaryOn, fontSize: fontSize.lg, fontWeight: "800" },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  statRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  feeRow: { flexDirection: "row", alignItems: "center" },
  feeCell: { flex: 1 },
  feeDivider: { width: 1, height: 34, backgroundColor: colors.border },
  feeValue: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  feeLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  pillRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  miniPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  miniDot: { width: 7, height: 7, borderRadius: 4 },
  miniText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: "600" },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    paddingRight: spacing.md,
  },
  link: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
  dueCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dueName: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  dueMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  dueAmount: { fontSize: fontSize.md, fontWeight: "800", color: colors.danger },
});
