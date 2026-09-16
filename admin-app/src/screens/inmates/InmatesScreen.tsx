import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { HIT_TARGET, colors, radius, shadow, spacing, type } from "@/constants/theme";
import { FadeIn, PressableScale, SkeletonList } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { listInmates, InmateFilter, inmateCounts, InmateWithRoom } from "@/services/inmates";
import { formatInmateId } from "@/services/branches";
import { formatMoney } from "@/utils/format";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Inmates">,
  NativeStackScreenProps<RootStackParamList>
>;

/** What an empty result means depends on why the list is empty. */
function emptyCopy(filter: InmateFilter, search: string) {
  if (search) {
    return {
      icon: "search-outline" as const,
      title: "No matches",
      message: `Nothing matches "${search}". Try a name, inmate id or phone number.`,
    };
  }
  switch (filter) {
    case "unassigned":
      return {
        icon: "checkmark-circle-outline" as const,
        title: "Everyone has a bed",
        message: "No active inmate is waiting on a room allocation.",
      };
    case "left":
      return {
        icon: "exit-outline" as const,
        title: "Nobody has left",
        message: "Inmates you mark as left are kept here with their fee history.",
      };
    default:
      return {
        icon: "people-outline" as const,
        title: "No inmates yet",
        message: "Add your first inmate and take their photo right from the form.",
      };
  }
}

export default function InmatesScreen({ navigation, route }: Props) {
  const { settings } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InmateFilter>(route.params?.filter ?? "active");
  const debouncedSearch = useDebounced(search);

  const { data: counts } = useAsyncData(() => inmateCounts(), []);
  const { data: inmates, loading } = useAsyncData(
    () => listInmates(debouncedSearch, filter),
    [debouncedSearch, filter]
  );

  const empty = emptyCopy(filter, debouncedSearch);
  const resultCount = inmates?.length ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Inmates</Text>
          <Text style={styles.subtitle}>
            {counts ? `${counts.active} active · ${counts.total} on the register` : " "}
          </Text>
        </View>
        <PressableScale
          onPress={() => navigation.navigate("Search")}
          scaleTo={0.9}
          style={styles.headerIcon}
          accessibilityRole="button"
          accessibilityLabel="Search everything"
        >
          <Ionicons name="search" size={19} color={colors.text} />
        </PressableScale>
      </View>

      <View style={styles.controls}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, inmate id or phone"
        />
        <SegmentedTabs<InmateFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "active", label: "Active", count: counts?.active },
            { key: "unassigned", label: "No room", count: counts?.unassigned },
            { key: "left", label: "Left", count: counts?.left },
            { key: "all", label: "All", count: counts?.total },
          ]}
        />
      </View>

      {loading && !inmates ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={inmates ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          // Long registers stay smooth: rows are a fixed height, so the list
          // never has to measure them to know where to scroll.
          removeClippedSubviews
          initialNumToRender={12}
          windowSize={9}
          ListHeaderComponent={
            debouncedSearch && resultCount > 0 ? (
              <Text style={styles.resultCount}>
                {resultCount} {resultCount === 1 ? "match" : "matches"}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              message={empty.message}
              action={
                debouncedSearch || filter !== "active" ? undefined : (
                  <Button
                    title="Add inmate"
                    icon="person-add-outline"
                    onPress={() => navigation.navigate("InmateForm")}
                  />
                )
              }
            />
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <InmateRow
                inmate={item}
                symbol={settings.currencySymbol}
                onPress={() => navigation.navigate("InmateDetail", { studentId: item.id })}
              />
            </FadeIn>
          )}
        />
      )}

      <Fab label="Add" onPress={() => navigation.navigate("InmateForm")} />
    </SafeAreaView>
  );
}

/**
 * One inmate.
 *
 * Name leads, identity and room follow, and money is pushed to the right edge
 * where the eye can run down a single column of amounts. Dues carry an amount
 * rather than only a colour, so the row still reads correctly in greyscale.
 */
function InmateRow({
  inmate,
  symbol,
  onPress,
}: {
  inmate: InmateWithRoom;
  symbol: string;
  onPress: () => void;
}) {
  const owes = inmate.outstanding > 0.01;
  const identity =
    [
      formatInmateId(inmate.branchCode, inmate.admissionNo),
      inmate.course && inmate.year ? `${inmate.course} · Year ${inmate.year}` : inmate.course,
    ]
      .filter(Boolean)
      .join("  ·  ") || "No course recorded";

  return (
    <Card style={styles.row} onPress={onPress}>
      <Avatar name={inmate.fullName} photoFile={inmate.photoFile} size={46} />

      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {inmate.fullName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {identity}
        </Text>
        <View style={styles.badges}>
          {inmate.roomLabel ? (
            <Badge label={`ROOM ${inmate.roomLabel}`} tone="info" />
          ) : inmate.status === "active" ? (
            <Badge label="NO ROOM" tone="warning" />
          ) : null}
          {inmate.status === "left" ? <Badge label="LEFT" tone="neutral" /> : null}
          {inmate.admissionType === "stay" ? <Badge label="STAY" tone="neutral" /> : null}
        </View>
      </View>

      <View style={styles.rowTail}>
        {owes ? (
          <>
            <Text style={styles.dueAmount} numberOfLines={1}>
              {formatMoney(inmate.outstanding, symbol)}
            </Text>
            <Text style={styles.dueLabel}>due</Text>
          </>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
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
  headerIcon: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.subtle,
  },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.support, color: colors.textMuted, marginTop: 2 },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 110 },
  resultCount: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 4 },
  rowBody: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  rowTail: { alignItems: "flex-end", minWidth: 24 },
  dueAmount: { ...type.metricSmall, color: colors.danger },
  dueLabel: { ...type.caption, color: colors.textFaint },
});
