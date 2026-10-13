import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState } from "@/components/Base";
import { Fab, SearchBar, SegmentedTabs } from "@/components/Controls";
import PopoverMenu, { usePopoverMenu } from "@/components/PopoverMenu";
import Button from "@/components/Button";
import { colors, radius, spacing, type } from "@/constants/theme";
import { AnimatedBar, FadeIn, SkeletonList, useCountUp } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import HostelSwitch from "@/components/HostelSwitch";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { listRooms, occupancyTotals } from "@/services/rooms";
import type { RoomWithOccupancy } from "@/types";
import { formatMoney } from "@/utils/format";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";
import { roomLabelOf } from "@/store/views";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Rooms">,
  NativeStackScreenProps<RootStackParamList>
>;

type Fill = "all" | "vacant" | "partial";

/** Beyond this many beds the pips stop being scannable and become a count. */
const MAX_PIPS = 10;

export default function RoomsScreen({ navigation }: Props) {
  const { settings } = useApp();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const { data: totals } = useAsyncData(() => occupancyTotals(), []);
  const { data: rooms, loading } = useAsyncData(() => listRooms(debounced), [debounced]);

  /**
   * Two filters that work together.
   *  - Room size, in a drop-down: every size, or single up to 7 sharing.
   *  - How full, as buttons: all, vacant (nobody in the room yet) or partly
   *    vacant (someone lives there and a bed is still free).
   */
  const [size, setSize] = useState(0);
  const [fill, setFill] = useState<Fill>("all");
  const sizeMenu = usePopoverMenu();

  const all = rooms ?? [];
  const sizeLabel = (beds: number) => (beds === 1 ? "Single room" : `${beds} sharing`);
  // Single to 7 sharing always; a larger room, if the hostel has one, is added.
  const sizes = [...new Set([1, 2, 3, 4, 5, 6, 7, ...all.map((room) => room.capacity)])].sort((x, y) => x - y);
  const ofSize = size === 0 ? all : all.filter((room) => room.capacity === size);
  const matches = (room: RoomWithOccupancy, how: Fill) =>
    how === "all" ? true : how === "vacant" ? room.occupied === 0 : room.occupied > 0 && room.vacant > 0;
  const fillOptions: { key: Fill; label: string; count: number }[] = [
    { key: "all", label: "All", count: ofSize.length },
    { key: "vacant", label: "Vacant", count: ofSize.filter((room) => matches(room, "vacant")).length },
    { key: "partial", label: "Partly vacant", count: ofSize.filter((room) => matches(room, "partial")).length },
  ];
  const filtered = size !== 0 || fill !== "all";
  const shown = ofSize
    .filter((room) => matches(room, fill))
    // Most free beds first, so the place for the next inmate is at the top;
    // full rooms sink to the bottom. Ties keep the room-number order.
    .map((room, index) => ({ room, index }))
    .sort((x, y) => y.room.vacant - x.room.vacant || x.index - y.index)
    .map((entry) => entry.room);

  const occupied = useCountUp(totals?.occupied ?? 0);
  const beds = totals?.beds ?? 0;
  const fraction = beds > 0 ? (totals?.occupied ?? 0) / beds : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rooms</Text>
          <Text style={styles.subtitle}>
            {totals ? `${totals.rooms} ${totals.rooms === 1 ? "room" : "rooms"}` : " "}
          </Text>
        </View>
        <HostelSwitch />
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryHead}>
          <Text style={styles.summaryLabel}>BEDS</Text>
          <Text style={styles.summaryPercent}>{Math.round(fraction * 100)}% full</Text>
        </View>
        <View style={styles.summaryFigures}>
          <Text style={styles.summaryValue}>{occupied}</Text>
          <Text style={styles.summaryOf}>of {beds} occupied</Text>
        </View>
        <AnimatedBar fraction={fraction} color={colors.primary} height={7} />
        <Text style={styles.summaryFoot}>
          {totals?.vacant ?? 0} {totals?.vacant === 1 ? "bed" : "beds"} free to allocate
        </Text>
      </Card>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search room number" />
        <View style={styles.filters}>
          <Pressable
            ref={sizeMenu.anchorRef}
            onPress={sizeMenu.open}
            style={[styles.sizePill, size !== 0 && styles.sizePillActive]}
            accessibilityRole="button"
            accessibilityLabel={`Room size: ${size === 0 ? "all sizes" : sizeLabel(size)}. Change`}
          >
            <Ionicons name="bed-outline" size={15} color={size !== 0 ? colors.primaryOn : colors.primary} />
            <Text style={[styles.sizePillText, size !== 0 && { color: colors.primaryOn }]} numberOfLines={1}>
              {size === 0 ? "All sizes" : sizeLabel(size)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={size !== 0 ? colors.primaryOn : colors.textMuted} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <SegmentedTabs options={fillOptions} value={fill} onChange={setFill} />
          </View>
        </View>
        <PopoverMenu
          {...sizeMenu.props}
          title="Room size"
          items={[
            { key: "0", label: "All sizes", sublabel: `${all.length} ${all.length === 1 ? "room" : "rooms"}` },
            ...sizes.map((beds) => {
              const count = all.filter((room) => room.capacity === beds).length;
              return { key: String(beds), label: sizeLabel(beds), sublabel: count === 0 ? "None" : `${count} ${count === 1 ? "room" : "rooms"}` };
            }),
          ]}
          selectedKey={String(size)}
          onSelect={(key) => setSize(Number(key))}
        />
      </View>

      {loading && !rooms ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={12}
          windowSize={9}
          ListEmptyComponent={
            <EmptyState
              icon={search ? "search-outline" : filtered ? "funnel-outline" : "home-outline"}
              title={search ? "No matching rooms" : filtered ? "No rooms like that" : "No rooms yet"}
              message={
                search
                  ? `Nothing matches "${search}".`
                  : filtered
                    ? "No room matches the size and vacancy you picked. Try All sizes or All."
                    : "Add your rooms first, then assign inmates to them."
              }
              action={
                search || filtered ? undefined : (
                  <Button
                    title="Add room"
                    icon="add-circle-outline"
                    onPress={() => navigation.navigate("RoomForm")}
                  />
                )
              }
            />
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <RoomRow
                room={item}
                symbol={settings.currencySymbol}
                onPress={() => navigation.navigate("RoomDetail", { roomId: item.id })}
              />
            </FadeIn>
          )}
        />
      )}

      <Fab label="Add room" onPress={() => navigation.navigate("RoomForm")} />
    </SafeAreaView>
  );
}

