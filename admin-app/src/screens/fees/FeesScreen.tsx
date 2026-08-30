import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState, Loading } from "@/components/Base";
import { Fab, OptionPicker, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { currentPeriod, FeeFilter, feeTotals, listFees } from "@/services/fees";
import { formatMoney, formatPeriod, shiftPeriod } from "@/utils/format";
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
  const [period, setPeriod] = useState<string | null>(currentPeriod());
  const [search, setSearch] = useState("");
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const debounced = useDebounced(search);

  const { data: totals } = useAsyncData(() => feeTotals(period), [period]);
  const { data: fees, loading } = useAsyncData(
    () => listFees(filter, period, debounced),
    [filter, period, debounced]
  );

  const symbol = settings.currencySymbol;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Fees</Text>
        <Pressable style={styles.periodChip} onPress={() => setPeriodPickerOpen(true)}>
          <Ionicons name="calendar-outline" size={15} color={colors.primary} />
          <Text style={styles.periodText}>
            {period ? formatPeriod(period) : "All months"}
          </Text>
          <Ionicons name="chevron-down" size={15} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{formatMoney(totals?.billed ?? 0, symbol)}</Text>
          <Text style={styles.summaryLabel}>Billed</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {formatMoney(totals?.collected ?? 0, symbol)}
          </Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>
            {formatMoney(totals?.outstanding ?? 0, symbol)}
          </Text>
          <Text style={styles.summaryLabel}>Outstanding</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search inmate" />
        <SegmentedTabs<FeeFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All" },
            { key: "unpaid", label: "Unpaid", count: totals?.unpaidCount },
            { key: "partial", label: "Partial", count: totals?.partialCount },
            { key: "paid", label: "Paid", count: totals?.paidCount },
          ]}
        />
      </View>

      {loading && !fees ? (
        <Loading />
      ) : (
        <FlatList
          data={fees ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No bills here"
              message={
                period
                  ? `Nothing raised for ${formatPeriod(period)} yet. Raise this month's bills in one tap.`
                  : "No fee records yet."
              }
              action={
                <Button
                  title="Raise monthly bills"
                  icon="documents-outline"
                  onPress={() => navigation.navigate("GenerateInvoices")}
                />
              }
            />
          }
          renderItem={({ item }) => (
            <Card
              style={styles.row}
              onPress={() => navigation.navigate("FeeDetail", { feeId: item.id })}
            >
              <Avatar name={item.studentName} photoFile={item.photoFile} size={44} />

              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.studentName}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.roomLabel ? `Room ${item.roomLabel} · ` : ""}
                  {formatPeriod(item.period)}
                </Text>
              </View>

              <View style={styles.amountCell}>
                <Text style={styles.amount}>{formatMoney(item.total, symbol)}</Text>
                <Badge
                  label={item.status.toUpperCase()}
                  tone={
                    item.status === "paid"
                      ? "success"
                      : item.status === "partial"
                        ? "warning"
                        : "danger"
                  }
                />
              </View>
            </Card>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.text },
  periodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  periodText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  summary: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: fontSize.md, fontWeight: "800", color: colors.text },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 110 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  amountCell: { alignItems: "flex-end", gap: spacing.xs },
  amount: { fontSize: fontSize.md, fontWeight: "800", color: colors.text },
});
