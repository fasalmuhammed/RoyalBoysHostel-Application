import React, { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { FadeIn, PressableScale, SkeletonList } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  ComplaintFilter,
  complaintCounts,
  deleteComplaint,
  listComplaints,
  setStatus,
  STATUS_LABELS,
} from "@/services/complaints";
import type { ComplaintStatus, ComplaintWithContext } from "@/types";
import { Tone } from "@/constants/theme";
import { formatDateTime, relativeDays } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Complaints">;

const STATUS_TONE: Record<ComplaintStatus, Tone> = {
  open: "danger",
  in_progress: "warning",
  resolved: "success",
};

/** The stripe down the edge of each card, so status reads before any text does. */
const STATUS_COLOR: Record<ComplaintStatus, string> = {
  open: colors.danger,
  in_progress: colors.warning,
  resolved: colors.success,
};

/** The next sensible state, so one tap moves a complaint along. */
const NEXT: Record<ComplaintStatus, ComplaintStatus> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "open",
};

const ADVANCE_LABEL: Record<ComplaintStatus, string> = {
  open: "Start work",
  in_progress: "Mark resolved",
  resolved: "Reopen",
};

export default function ComplaintsScreen({ navigation }: Props) {
  const { invalidate } = useApp();
  const [filter, setFilter] = useState<ComplaintFilter>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const { data: counts } = useAsyncData(() => complaintCounts(), []);
  const {
    data: complaints,
    loading,
    reload,
  } = useAsyncData(() => listComplaints(filter, debounced), [filter, debounced]);

  const advance = async (id: string, current: ComplaintStatus) => {
    await setStatus(id, NEXT[current]);
    invalidate();
    reload();
  };

  const onDelete = (id: string, title: string) => {
    Alert.alert("Delete complaint?", `"${title}" will be removed from the register.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteComplaint(id);
          invalidate();
          reload();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search complaints" />
        <SegmentedTabs<ComplaintFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: counts?.all },
            { key: "open", label: "Open", count: counts?.open },
            { key: "in_progress", label: "In progress", count: counts?.in_progress },
            { key: "resolved", label: "Resolved", count: counts?.resolved },
          ]}
        />
      </View>

      {loading && !complaints ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={complaints ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={10}
          windowSize={9}
          ListEmptyComponent={
            <EmptyState
              icon={search ? "search-outline" : "construct-outline"}
              title={search ? "No matching complaints" : "Nothing reported"}
              message={
                search
                  ? `Nothing matches "${search}".`
                  : "Log a complaint here when something needs fixing, and track it through to resolved."
              }
              action={
                search ? undefined : (
                  <Button
                    title="Raise complaint"
                    icon="add-circle-outline"
                    onPress={() => navigation.navigate("ComplaintForm")}
                  />
                )
              }
            />
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <ComplaintCard
                complaint={item}
                onOpen={() => navigation.navigate("ComplaintForm", { complaintId: item.id })}
                onAdvance={() => advance(item.id, item.status)}
                onDelete={() => onDelete(item.id, item.title)}
              />
            </FadeIn>
          )}
        />
      )}

      <Fab label="Raise" onPress={() => navigation.navigate("ComplaintForm")} />
    </SafeAreaView>
  );
}

function ComplaintCard({
  complaint,
  onOpen,
  onAdvance,
  onDelete,
}: {
  complaint: ComplaintWithContext;
  onOpen: () => void;
  onAdvance: () => void;
  onDelete: () => void;
}) {
  return (
    <Card style={styles.card}>
      {/* Status stripe: colour plus the badge below, never colour alone. */}
      <View style={[styles.stripe, { backgroundColor: STATUS_COLOR[complaint.status] }]} />

      <View style={styles.cardInner}>
        <PressableScale onPress={onOpen} scaleTo={0.99} style={styles.cardBody}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Ionicons
                name={CATEGORY_ICONS[complaint.category] as keyof typeof Ionicons.glyphMap}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>
                {complaint.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[
                  complaint.roomLabel ? `Room ${complaint.roomLabel}` : null,
                  CATEGORY_LABELS[complaint.category],
                  complaint.raisedOn ? relativeDays(complaint.raisedOn) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Badge
              label={STATUS_LABELS[complaint.status].toUpperCase()}
              tone={STATUS_TONE[complaint.status]}
            />
          </View>

          {complaint.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {complaint.description}
            </Text>
          ) : null}

          {complaint.status === "resolved" && complaint.resolvedAt ? (
            <Text style={styles.resolved} numberOfLines={2}>
              Resolved {formatDateTime(complaint.resolvedAt)}
              {complaint.resolution ? ` · ${complaint.resolution}` : ""}
            </Text>
          ) : null}
        </PressableScale>

        <View style={styles.actions}>
          <PressableScale onPress={onAdvance} scaleTo={0.96} style={styles.advance}>
            <Ionicons
              name={
                complaint.status === "resolved" ? "refresh-outline" : "arrow-forward-circle-outline"
              }
              size={16}
              color={colors.primary}
            />
            <Text style={styles.actionText}>{ADVANCE_LABEL[complaint.status]}</Text>
          </PressableScale>

          <PressableScale
            onPress={onDelete}
            scaleTo={0.9}
            haptic={false}
            style={styles.deleteAction}
            accessibilityRole="button"
            accessibilityLabel="Delete complaint"
          >
            <Ionicons name="trash-outline" size={17} color={colors.danger} />
          </PressableScale>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 110 },

  // Padding moves inside so the stripe can run the full height of the card.
  card: { padding: 0, overflow: "hidden", flexDirection: "row" },
  stripe: { width: 4 },
  cardInner: { flex: 1, padding: spacing.md },
  cardBody: { gap: spacing.xs },

  head: { flexDirection: "row", gap: spacing.sm + 4, alignItems: "flex-start" },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  description: { ...type.support, color: colors.textMuted, marginTop: spacing.xs },
  resolved: {
    ...type.caption,
    fontFamily: type.bodyStrong.fontFamily,
    color: colors.success,
    marginTop: spacing.xs,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  advance: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: HIT_TARGET - 8,
    paddingRight: spacing.md,
  },
  actionText: { ...type.bodyStrong, color: colors.primary },
  deleteAction: {
    width: HIT_TARGET - 6,
    height: HIT_TARGET - 8,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
