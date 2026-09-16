import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card } from "@/components/Base";
import Avatar from "@/components/Avatar";
import {
  HIT_TARGET,
  colors,
  fontSize,
  layout,
  radius,
  shadow,
  spacing,
  type,
} from "@/constants/theme";
import { AnimatedBar, FadeIn, PressableScale, Skeleton, useCountUp } from "@/components/Motion";
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

/** How many overdue rows the dashboard previews before deferring to the Fees tab. */
const DUE_PREVIEW = 4;

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
  const backupOverdue = backupAgeDays === null || backupAgeDays >= settings.backupReminderDays;
  const symbol = settings.currencySymbol;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.branchName} numberOfLines={1}>
              {activeBranch?.name ?? settings.hostelName}
            </Text>
          </View>
          <IconButton
            icon="notifications-outline"
            label="Notifications"
            onPress={() => navigation.navigate("Notifications")}
          />
          <IconButton
            icon="search-outline"
            label="Search"
            onPress={() => navigation.navigate("Search")}
          />
        </View>

        {loading && !data ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Critical first: things that cost the admin money or data if ignored. */}
            {backupOverdue ? (
              <FadeIn>
                <AlertRow
                  tone="warning"
                  icon="cloud-upload-outline"
                  title={
                    backupAgeDays === null
                      ? "No backup yet"
                      : `Last backup ${backupAgeDays} days ago`
                  }
                  body="This phone is the only copy of your records."
                  onPress={() => navigation.navigate("Backup")}
                />
              </FadeIn>
            ) : null}

            {data && data.due.length > 0 ? (
              <FadeIn index={1}>
                <AlertRow
                  tone="danger"
                  icon="alarm-outline"
                  title={`${data.due.length} ${data.due.length === 1 ? "bill is" : "bills are"} overdue`}
                  body={`${formatMoney(
                    data.due.reduce((sum, fee) => sum + fee.balance, 0),
                    symbol
                  )} outstanding right now.`}
                  onPress={() => navigation.navigate("Dues")}
                />
              </FadeIn>
            ) : null}

            <FadeIn index={3}>
              <OccupancyCard
                inmates={data?.inmates.active ?? 0}
                occupied={data?.occupancy.occupied ?? 0}
                beds={data?.occupancy.beds ?? 0}
                vacant={data?.occupancy.vacant ?? 0}
                unassigned={data?.inmates.unassigned ?? 0}
                onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
                onInmatesPress={() => navigation.navigate("Tabs", { screen: "Inmates" })}
                onUnassignedPress={() =>
                  navigation.navigate("Tabs", {
                    screen: "Inmates",
                    params: { filter: "unassigned" },
                  })
                }
              />
            </FadeIn>

            <FadeIn index={4}>
              <CollectionCard
                period={period}
                collected={data?.fees.collected ?? 0}
                outstanding={data?.fees.outstanding ?? 0}
                billed={data?.fees.billed ?? 0}
                paidCount={data?.fees.paidCount ?? 0}
                partialCount={data?.fees.partialCount ?? 0}
                unpaidCount={data?.fees.unpaidCount ?? 0}
                symbol={symbol}
                onPress={() => navigation.navigate("Tabs", { screen: "Fees" })}
              />
            </FadeIn>

            <SectionHeading title="Quick actions" />
            <View style={styles.quickGrid}>
              <QuickActionTile
                label="Add inmate"
                icon="person-add-outline"
                onPress={() => navigation.navigate("InmateForm")}
              />
              <QuickActionTile
                label="Add room"
                icon="add-circle-outline"
                onPress={() => navigation.navigate("RoomForm")}
              />
              <QuickActionTile
                label="Dues"
                icon="alarm-outline"
                onPress={() => navigation.navigate("Dues")}
              />
              <QuickActionTile
                label="Raise bills"
                icon="receipt-outline"
                onPress={() => navigation.navigate("GenerateInvoices")}
              />
              <QuickActionTile
                label="Complaints"
                icon="construct-outline"
                onPress={() => navigation.navigate("Complaints")}
              />
              <QuickActionTile
                label="Notice"
                icon="megaphone-outline"
                onPress={() => navigation.navigate("NoticeForm")}
              />
              <QuickActionTile
                label="WhatsApp"
                icon="logo-whatsapp"
                onPress={() => navigation.navigate("Messages")}
              />
              <QuickActionTile
                label="Reports"
                icon="bar-chart-outline"
                onPress={() => navigation.navigate("Reports")}
              />
              <QuickActionTile
                label="Backup"
                icon="cloud-upload-outline"
                onPress={() => navigation.navigate("Backup")}
              />
            </View>

            {data && data.due.length > 0 ? (
              <>
                <SectionHeading
                  title="Needs collecting"
                  action={
                    <Pressable hitSlop={8} onPress={() => navigation.navigate("Dues")}>
                      <Text style={styles.link}>See all {data.due.length}</Text>
                    </Pressable>
                  }
                />
                {data.due.slice(0, DUE_PREVIEW).map((fee, index) => (
                  <FadeIn key={fee.id} index={index}>
                    <Card
                      onPress={() => navigation.navigate("FeeDetail", { feeId: fee.id })}
                      style={styles.dueCard}
                    >
                      <Avatar name={fee.studentName} photoFile={fee.photoFile} size={42} />
                      <View style={styles.dueBody}>
                        <View style={styles.dueNameRow}>
                          <Text style={styles.dueName} numberOfLines={1}>
                            {fee.studentName}
                          </Text>
                          {fee.admissionType === "stay" ? <Badge label="STAY" tone="info" /> : null}
                        </View>
                        <Text style={styles.dueMeta} numberOfLines={1}>
                          {fee.roomLabel ? `Room ${fee.roomLabel} · ` : ""}
                          due {relativeDays(fee.dueDate)}
                        </Text>
                      </View>
                      <Text style={styles.dueAmount}>{formatMoney(fee.balance, symbol)}</Text>
                    </Card>
                  </FadeIn>
                ))}

                <PressableScale
                  style={styles.remindAll}
                  onPress={() =>
                    navigation.navigate("Compose", {
                      kind: "fee_reminder",
                      feeIds: data.due.map((f) => f.id),
                    })
                  }
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.primary} />
                  <Text style={styles.remindAllText}>
                    Remind all {data.due.length} on WhatsApp
                  </Text>
                </PressableScale>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- pieces -----------------------------------------------------------------

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      style={styles.iconButton}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={19} color={colors.text} />
    </PressableScale>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

/**
 * A single line of "you should look at this".
 *
 * Alerts carry an icon *and* a word, never colour alone -- the same reason
 * status is never communicated by a coloured dot on its own anywhere else.
 */
function AlertRow({
  tone,
  icon,
  title,
  body,
  onPress,
}: {
  tone: "warning" | "danger";
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const accent = tone === "danger" ? colors.danger : colors.warning;
  const tint = tone === "danger" ? colors.dangerBg : colors.warningBg;

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={[styles.alert, { backgroundColor: tint }]}>
      <View style={[styles.alertIcon, { backgroundColor: accent }]}>
        <Ionicons name={icon} size={16} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.alertTitle, { color: accent }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.alertBody} numberOfLines={2}>
          {body}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={accent} />
    </PressableScale>
  );
}

