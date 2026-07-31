import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { RectorStackParamList, RectorTabParamList } from "@/navigation/types";
import { subscribeAllApplications } from "@/services/applications";
import { removeStudentFromRoom, subscribeRooms } from "@/services/rooms";
import { markStudentLeft, reinstateStudent, subscribeStudents } from "@/services/users";
import { HostelApplication, Room, UserProfile } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import EmptyState from "@/components/EmptyState";
import { colors, fontSize, spacing } from "@/constants/theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<RectorTabParamList, "Students">,
  NativeStackScreenProps<RectorStackParamList>
>;

const applicationTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

export default function StudentsScreen({ navigation }: Props) {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [applications, setApplications] = useState<HostelApplication[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => subscribeStudents(setStudents), []);
  useEffect(() => subscribeAllApplications(setApplications), []);
  useEffect(() => subscribeRooms(setRooms), []);

  const filteredStudents = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const list = lower ? students.filter((s) => s.name.toLowerCase().includes(lower)) : students;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [students, search]);

  const latestApplicationFor = (studentId: string) =>
    applications.filter((a) => a.studentId === studentId).sort((a, b) => b.createdAt - a.createdAt)[0];

  const roomFor = (studentId: string) => rooms.find((r) => r.occupantIds.includes(studentId));

  const onMarkLeft = (student: UserProfile) => {
    const room = roomFor(student.uid);
    Alert.alert("Mark as Left", `Mark ${student.name} as having left the hostel?${room ? " Their bed will be freed up." : ""}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "destructive",
        onPress: async () => {
          if (room) await removeStudentFromRoom(room.id, student.uid);
          await markStudentLeft(student.uid);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <ScreenHeader title="Students" subtitle={`${students.length} registered student${students.length === 1 ? "" : "s"}`} />
            <Input label="Search by name" placeholder="Type a student's name…" value={search} onChangeText={setSearch} />
          </View>
        }
        ListEmptyComponent={<EmptyState message="No students match your search." />}
        renderItem={({ item }) => {
          const application = latestApplicationFor(item.uid);
          const room = roomFor(item.uid);
          const hasLeft = item.hostelStatus === "left";

          return (
            <Card>
              <Pressable onPress={() => navigation.navigate("StudentDetail", { studentId: item.uid })}>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                  </View>
                  <Badge label={hasLeft ? "LEFT" : "ACTIVE"} tone={hasLeft ? "neutral" : "success"} />
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>

                <View style={styles.badgeRow}>
                  {application ? (
                    <Badge label={`Application: ${application.status.toUpperCase()}`} tone={applicationTone[application.status]} />
                  ) : (
                    <Badge label="No Application" tone="neutral" />
                  )}
                  {room && <Badge label={`Room ${room.block}-${room.roomNumber}`} tone="neutral" />}
                </View>
              </Pressable>

              {hasLeft ? (
                <Button title="Reinstate" variant="secondary" style={styles.actionButton} onPress={() => reinstateStudent(item.uid)} />
              ) : (
                <Button title="Mark as Left" variant="danger" style={styles.actionButton} onPress={() => onMarkLeft(item)} />
              )}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  email: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  actionButton: { marginTop: spacing.md },
});