/**
 * One room, read as a picture rather than a sentence.
 *
 * The bed pips are the point: filled beds versus empty ones register before
 * any text does, so an admin looking for somewhere to put a new inmate can
 * scan the column instead of reading "2 of 4 beds taken" on every row.
 */
function RoomRow({
  room,
  symbol,
  onPress,
}: {
  room: RoomWithOccupancy;
  symbol: string;
  onPress: () => void;
}) {
  const full = room.vacant <= 0;
  const label = `Room ${roomLabelOf(room) ?? ""}`;
  const { allHostels, branches } = useApp();
  const hostel = allHostels ? branches.find((b) => b.id === room.branchId) : null;

  return (
    <Card
      style={styles.row}
      onPress={onPress}
    >
      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomName} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.roomMeta} numberOfLines={1}>
            {[
              hostel ? hostel.shortName || hostel.name : null,
              room.block.trim().length > 4 ? room.block : null,
              room.floor ? `Floor ${room.floor}` : null,
              room.rent > 0 ? `${formatMoney(room.rent, symbol)}/mo` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No rent set"}
          </Text>
        </View>
        <Badge label={full ? "FULL" : `${room.vacant} FREE`} tone={full ? "neutral" : "success"} />
      </View>

      <View style={styles.bedsRow}>
        <BedPips occupied={room.occupied} capacity={room.capacity} />
        <Text style={styles.bedsCount}>
          {room.occupied}/{room.capacity}
        </Text>
      </View>
    </Card>
  );
}

function BedPips({ occupied, capacity }: { occupied: number; capacity: number }) {
  const shown = Math.min(capacity, MAX_PIPS);
  const overflow = capacity - shown;

  return (
    <View style={styles.pips}>
      {Array.from({ length: shown }).map((_, index) => {
        const taken = index < occupied;
        return (
          <View
            key={index}
            style={[styles.pip, taken ? styles.pipTaken : styles.pipFree]}
            // Pips are decorative; the count beside them carries the meaning.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        );
      })}
      {overflow > 0 ? <Text style={styles.pipOverflow}>+{overflow}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sizePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  sizePillActive: { backgroundColor: colors.primary },
  sizePillText: { ...type.bodyStrong, fontSize: type.support.fontSize, color: colors.primary },
  hostelSwitch: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.support, color: colors.textMuted, marginTop: 2 },

  summary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: 0,
    gap: spacing.sm,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { ...type.label, color: colors.textFaint },
  summaryPercent: { ...type.metricSmall, color: colors.primary },
  summaryFigures: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs + 2 },
  summaryValue: { ...type.display, color: colors.text },
  summaryOf: { ...type.support, color: colors.textMuted },
  summaryFoot: { ...type.caption, color: colors.textMuted },

  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 190 },

  row: { gap: spacing.sm + 2 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  roomName: { ...type.bodyStrong, color: colors.text },
  roomMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  bedsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bedsCount: { ...type.caption, color: colors.textMuted },
  pips: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1, flexWrap: "wrap" },
  pip: { width: 18, height: 8, borderRadius: radius.sm / 2 },
  pipTaken: { backgroundColor: colors.primary },
  pipFree: { backgroundColor: colors.border },
  pipOverflow: { ...type.caption, color: colors.textFaint, marginLeft: 2 },
});
