import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState, Loading } from "@/components/Base";
import { Fab, SearchBar, StatCard } from "@/components/Controls";
import Button from "@/components/Button";
import { colors, font, fontSize, spacing } from "@/constants/theme";
import { FadeIn, SkeletonList } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { listRooms, occupancyTotals } from "@/services/rooms";
import { formatMoney } from "@/utils/format";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Rooms">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function RoomsScreen({ navigation }: Props) {
  const { settings } = useApp();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const { data: totals } = useAsyncData(() => occupancyTotals(), []);
  const { data: rooms, loading } = useAsyncData(() => listRooms(debounced), [debounced]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Rooms</Text>
      </View>

      <View style={styles.statRow}>
        <StatCard label="Rooms" value={totals?.rooms ?? 0} icon="home-outline" tone="info" />
        <StatCard label="Occupied" value={totals?.occupied ?? 0} icon="bed-outline" tone="success" />
        <StatCard
          label="Vacant"
          value={totals?.vacant ?? 0}
          icon="checkmark-circle-outline"
          tone={totals?.vacant ? "warning" : "neutral"}
        />
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search room number" />
      </View>

      {loading && !rooms ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={rooms ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="home-outline"
              title={search ? "No matching rooms" : "No rooms yet"}
              message={
                search
                  ? `Nothing matches "${search}".`
                  : "Add your rooms first, then assign inmates to them."
              }
              action={
                search ? undefined : (
                  <Button
                    title="Add room"
                    icon="add-circle-outline"
                    onPress={() => navigation.navigate("RoomForm")}
                  />
                )
              }
            />
          }
          renderItem={({ item, index }) => {
            const full = item.vacant <= 0;
            return (
              <FadeIn index={index}>
              <Card
                style={styles.row}
                onPress={() => navigation.navigate("RoomDetail", { roomId: item.id })}
              >
                <View style={styles.roomIcon}>
                  <Ionicons
                    name="bed-outline"
                    size={20}
                    color={full ? colors.textMuted : colors.primary}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.roomName}>
                    Room {item.block ? `${item.block}-` : ""}
                    {item.roomNumber}
                  </Text>
                  <Text style={styles.roomMeta}>
                    {item.occupied} of {item.capacity} beds taken
                    {item.rent > 0 ? ` · ${formatMoney(item.rent, settings.currencySymbol)}/mo` : ""}
                  </Text>
                </View>

                <Badge
                  label={full ? "FULL" : `${item.vacant} FREE`}
                  tone={full ? "neutral" : "success"}
                />
              </Card>
              </FadeIn>
            );
          }}
        />
      )}

      <Fab label="Add room" onPress={() => navigation.navigate("RoomForm")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { fontSize: fontSize.xxl, fontFamily: font.extrabold, color: colors.text },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { padding: spacing.lg, paddingBottom: 110 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  roomIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roomName: { fontSize: fontSize.md, fontFamily: font.bold, color: colors.text },
  roomMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
