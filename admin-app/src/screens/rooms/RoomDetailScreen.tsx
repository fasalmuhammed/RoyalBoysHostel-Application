import React from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, DetailRow, Divider, EmptyState, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { deleteRoom, getRoom } from "@/services/rooms";
import { assignRoom, listInmatesInRoom } from "@/services/inmates";
import { formatMoney } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";
import { roomLabelOf } from "@/store/views";

type Props = NativeStackScreenProps<RootStackParamList, "RoomDetail">;

export default function RoomDetailScreen({ navigation, route }: Props) {
  const { roomId } = route.params;
  const { settings, invalidate } = useApp();

  const { data, loading, reload } = useAsyncData(async () => {
    const [room, occupants] = await Promise.all([getRoom(roomId), listInmatesInRoom(roomId)]);
    return { room, occupants };
  }, [roomId]);

  if (loading && !data) return <Loading />;

  const room = data?.room;
  if (!room) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState icon="home-outline" title="Room not found" />
      </SafeAreaView>
    );
  }

  const occupants = data?.occupants ?? [];
  const amenities = room.amenities.split(",").map((item) => item.trim()).filter(Boolean);

  /** Sharing description, the way the mockup labels a room. */
  const sharing =
    room.capacity === 1
      ? "Single"
      : room.capacity === 2
        ? "Double Sharing"
        : `${room.capacity} Sharing`;

  const call = (number: string) => {
    if (!number.trim()) return;
    Linking.openURL(`tel:${number.replace(/\s/g, "")}`).catch(() => {
      Alert.alert("Could not place the call");
    });
  };
  const label = roomLabelOf(room) ?? "";

  const onVacate = (studentId: string, name: string) => {
    Alert.alert("Move out", `Free up ${name}'s bed in room ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move out",
        style: "destructive",
        onPress: async () => {
          await assignRoom(studentId, null);
          invalidate();
          reload();
        },
      },
    ]);
  };

  const onDeleteRoom = () => {
    Alert.alert(
      "Delete this room?",
      occupants.length > 0
        ? `${occupants.length} inmate(s) live here. They will not be deleted — they will simply have no room assigned.`
        : "This room will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteRoom(roomId);
            invalidate();
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.roomTitle}>Room {label}</Text>
              <Text style={styles.roomSubtitle}>
                {sharing} · {room.floor || "Floor not set"}
              </Text>
            </View>
            <Badge
              label={room.vacant > 0 ? `${room.vacant} FREE` : "FULL"}
              tone={room.vacant > 0 ? "success" : "neutral"}
            />
          </View>

          {/* One place per bed: the face of whoever has it, or an empty bed to fill. */}
          <View style={styles.bedRow}>
            {Array.from({ length: Math.max(room.capacity, occupants.length) }).map((_, index) => {
              const inmate = occupants[index];
              return inmate ? (
                <Pressable
                  key={inmate.id}
                  style={styles.bedSlot}
                  onPress={() => navigation.navigate("InmateDetail", { studentId: inmate.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${inmate.fullName}, open`}
                >
                  <View style={styles.bedFace}>
                    <Avatar name={inmate.fullName} photoFile={inmate.photoFile} size={50} />
                  </View>
                  <Text style={styles.bedName} numberOfLines={1}>
                    {inmate.fullName.split(" ")[0]}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  key={`free-${index}`}
                  style={styles.bedSlot}
                  onPress={() => navigation.navigate("InmateForm", { presetRoomId: roomId })}
                  accessibilityRole="button"
                  accessibilityLabel="Free bed, add an inmate"
                >
                  <View style={styles.bedFree}>
                    <Ionicons name="bed-outline" size={20} color={colors.textFaint} />
                  </View>
                  <Text style={[styles.bedName, { color: colors.textFaint }]}>Free</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SectionTitle title="Charges" />
        <Card>
          <DetailRow
            label="Monthly rent per bed"
            value={formatMoney(room.rent, settings.currencySymbol)}
          />
          <Divider />
          <DetailRow
            label="Security deposit"
            value={room.deposit ? formatMoney(room.deposit, settings.currencySymbol) : "—"}
          />
          <Divider />
          {amenities.length > 0 ? (
            <View style={styles.amenityBlock}>
              <Text style={styles.amenityLabel}>Amenities</Text>
              <View style={styles.amenityRow}>
                {amenities.map((item) => (
                  <View key={item} style={styles.amenityChip}>
                    <Text style={styles.amenityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <DetailRow label="Amenities" value={null} />
          )}
          {room.notes ? (
            <>
              <Divider />
              <DetailRow label="Notes" value={room.notes} />
            </>
          ) : null}
        </Card>

        <SectionTitle title={`Occupants (${occupants.length}/${room.capacity})`} />

        {room.vacant > 0 ? (
          <View style={styles.addRow}>
            <Button
              title="Add existing"
              variant="secondary"
              compact
              icon="person-add-outline"
              onPress={() => navigation.navigate("AssignInmates", { roomId })}
              style={{ flex: 1 }}
            />
            <Button
              title="New inmate"
              compact
              icon="add"
              onPress={() => navigation.navigate("InmateForm", { presetRoomId: roomId })}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}

        {occupants.length === 0 ? (
          <Card>
            <Text style={styles.empty}>Nobody is staying in this room yet.</Text>
          </Card>
        ) : (
          occupants.map((inmate) => (
            <Card key={inmate.id} style={styles.occupantRow}>
              <Pressable
                style={styles.occupantMain}
                onPress={() => navigation.navigate("InmateDetail", { studentId: inmate.id })}
              >
                <Avatar name={inmate.fullName} photoFile={inmate.photoFile} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.occupantName} numberOfLines={1}>
                    {inmate.fullName}
                  </Text>
                  <Text style={styles.occupantMeta} numberOfLines={1}>
                    {[inmate.course, inmate.phone].filter(Boolean).join(" · ") || "No details"}
                  </Text>
                </View>
              </Pressable>
              {inmate.phone ? (
                <Pressable onPress={() => call(inmate.phone)} hitSlop={10} style={styles.callButton}>
                  <Ionicons name="call" size={17} color={colors.success} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => onVacate(inmate.id, inmate.fullName)}
                hitSlop={10}
                style={styles.vacateButton}
              >
                <Ionicons name="exit-outline" size={18} color={colors.danger} />
              </Pressable>
            </Card>
          ))
        )}

        <SectionTitle title="Manage" />
        <Button
          title="Edit room"
          variant="secondary"
          icon="create-outline"
          onPress={() => navigation.navigate("RoomForm", { roomId })}
        />
        <Button
          title="Delete room"
          variant="danger"
          icon="trash-outline"
          onPress={onDeleteRoom}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  roomTitle: { ...type.title, color: colors.text },
  roomSubtitle: { ...type.support, color: colors.textMuted, marginTop: 2 },
  bedRow: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.md, flexWrap: "wrap" },
  bedSlot: { width: 58, alignItems: "center", gap: 4 },
  // A ring in the brand colour marks a taken bed.
  bedFace: { padding: 2, borderRadius: 29, borderWidth: 2, borderColor: colors.primary },
  bedFree: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
  },
  bedName: { ...type.caption, color: colors.text, maxWidth: 58 },
  addRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  empty: { ...type.support, color: colors.textMuted, textAlign: "center" },
  occupantRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  occupantMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  occupantName: { ...type.bodyStrong, color: colors.text },
  occupantMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  amenityBlock: { paddingVertical: spacing.sm },
  amenityLabel: { ...type.support, color: colors.textMuted, marginBottom: spacing.sm },
  amenityRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  amenityChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  amenityText: { ...type.label, color: colors.primary },
  callButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: HIT_TARGET / 2,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  vacateButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: HIT_TARGET / 2,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
});
