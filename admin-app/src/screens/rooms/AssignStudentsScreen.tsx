import React, { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Callout, CalloutText, EmptyState, Loading } from "@/components/Base";
import { SearchBar } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData, useDebounced } from "@/utils/hooks";
import { getRoom } from "@/services/rooms";
import { assignRoom, listStudents, RoomFullError, setStudentRent } from "@/services/students";
import { formatMoney } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AssignStudents">;

/**
 * Moves students who are already on the register into a room.
 *
 * Distinct from "Add student", which creates a new record. Anyone already in
 * another room can be moved here directly -- that is the common case when beds
 * are shuffled mid-term, and making the admin vacate them first would be busy
 * work.
 */
export default function AssignStudentsScreen({ navigation, route }: Props) {
  const { roomId } = route.params;
  const { settings, invalidate } = useApp();

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounced = useDebounced(search);

  const { data: room, reload: reloadRoom } = useAsyncData(() => getRoom(roomId), [roomId]);
  const { data: students, loading, reload } = useAsyncData(
    () => listStudents(debounced, "active"),
    [debounced]
  );

  const label = room ? `${room.block ? `${room.block}-` : ""}${room.roomNumber}` : "";

  /**
   * Rent follows the student, not the bed, so a move never rewrites it
   * silently. When the new room is priced differently the admin is asked --
   * they are the only one who knows whether the rate was renegotiated.
   */
  const offerRentUpdate = (studentId: string, name: string, currentRent: number) => {
    if (!room || room.rent <= 0 || Math.abs(room.rent - currentRent) < 0.01) return;

    Alert.alert(
      "Update rent?",
      `${name} pays ${formatMoney(currentRent, settings.currencySymbol)}, but room ${label} is ` +
        `${formatMoney(room.rent, settings.currencySymbol)}. Change their rent to match?`,
      [
        { text: "Keep current rent", style: "cancel" },
        {
          text: "Update rent",
          onPress: async () => {
            await setStudentRent(studentId, room.rent);
            invalidate();
            reload();
          },
        },
      ]
    );
  };

  const onAssign = async (studentId: string, name: string, currentRent: number) => {
    setBusyId(studentId);
    try {
      await assignRoom(studentId, roomId);
      invalidate();
      await Promise.all([reload(), reloadRoom()]);
      offerRentUpdate(studentId, name, currentRent);
    } catch (e) {
      Alert.alert(
        "Could not move that student",
        e instanceof RoomFullError ? e.message : "Please try again."
      );
    } finally {
      setBusyId(null);
    }
  };

  const vacant = room?.vacant ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Move into room {label}</Text>
        <Text style={styles.subtitle}>
          {room ? `${room.occupied} of ${room.capacity} beds taken` : " "}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, ID or phone"
        />
      </View>

      {vacant <= 0 ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Callout tone="warning" icon="alert-circle-outline">
            <CalloutText>
              This room is full. Move someone out from the room screen before adding another
              student.
            </CalloutText>
          </Callout>
        </View>
      ) : null}

      {loading && !students ? (
        <Loading />
      ) : (
        <FlatList
          data={students ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={search ? "No matching students" : "No students yet"}
              message={
                search
                  ? `Nothing matches "${search}".`
                  : "Add a student first, then you can move them into a room."
              }
            />
          }
          renderItem={({ item }) => {
            const alreadyHere = item.roomId === roomId;
            const busy = busyId === item.id;

            return (
              <View style={styles.row}>
                <Avatar name={item.fullName} photoFile={item.photoFile} size={44} />

                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.admissionNo ? `ID ${item.admissionNo}` : "No ID"}
                    {item.monthlyRent > 0
                      ? ` · ${formatMoney(item.monthlyRent, settings.currencySymbol)}`
                      : ""}
                  </Text>
                  <View style={{ marginTop: spacing.xs }}>
                    {alreadyHere ? (
                      <Badge label="IN THIS ROOM" tone="success" />
                    ) : item.roomLabel ? (
                      <Badge label={`NOW IN ${item.roomLabel}`} tone="warning" />
                    ) : (
                      <Badge label="NO ROOM" tone="neutral" />
                    )}
                  </View>
                </View>

                {alreadyHere ? (
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                ) : (
                  <Pressable
                    disabled={busy || vacant <= 0}
                    onPress={() => onAssign(item.id, item.fullName, item.monthlyRent)}
                    style={({ pressed }) => [
                      styles.addButton,
                      pressed && { opacity: 0.8 },
                      (busy || vacant <= 0) && { opacity: 0.4 },
                    ]}
                  >
                    <Ionicons
                      name={item.roomLabel ? "swap-horizontal" : "add"}
                      size={16}
                      color={colors.primaryOn}
                    />
                    <Text style={styles.addText}>{item.roomLabel ? "Move" : "Add"}</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <Pressable style={styles.doneBar} onPress={() => navigation.goBack()}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 100 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  name: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  addText: { color: colors.primaryOn, fontWeight: "700", fontSize: fontSize.sm },
  doneBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: "center",
  },
  doneText: { color: colors.primaryOn, fontWeight: "700", fontSize: fontSize.md },
});
