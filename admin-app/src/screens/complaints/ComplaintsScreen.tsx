import React, { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState, Loading } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import { colors, font, fontSize, radius, spacing, Tone } from "@/constants/theme";
import { FadeIn, SkeletonList } from "@/components/Motion";
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
import { ComplaintStatus } from "@/types";
import { formatDate, relativeDays } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Complaints">;

const STATUS_TONE: Record<ComplaintStatus, Tone> = {
  open: "danger",
  in_progress: "warning",
  resolved: "success",
};

/** The next sensible state, so one tap moves a complaint along. */
const NEXT: Record<ComplaintStatus, ComplaintStatus> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "open",
};

export default function ComplaintsScreen({ navigation }: Props) {
  const { invalidate } = useApp();
  const [filter, setFilter] = useState<ComplaintFilter>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const { data: counts } = useAsyncData(() => complaintCounts(), []);
  const { data: complaints, loading, reload } = useAsyncData(
    () => listComplaints(filter, debounced),
    [filter, debounced]
  );

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
            { key: "in_progress", label: "In Progress", count: counts?.in_progress },
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
          ListEmptyComponent={
            <EmptyState
              icon="construct-outline"
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
            <Card style={styles.card}>
              <Pressable
                onPress={() => navigation.navigate("ComplaintForm", { complaintId: item.id })}
              >
                <View style={styles.head}>
                  <View style={styles.icon}>
                    <Ionicons
                      name={CATEGORY_ICONS[item.category] as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[
                        item.roomLabel ? `Room ${item.roomLabel}` : null,
                        CATEGORY_LABELS[item.category],
                        item.raisedOn ? relativeDays(item.raisedOn) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Badge
                    label={STATUS_LABELS[item.status].toUpperCase()}
                    tone={STATUS_TONE[item.status]}
                  />
                </View>

                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {item.status === "resolved" && item.resolvedAt ? (
                  <Text style={styles.resolved}>
                    Resolved {formatDate(item.raisedOn)}
                    {item.resolution ? ` · ${item.resolution}` : ""}
                  </Text>
                ) : null}
              </Pressable>

              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => advance(item.id, item.status)}>
                  <Ionicons
                    name={item.status === "resolved" ? "refresh-outline" : "arrow-forward-circle-outline"}
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.actionText}>
                    {item.status === "open"
                      ? "Start work"
                      : item.status === "in_progress"
                        ? "Mark resolved"
                        : "Reopen"}
                  </Text>
                </Pressable>

                <Pressable style={styles.action} onPress={() => onDelete(item.id, item.title)}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </Card>
            </FadeIn>
          )}
        />
      )}

      <Fab label="Raise" onPress={() => navigation.navigate("ComplaintForm")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 110 },
  card: { padding: spacing.md },
  head: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.md, fontFamily: font.bold, color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  resolved: { fontSize: fontSize.xs, color: colors.success, marginTop: spacing.sm, fontFamily: font.semibold },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionText: { fontSize: fontSize.sm, fontFamily: font.bold, color: colors.primary },
});