/**
 * Beds at a glance: the bar carries the story, the numbers confirm it.
 *
 * The headline counts beds, so the footer carries the count of *people* --
 * the two differ whenever someone is admitted before a room is allocated,
 * and an operator wants both.
 */
function OccupancyCard({
  inmates,
  occupied,
  beds,
  vacant,
  unassigned,
  onPress,
  onInmatesPress,
  onUnassignedPress,
}: {
  inmates: number;
  occupied: number;
  beds: number;
  vacant: number;
  unassigned: number;
  onPress: () => void;
  onInmatesPress: () => void;
  onUnassignedPress: () => void;
}) {
  const occupiedCount = useCountUp(occupied);
  const fraction = beds > 0 ? occupied / beds : 0;
  const percent = Math.round(fraction * 100);

  return (
    <Card onPress={onPress} style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelLabel}>OCCUPANCY</Text>
        <Text style={styles.panelPercent}>{percent}%</Text>
      </View>

      <View style={styles.occupancyFigures}>
        <Text style={styles.occupancyValue}>{occupiedCount}</Text>
        <Text style={styles.occupancyOf}>of {beds} beds filled</Text>
      </View>

      <AnimatedBar fraction={fraction} color={colors.primary} height={8} />

      <View style={styles.panelFooter}>
        <FooterStat
          label="Inmates"
          value={inmates}
          tone={colors.text}
          onPress={onInmatesPress}
        />
        <FooterStat label="Vacant" value={vacant} tone={colors.success} />
        <FooterStat
          label="No room"
          value={unassigned}
          tone={unassigned > 0 ? colors.warning : colors.textFaint}
          onPress={unassigned > 0 ? onUnassignedPress : undefined}
        />
      </View>
    </Card>
  );
}

