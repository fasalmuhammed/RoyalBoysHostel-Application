import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState } from "@/components/Base";
import { Fab, OptionPicker, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { HIT_TARGET, colors, radius, shadow, spacing, type } from "@/constants/theme";
import { AnimatedBar, FadeIn, PressableScale, SkeletonList } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { currentPeriod, FeeFilter, feeTotals, listFees } from "@/services/fees";
import type { FeeRecordWithInmate } from "@/types";
import { formatMoney, formatPeriod, relativeDays, shiftPeriod } from "@/utils/format";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Fees">,
  NativeStackScreenProps<RootStackParamList>
>;

/** Twelve months back plus the next month, which covers advance billing. */
function periodOptions(): string[] {
  const base = currentPeriod();
  return Array.from({ length: 14 }, (_, index) => shiftPeriod(base, 1 - index));
}

export default function FeesScreen({ navigation, route }: Props) {
  const { settings } = useApp();
  const [filter, setFilter] = useState<FeeFilter>(route.params?.filter ?? "all");
  // `undefined` (not navigated with a period at all) keeps today's default of the
  // current month; an explicit `null` (e.g. the dashboard's "See all" shortcut)
  // means "every month".
  const [period, setPeriod] = useState<string | null>(
    route.params?.period !== undefined ? route.params.period : currentPeriod()
  );
  const [search, setSearch] = useState("");
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const debounced = useDebounced(search);

  const { data: totals } = useAsyncData(() => feeTotals(period), [period]);
  const { data: fees, loading } = useAsyncData(
    () => listFees(filter, period, debounced),
    [filter, period, debounced]
  );

  const symbol = settings.currencySymbol;
  const dueCount = totals ? totals.unpaidCount + totals.partialCount : undefined;
  const collectedFraction = totals && totals.billed > 0 ? totals.collected / totals.billed : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fees</Text>
          <Text style={styles.subtitle}>
            {period ? formatPeriod(period) : "All months"}
          </Text>
        </View>
        <PressableScale
          onPress={() => navigation.navigate("Dues")}
          scaleTo={0.9}
          style={styles.duesButton}
          accessibilityRole="button"
          accessibilityLabel="Dues and collections"
        >
          <Ionicons name="alarm-outline" size={19} color={colors.primary} />
        </PressableScale>
        <PressableScale
          onPress={() => setPeriodPickerOpen(true)}
          scaleTo={0.95}
          style={styles.periodChip}
          accessibilityRole="button"
          accessibilityLabel="Change month"
        >
          <Ionicons name="calendar-outline" size={15} color={colors.primary} />
          <Text style={styles.periodText}>{period ? formatPeriod(period) : "All months"}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </PressableScale>
      </View>

      {/*
        Money summary leads the screen: the outstanding figure is what an admin
        opens this tab to check, so it is the largest thing on it.
      */}
      <Card style={styles.summary}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>OUTSTANDING</Text>
            <Text
              style={[
                styles.summaryValue,
                (totals?.outstanding ?? 0) > 0 && { color: colors.danger },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(totals?.outstanding ?? 0, symbol)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>COLLECTED</Text>
            <Text style={styles.summaryValueMuted} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(totals?.collected ?? 0, symbol)}
            </Text>
          </View>
        </View>

        <AnimatedBar fraction={collectedFraction} color={colors.success} height={7} />
        <Text style={styles.summaryFoot}>
          {formatMoney(totals?.billed ?? 0, symbol)} billed
          {totals && totals.billed > 0 ? ` · ${Math.round(collectedFraction * 100)}% collected` : ""}
        </Text>
      </Card>

      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search inmate" />
        <SegmentedTabs<FeeFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All" },
            { key: "due", label: "Due", count: dueCount },
            { key: "unpaid", label: "Unpaid", count: totals?.unpaidCount },
            { key: "partial", label: "Partial", count: totals?.partialCount },
            { key: "paid", label: "Paid", count: totals?.paidCount },
          ]}
        />
      </View>

      {loading && !fees ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={fees ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={12}
          windowSize={9}
          ListEmptyComponent={
            <EmptyState
              icon={debounced ? "search-outline" : "receipt-outline"}
              title={debounced ? "No matches" : "No bills here"}
              message={
                debounced
                  ? `No bill matches "${debounced}".`
                  : period
                    ? `Nothing raised for ${formatPeriod(period)} yet. Raise this month's bills in one tap.`
                    : "No fee records yet."
              }
              action={
                debounced ? undefined : (
                  <Button
                    title="Raise monthly bills"
                    icon="documents-outline"
                    onPress={() => navigation.navigate("GenerateInvoices")}
                  />
                )
              }
            />
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <FeeRow
                fee={item}
                symbol={symbol}
                showPeriod={!period}
                onPress={() => navigation.navigate("FeeDetail", { feeId: item.id })}
              />
            </FadeIn>
          )}
        />
      )}

      <Fab
        icon="documents-outline"
        label="Raise bills"
        onPress={() => navigation.navigate("GenerateInvoices")}
      />

      <OptionPicker
        visible={periodPickerOpen}
        title="Show which month?"
        selectedKey={period ?? "__all__"}
        onClose={() => setPeriodPickerOpen(false)}
        onSelect={(key) => setPeriod(key === "__all__" ? null : key)}
        options={[
          { key: "__all__", label: "All months" },
          ...periodOptions().map((value) => ({ key: value, label: formatPeriod(value) })),
        ]}
      />
    </SafeAreaView>
  );
}

