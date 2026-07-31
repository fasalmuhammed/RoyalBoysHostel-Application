import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { subscribeAllApplications, setApplicationStatus } from "@/services/applications";
import { addRoom, assignStudentToRoom, subscribeRooms } from "@/services/rooms";
import { HostelApplication, Room } from "@/types";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { colors, fontSize, radius, spacing } from "@/constants/theme";

export default function RoomsScreen() {
  const [block, setBlock] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [loading, setLoading] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [applications, setApplications] = useState<HostelApplication[]>([]);

  useEffect(() => subscribeRooms(setRooms), []);
  useEffect(() => subscribeAllApplications(setApplications), []);

  // Room assignment needs a real account uid, so only applications already linked
  // to a mobile account (studentId set) are assignable. Web-form applications start
  // unclaimed (studentId: null) until the applicant registers with a matching email.
  const unassigned = useMemo(
    () =>
      applications.filter(
        (a): a is HostelApplication & { studentId: string } =>
          a.status === "approved" && !a.roomId && !!a.studentId
      ),
    [applications]
  );
  const awaitingAccount = useMemo(
    () => applications.filter((a) => a.status === "approved" && !a.roomId && !a.studentId),
    [applications]
  );

  const onAddRoom = async () => {
    const capacityNumber = Number(capacity);
    if (!block || !roomNumber || !capacityNumber) return;
    setLoading(true);
    try {
      await addRoom(block, roomNumber, capacityNumber);
      setBlock("");
      setRoomNumber("");
      setCapacity("");
    } finally {
      setLoading(false);
    }
  };

  const onAssign = async (application: HostelApplication & { studentId: string }, room: Room) => {
    if (room.occupantIds.length >= room.capacity) return;
    try {
      await assignStudentToRoom(room.id, application.studentId);
      await setApplicationStatus(application.id, "approved", room.id);
    } catch {
      Alert.alert("Error", "Could not assign the student to this room.");
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <ScreenHeader title="Rooms" subtitle="Manage room capacity & occupancy" />

            <Card>
              <Text style={styles.cardTitle}>Add a Room</Text>
              <Input label="Block" placeholder="e.g. A" value={block} onChangeText={setBlock} />
              <Input label="Room Number" placeholder="e.g. 101" value={roomNumber} onChangeText={setRoomNumber} />
              <Input label="Capacity" placeholder="e.g. 4" value={capacity} onChangeText={setCapacity} keyboardType="numeric" />
              <Button title="Add Room" onPress={onAddRoom} loading={loading} disabled={!block || !roomNumber || !capacity} />
            </Card>

            {unassigned.length > 0 && (
              <Card>
                <Text style={styles.cardTitle}>Unassigned Students ({unassigned.length})</Text>
                {unassigned.map((application) => (
                  <View key={application.id} style={styles.unassignedRow}>
                    <Text style={styles.studentName}>
                      {application.firstName} {application.lastName}
                    </Text>
                    <View style={styles.roomChips}>
                      {rooms.map((room) => {
                        const full = room.occupantIds.length >= room.capacity;
                        return (
                          <Pressable
                            key={room.id}
                            disabled={full}
                            onPress={() => onAssign(application, room)}
                            style={[styles.chip, full && styles.chipDisabled]}
                          >
                            <Text style={[styles.chipText, full && styles.chipTextDisabled]}>
                              {room.block}-{room.roomNumber} ({room.occupantIds.length}/{room.capacity})
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {awaitingAccount.length > 0 && (
              <Card>
                <Text style={styles.cardTitle}>Approved — Awaiting Registration ({awaitingAccount.length})</Text>
                <Text style={styles.hint}>
                  These applicants were approved but haven't created a mobile account yet. They'll appear above for
                  room assignment once they register with the same email they applied with.
                </Text>
                {awaitingAccount.map((application) => (
                  <View key={application.id} style={styles.unassignedRow}>
                    <Text style={styles.studentName}>
                      {application.firstName} {application.lastName}
                    </Text>
                    {application.applicantEmail && <Text style={styles.hint}>{application.applicantEmail}</Text>}
                  </View>
                ))}
              </Card>
            )}

            <Text style={styles.historyTitle}>All Rooms</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState message="No rooms added yet." />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.roomHeader}>
              <Text style={styles.studentName}>
                {item.block}-{item.roomNumber}
              </Text>
              <Badge
                label={`${item.occupantIds.length}/${item.capacity}`}
                tone={item.occupantIds.length >= item.capacity ? "danger" : "success"}
              />
            </View>
          </Card>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  historyTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  unassignedRow: { marginTop: spacing.sm },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  studentName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  roomChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipDisabled: { borderColor: colors.border },
  chipText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "600" },
  chipTextDisabled: { color: colors.textMuted },
  roomHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
