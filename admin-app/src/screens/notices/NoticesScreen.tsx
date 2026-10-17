import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/web/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import { HIT_TARGET, Tone, colors, radius, spacing, toneColor, type } from "@/constants/theme";
import { FadeIn, PressableScale, SkeletonList } from "@/components/Motion";
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
        <SkeletonList />
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
                  : "Post a notice here, then send it to every inmate on WhatsApp in one go."
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
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
            <Card style={item.pinned ? [styles.card, styles.cardPinned] : styles.card}>
              <PressableScale
                scaleTo={0.99}
                onPress={() => navigation.navigate("NoticeForm", { noticeId: item.id })}
              >
                <View style={styles.head}>
                  {/* Tinted by category, so urgent reads differently from general at a glance. */}
                  <View
                    style={[styles.icon, { backgroundColor: toneColor[CATEGORY_TONE[item.category]].bg }]}
                  >
                    <Ionicons
                      name={CATEGORY_ICON[item.category]}
                      size={18}
                      color={toneColor[CATEGORY_TONE[item.category]].fg}
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
              </PressableScale>

              <View style={styles.actions}>
                <PressableScale
                  scaleTo={0.96}
                  style={styles.sendAction}
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
                </PressableScale>

                <PressableScale
                  scaleTo={0.9}
                  style={styles.iconAction}
                  accessibilityRole="button"
                  accessibilityLabel={item.pinned ? "Unpin notice" : "Pin notice"}
                  onPress={async () => {
                    await togglePinned(item.id, !item.pinned);
                    reload();
                  }}
                >
                  <Ionicons
                    name={item.pinned ? "pin" : "pin-outline"}
                    size={17}
                    color={item.pinned ? colors.warning : colors.textMuted}
                  />
                </PressableScale>

                <PressableScale
                  scaleTo={0.9}
                  haptic={false}
                  style={styles.iconAction}
                  accessibilityRole="button"
                  accessibilityLabel="Delete notice"
                  onPress={() => onDelete(item.id, item.title)}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </PressableScale>
              </View>
            </Card>
            </FadeIn>
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
  /** Pinned notices carry a left rule so they read as held above the rest. */
  cardPinned: { borderLeftWidth: 3, borderLeftColor: colors.warning },
  head: { flexDirection: "row", gap: spacing.sm + 4, alignItems: "flex-start" },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  date: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  body: { ...type.support, color: colors.textMuted, marginTop: spacing.sm },
  sent: {
    ...type.caption,
    fontFamily: type.bodyStrong.fontFamily,
    color: colors.success,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sendAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
    minHeight: HIT_TARGET - 8,
  },
  iconAction: {
    width: HIT_TARGET - 6,
    height: HIT_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { ...type.bodyStrong },
});
