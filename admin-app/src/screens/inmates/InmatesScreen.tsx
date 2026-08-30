import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState, Loading } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { colors, font, fontSize, spacing } from "@/constants/theme";
import { FadeIn, SkeletonList } from "@/components/Motion";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { listInmates, InmateFilter, inmateCounts } from "@/services/inmates";
import { formatInmateId } from "@/services/branches";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Inmates">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function InmatesScreen({ navigation, route }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InmateFilter>(route.params?.filter ?? "active");
  const debouncedSearch = useDebounced(search);

  const { data: counts } = useAsyncData(() => inmateCounts(), []);
  const { data: inmates, loading } = useAsyncData(
    () => listInmates(debouncedSearch, filter),
    [debouncedSearch, filter]
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Inmates</Text>
        <Text style={styles.subtitle}>
          {counts ? `${counts.active} active · ${counts.total} total` : " "}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("Search")}
          style={styles.headerIcon}
          accessibilityLabel="Search everything"
        >
          <Ionicons name="search" size={19} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.controls}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, admission no or phone"
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
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={search ? "No matches" : "No inmates yet"}
              message={
                search
                  ? `Nothing matches "${search}".`
                  : "Add your first inmate and take their photo right from the form."
              }
              action={
                search ? undefined : (
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
            <Card
              style={styles.row}
              onPress={() => navigation.navigate("InmateDetail", { studentId: item.id })}
            >
              <Avatar name={item.fullName} photoFile={item.photoFile} size={48} />

              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.fullName}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[formatInmateId(item.branchCode, item.admissionNo), item.course && item.year ? `${item.course} · Year ${item.year}` : item.course]
                    .filter(Boolean)
                    .join("  ·  ") || "No course recorded"}
                </Text>
                <View style={styles.badges}>
                  {item.roomLabel ? (
                    <Badge label={`Room ${item.roomLabel}`} tone="info" />
                  ) : item.status === "active" ? (
                    <Badge label="No room" tone="warning" />
                  ) : null}
                  {item.status === "left" ? <Badge label="Left" tone="neutral" /> : null}
                </View>
              </View>

              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Card>
            </FadeIn>
          )}
        />
      )}

      <Fab label="Add" onPress={() => navigation.navigate("InmateForm")} />
    </SafeAreaView>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xxl, fontFamily: font.extrabold, color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 110 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { fontSize: fontSize.md, fontFamily: font.bold, color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  badges: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs + 2 },
});