/**
 * One bill.
 *
 * The balance owed is the number that matters, so it takes the right edge and
 * the heavier weight; the total billed sits under it as context. A settled
 * bill drops the amount entirely and just reads PAID -- nothing to chase.
 */
function FeeRow({
  fee,
  symbol,
  showPeriod,
  onPress,
}: {
  fee: FeeRecordWithInmate;
  symbol: string;
  showPeriod: boolean;
  onPress: () => void;
}) {
  const settled = fee.status === "paid";
  const overdue = !settled && fee.dueDate !== "" && new Date(fee.dueDate) <= new Date();

  return (
    <Card style={styles.row} onPress={onPress}>
      <Avatar name={fee.studentName} photoFile={fee.photoFile} size={44} />

      <View style={styles.rowBody}>
        <View style={styles.rowNameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {fee.studentName}
          </Text>
          {fee.admissionType === "stay" ? <Badge label="STAY" tone="neutral" /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            fee.roomLabel ? `Room ${fee.roomLabel}` : null,
            showPeriod ? formatPeriod(fee.period) : null,
            settled ? null : fee.dueDate ? `due ${relativeDays(fee.dueDate)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      <View style={styles.rowTail}>
        {settled ? (
          <Badge label="PAID" tone="success" />
        ) : (
          <>
            <Text style={[styles.balance, overdue && { color: colors.danger }]} numberOfLines={1}>
              {formatMoney(fee.balance, symbol)}
            </Text>
            <Text style={styles.balanceOf} numberOfLines={1}>
              of {formatMoney(fee.total, symbol)}
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.support, color: colors.textMuted, marginTop: 2 },
  duesButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.subtle,
  },
  periodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: HIT_TARGET - 8,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  periodText: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: colors.primary },

  summary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: 0,
    gap: spacing.sm,
    ...shadow.card,
  },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryCell: { flex: 1, gap: 2 },
  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  summaryLabel: { ...type.label, color: colors.textFaint },
  summaryValue: { ...type.metric, color: colors.text },
  summaryValueMuted: { ...type.metric, color: colors.success },
  summaryFoot: { ...type.caption, color: colors.textMuted },

  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 110 },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 4 },
  rowBody: { flex: 1, gap: 2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textMuted },
  rowTail: { alignItems: "flex-end", gap: 1 },
  balance: { ...type.metricSmall, color: colors.text },
  balanceOf: { ...type.caption, color: colors.textFaint },
});