/** This month's money. Precise, calm, no decoration. */
function CollectionCard({
  period,
  collected,
  outstanding,
  billed,
  paidCount,
  partialCount,
  unpaidCount,
  symbol,
  onPress,
}: {
  period: string;
  collected: number;
  outstanding: number;
  billed: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  symbol: string;
  onPress: () => void;
}) {
  const fraction = billed > 0 ? collected / billed : 0;

  return (
    <Card onPress={onPress} style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelLabel}>COLLECTION</Text>
        <Text style={styles.panelPeriod}>{formatPeriod(period)}</Text>
      </View>

      <View style={styles.moneyRow}>
        <View style={styles.moneyCell}>
          <Text style={styles.moneyValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(collected, symbol)}
          </Text>
          <Text style={styles.moneyLabel}>Collected</Text>
        </View>
        <View style={styles.moneyDivider} />
        <View style={styles.moneyCell}>
          <Text
            style={[styles.moneyValue, outstanding > 0 && { color: colors.danger }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(outstanding, symbol)}
          </Text>
          <Text style={styles.moneyLabel}>Outstanding</Text>
        </View>
      </View>

      <AnimatedBar fraction={fraction} color={colors.success} height={8} />

      <View style={styles.panelFooter}>
        <FooterStat label="Paid" value={paidCount} tone={colors.success} />
        <FooterStat label="Partial" value={partialCount} tone={colors.warning} />
        <FooterStat label="Unpaid" value={unpaidCount} tone={colors.danger} />
      </View>
    </Card>
  );
}

function FooterStat({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  tone: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={[styles.footerValue, { color: tone }]}>{value}</Text>
      <Text style={styles.footerLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.footerStat} hitSlop={6}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.footerStat}>{body}</View>;
}

function QuickActionTile({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      style={styles.quickTile}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickTileIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.quickTileLabel} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Shaped like the real content, so the screen does not jump when data lands. */
function DashboardSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={64} style={{ borderRadius: radius.lg }} />
      <Skeleton height={168} style={{ borderRadius: radius.lg }} />
      <Skeleton height={168} style={{ borderRadius: radius.lg }} />
      <Skeleton height={20} width="40%" />
      <View style={styles.quickGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height={92} style={styles.quickTileSkeleton} />
        ))}
      </View>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl * 2,
    // A tablet's content column stays readable instead of stretching edge to edge.
    ...(layout.isTablet ? { maxWidth: 720, width: "100%" as const, alignSelf: "center" as const } : null),
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  greeting: { ...type.support, color: colors.textMuted },
  branchName: { ...type.title, color: colors.text, marginTop: 2 },
  iconButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.subtle,
  },

  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.section, color: colors.text },
  link: { ...type.bodyStrong, color: colors.primary, fontSize: fontSize.sm },

  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.lg,
    padding: spacing.md - 2,
    marginBottom: spacing.md,
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: { ...type.bodyStrong },
  alertBody: { ...type.support, color: colors.textMuted, marginTop: 1 },

  panel: { padding: spacing.md, gap: spacing.sm + 2 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelLabel: { ...type.label, color: colors.textFaint },
  panelPercent: { ...type.metricSmall, color: colors.primary },
  panelPeriod: { ...type.caption, color: colors.textMuted },

  occupancyFigures: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs + 2 },
  occupancyValue: { ...type.display, color: colors.text },
  occupancyOf: { ...type.support, color: colors.textMuted },

  moneyRow: { flexDirection: "row", alignItems: "center" },
  moneyCell: { flex: 1 },
  moneyDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  moneyValue: { ...type.metric, color: colors.text },
  moneyLabel: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  panelFooter: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  footerStat: { flex: 1 },
  footerValue: { ...type.metricSmall },
  footerLabel: { ...type.caption, color: colors.textMuted, marginTop: 1 },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickTile: {
    // Three per row: two gaps of `spacing.sm` shared across the row, with a
    // little slack so rounding never spills a tile onto its own line.
    width: "31.5%",
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xs,
    ...shadow.subtle,
  },
  quickTileSkeleton: { width: "31.5%", borderRadius: radius.lg },
  quickTileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileLabel: { ...type.caption, color: colors.text, textAlign: "center" },

  dueCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 4 },
  dueBody: { flex: 1, gap: 2 },
  dueNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dueName: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  dueMeta: { ...type.caption, color: colors.textMuted },
  dueAmount: { ...type.metricSmall, color: colors.danger },

  remindAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: HIT_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
  remindAllText: { ...type.bodyStrong, color: colors.primary, fontSize: fontSize.sm },
});
