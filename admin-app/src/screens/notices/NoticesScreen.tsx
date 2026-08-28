import React, { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState, Loading } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import { colors, fontSize, radius, spacing, Tone } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import {
  CATEGORY_LABELS,
  deleteNotice,
  listNotices,
  noticeCounts,
  NoticeFilter,
  noticeToMessage,
  togglePinned,
} from "@/services/notices";
import { NoticeCategory } from "@/types";
import { formatDate, formatDateTime } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Notices">;

const CATEGORY_TONE: Record<NoticeCategory, Tone> = {
  general: "info",
  event: "success",
  maintenance: "warning",
  urgent: "danger",
};

const CATEGORY_ICON: Record<NoticeCategory, keyof typeof Ionicons.glyphMap> = {
  general: "information-circle-outline",
  event: "calendar-outline",
  maintenance: "construct-outline",
  urgent: "warning-outline",
};

export default function NoticesScreen({ navigation }: Props) {
  const { invalidate } = useApp();
  const [filter, setFilter] = useState<NoticeFilter>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const { data: counts } = useAsyncData(() => noticeCounts(), []);
  const { data: notices, loading, reload } = useAsyncData(
    () => listNotices(filter, debounced),
    [filter, debounced]
  );

  const onDelete = (id: string, title: string) => {
    Alert.alert("Delete notice?", `"${title}" will be removed from the board.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteNotice(id);
          invalidate();
          reload();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search notices" />
        <SegmentedTabs<NoticeFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: counts?.all },
            { key: "general", label: "General", count: counts?.general },
            { key: "event", label: "Events", count: counts?.event },
            { key: "maintenance", label: "Maintenance", count: counts?.maintenance },
            { key: "urgent", label: "Urgent", count: counts?.urgent },
          ]}
        />
      </View>

      {loading && !notices ? (
        <Loading />
      ) : (
        <FlatList
          data={notices ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="megaphone-outline"
              title={search ? "No matching notices" : "No notices yet"}
              message={
                search
                  ? `Nothing matches "${search}".`
                  : "Post a notice here, then send it to every student on WhatsApp in one go."
              }
              action={
                search ? undefined : (
                  <Button
                    title="Post a notice"
                    icon="add-circle-outline"
                    onPress={() => navigation.navigate("NoticeForm")}
                  />
                )
              }
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <Pressable onPress={() => navigation.navigate("NoticeForm", { noticeId: item.id })}>
                <View style={styles.head}>
                  <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons
                      name={CATEGORY_ICON[item.category]}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      {item.pinned ? (
                        <Ionicons name="pin" size={14} color={colors.warning} />
                      ) : null}
                      <Text style={styles.title} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.date}>{formatDate(item.postedOn)}</Text>
                  </View>
                  <Badge
                    label={CATEGORY_LABELS[item.category].toUpperCase()}
                    tone={CATEGORY_TONE[item.category]}
                  />
                </View>

                <Text style={styles.body} numberOfLines={3}>
                  {item.body}
                </Text>

                {item.lastSentAt ? (
                  <Text style={styles.sent}>
                    <Ionicons name="checkmark-done" size={12} color={colors.success} /> Sent{" "}
                    {formatDateTime(item.lastSentAt)}
                  </Text>
                ) : null}
              </Pressable>

              <View style={styles.actions}>
                <Pressable
                  style={styles.action}
                  onPress={() =>
                    navigation.navigate("Compose", {
                      kind: "announcement",
                      presetBody: noticeToMessage(item),
                      noticeId: item.id,
                    })
                  }
                >
                  <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
                  <Text style={[styles.actionText, { color: colors.success }]}>
                    Send on WhatsApp
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.action}
                  onPress={async () => {
                    await togglePinned(item.id, !item.pinned);
                    reload();
                  }}
                >
                  <Ionicons
                    name={item.pinned ? "pin" : "pin-outline"}
                    size={16}
                    color={colors.textMuted}
                  />
                </Pressable>

                <Pressable style={styles.action} onPress={() => onDelete(item.id, item.title)}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}

      <Fab label="Post" onPress={() => navigation.navigate("NoticeForm")} />
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
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.text, flexShrink: 1 },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  body: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  sent: { fontSize: fontSize.xs, color: colors.success, marginTop: spacing.sm, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionText: { fontSize: fontSize.sm, fontWeight: "700" },
});
