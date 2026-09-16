import React, { useMemo, useState } from "react";
import { Linking, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState } from "@/components/Base";
import { SegmentedTabs } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { FadeIn, PressableScale, SkeletonList } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { DueBucket, groupDues, listAllDues } from "@/services/fees";
import type { FeeRecordWithInmate } from "@/types";
import { formatMoney, relativeDays } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Dues">;

/** Which buckets each tab keeps. `round` is the day's actual work list. */
type DuesScope = "round" | "week" | "all";

const SCOPE_BUCKETS: Record<DuesScope, DueBucket[]> = {
  round: ["overdue", "today"],
  week: ["overdue", "today", "tomorrow", "week"],
  all: ["overdue", "today", "tomorrow", "week", "later"],
};

export default function DuesScreen({ navigation }: Props) {
  const { settings } = useApp();
  const [scope, setScope] = useState<DuesScope>("round");

  const { data, loading, reload } = useAsyncData(() => listAllDues(), []);

  const groups = useMemo(() => groupDues(data ?? []), [data]);
  const visible = useMemo(
    () => groups.filter((group) => SCOPE_BUCKETS[scope].includes(group.key)),
    [groups, scope]
  );

  const symbol = settings.currencySymbol;
  const scopeTotal = visible.reduce((sum, group) => sum + group.total, 0);
  const scopeCount = visible.reduce((sum, group) => sum + group.fees.length, 0);

  const counts = useMemo(() => {
    const of = (buckets: DueBucket[]) =>
      groups
        .filter((group) => buckets.includes(group.key))
        .reduce((sum, group) => sum + group.fees.length, 0);
    return {
      round: of(SCOPE_BUCKETS.round),
      week: of(SCOPE_BUCKETS.week),
      all: of(SCOPE_BUCKETS.all),
    };
  }, [groups]);

  const remind = (fees: FeeRecordWithInmate[]) => {
    if (fees.length === 0) return;
    navigation.navigate("Compose", {
      kind: "fee_reminder",
      feeIds: fees.map((fee) => fee.id),
    });
  };

  const call = (phone: string) => {
    if (!phone.trim()) return;
    Linking.openURL(`tel:${phone.replace(/\s/g, "")}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>
            {scope === "round" ? "TO COLLECT TODAY" : scope === "week" ? "NEXT 7 DAYS" : "ALL DUES"}
          </Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(scopeTotal, symbol)}
          </Text>
          <Text style={styles.summaryMeta}>
            {scopeCount} {scopeCount === 1 ? "inmate" : "inmates"}
          </Text>
        </View>
        {scopeCount > 0 ? (
          <PressableScale
            style={styles.remindAll}
            onPress={() => remind(visible.flatMap((group) => group.fees))}
            accessibilityRole="button"
            accessibilityLabel={`Remind all ${scopeCount} on WhatsApp`}
          >
            <Ionicons name="logo-whatsapp" size={17} color={colors.primaryOn} />
            <Text style={styles.remindAllText}>Remind all</Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.controls}>
        <SegmentedTabs<DuesScope>
          value={scope}
          onChange={setScope}
          options={[
            { key: "round", label: "Today's round", count: counts.round },
            { key: "week", label: "This week", count: counts.week },
            { key: "all", label: "All", count: counts.all },
          ]}
        />
      </View>

      {loading && !data ? (
        <SkeletonList />
      ) : (
        <SectionList
          sections={visible.map((group) => ({ ...group, data: group.fees }))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          initialNumToRender={12}
          onRefresh={reload}
          refreshing={loading && !!data}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              title={scope === "round" ? "Nothing to collect today" : "No dues outstanding"}
              message={
                scope === "round"
                  ? "No bill is overdue or falls due today. Check 'This week' to get ahead."
                  : "Every bill raised for an active inmate has been settled."
              }
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Badge
                    label={String(section.fees.length)}
                    tone={section.key === "overdue" ? "danger" : "neutral"}
                  />
                </View>
                <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              </View>
              <View style={styles.sectionRight}>
                <Text
                  style={[
                    styles.sectionTotal,
                    section.key === "overdue" && { color: colors.danger },
                  ]}
                >
                  {formatMoney(section.total, symbol)}
                </Text>
                <PressableScale
                  scaleTo={0.94}
                  style={styles.sectionRemind}
                  onPress={() => remind(section.fees)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remind ${section.title}`}
                >
                  <Ionicons name="logo-whatsapp" size={14} color={colors.success} />
                  <Text style={styles.sectionRemindText}>Remind</Text>
                </PressableScale>
              </View>
            </View>
          )}
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <Card
                style={styles.row}
                onPress={() => navigation.navigate("FeeDetail", { feeId: item.id })}
              >
                <Avatar name={item.studentName} photoFile={item.photoFile} size={42} />

                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.studentName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[
                      item.roomLabel ? `Room ${item.roomLabel}` : "No room",
                      item.dueDate ? `due ${relativeDays(item.dueDate)}` : "no due date",
                    ].join(" · ")}
                  </Text>
                </View>

                <View style={styles.rowTail}>
                  <Text style={styles.amount} numberOfLines={1}>
                    {formatMoney(item.balance, symbol)}
                  </Text>
                  <View style={styles.rowActions}>
                    <PressableScale
                      scaleTo={0.88}
                      style={styles.rowAction}
                      disabled={!item.studentPhone}
                      onPress={() => call(item.studentPhone)}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${item.studentName}`}
                    >
                      <Ionicons
                        name="call-outline"
                        size={16}
                        color={item.studentPhone ? colors.primary : colors.textFaint}
                      />
                    </PressableScale>
                    <PressableScale
                      scaleTo={0.88}
                      style={styles.rowAction}
                      onPress={() => navigation.navigate("CollectFee", { feeId: item.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Collect from ${item.studentName}`}
                    >
                      <Ionicons name="cash-outline" size={16} color={colors.success} />
                    </PressableScale>
                  </View>
                </View>
              </Card>
            </FadeIn>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  summaryLabel: { ...type.label, color: colors.textFaint },
  summaryValue: { ...type.display, color: colors.text, marginTop: 2 },
  summaryMeta: { ...type.caption, color: colors.textMuted },
  remindAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    minHeight: HIT_TARGET,
    borderRadius: radius.md,
  },
  remindAllText: { ...type.bodyStrong, color: colors.primaryOn },

  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionTitle: { ...type.section, color: colors.text },
  sectionSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  sectionRight: { alignItems: "flex-end", gap: 2 },
  sectionTotal: { ...type.metricSmall, color: colors.text },
  sectionRemind: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: HIT_TARGET - 12,
  },
  sectionRemindText: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: colors.success },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 4 },
  rowBody: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  rowTail: { alignItems: "flex-end", gap: spacing.xs },
  amount: { ...type.metricSmall, color: colors.danger },
  rowActions: { flexDirection: "row", gap: spacing.xs },
  rowAction: {
    width: HIT_TARGET - 10,
    height: HIT_TARGET - 12,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
