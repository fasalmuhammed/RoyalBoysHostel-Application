import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RectorStackParamList } from "@/navigation/types";
import { subscribeStudentApplications } from "@/services/applications";
import { subscribeStudentPayments } from "@/services/payments";
import { subscribeStudentGrievances } from "@/services/grievances";
import { subscribeStudentLogs } from "@/services/checkinout";
import { removeStudentFromRoom, subscribeRooms } from "@/services/rooms";
import { markStudentLeft, reinstateStudent, subscribeUserProfile } from "@/services/users";
import { CheckLog, Grievance, HostelApplication, Payment, Room, UserProfile } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { colors, fontSize, spacing } from "@/constants/theme";

type Props = NativeStackScreenProps<RectorStackParamList, "StudentDetail">;

const applicationTone: Record<string, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function StudentDetailScreen({ route }: Props) {
  const { studentId } = route.params;
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [applications, setApplications] = useState<HostelApplication[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [logs, setLogs] = useState<CheckLog[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => subscribeUserProfile(studentId, setStudent), [studentId]);
  useEffect(() => subscribeStudentApplications(studentId, setApplications), [studentId]);
  useEffect(() => subscribeStudentPayments(studentId, setPayments), [studentId]);
  useEffect(() => subscribeStudentGrievances(studentId, setGrievances), [studentId]);
  useEffect(() => subscribeStudentLogs(studentId, setLogs), [studentId]);
  useEffect(() => subscribeRooms(setRooms), []);

  if (!student) {
    return (
      <View style={styles.container}>
        <EmptyState message="Loading student record…" />
      </View>
    );
  }

  const room = rooms.find((r) => r.occupantIds.includes(studentId));
  const hasLeft = student.hostelStatus === "left";

  const onMarkLeft = () => {
    Alert.alert("Mark as Left", `Mark ${student.name} as having left the hostel?${room ? " Their bed will be freed up." : ""}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "destructive",
        onPress: async () => {
          if (room) await removeStudentFromRoom(room.id, studentId);
          await markStudentLeft(studentId);
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={student.name} subtitle={student.email} />

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Joined</Text>
          <Text style={styles.value}>{new Date(student.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Status</Text>
          <Badge label={hasLeft ? "LEFT" : "ACTIVE"} tone={hasLeft ? "neutral" : "success"} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Room</Text>
          <Text style={styles.value}>{room ? `${room.block}-${room.roomNumber}` : "Not assigned"}</Text>
        </View>
        {hasLeft ? (
          <Button title="Reinstate" variant="secondary" style={styles.actionButton} onPress={() => reinstateStudent(studentId)} />
        ) : (
          <Button title="Mark as Left" variant="danger" style={styles.actionButton} onPress={onMarkLeft} />
        )}
      </Card>

      <SectionTitle title="Hostel Applications" />
      {applications.length === 0 && <EmptyState message="No applications submitted." />}
      {applications.map((app) => (
        <Card key={app.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.value}>{new Date(app.createdAt).toLocaleDateString()}</Text>
            <Badge label={app.status.toUpperCase()} tone={applicationTone[app.status]} />
          </View>
          <Text style={styles.detail}>Father's Name: {app.fatherName}</Text>
          <Text style={styles.detail}>Address: {app.address}</Text>
          <Text style={styles.detail}>ID Proof: {app.idProof}</Text>
          <Text style={styles.detail}>Family Income: ₹{app.income}</Text>
        </Card>
      ))}

      <SectionTitle title="Payment History" />
      {payments.length === 0 && <EmptyState message="No fee payments submitted." />}
      {payments.map((payment) => (
        <Card key={payment.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.detail}>Txn ID: {payment.transactionId}</Text>
            <Badge label={payment.status.toUpperCase()} tone={payment.status === "confirmed" ? "success" : "warning"} />
          </View>
          <Text style={styles.date}>{new Date(payment.createdAt).toLocaleString()}</Text>
        </Card>
      ))}

      <SectionTitle title="Grievances" />
      {grievances.length === 0 && <EmptyState message="No grievances filed." />}
      {grievances.map((grievance) => (
        <Card key={grievance.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.detail}>
              Block {grievance.hostelBlock} · Room {grievance.roomNo}
            </Text>
            <Badge label={grievance.status.toUpperCase()} tone={grievance.status === "resolved" ? "success" : "warning"} />
          </View>
          <Text style={styles.value}>{grievance.message}</Text>
          <Text style={styles.date}>{new Date(grievance.createdAt).toLocaleString()}</Text>
        </Card>
      ))}

      <SectionTitle title="Check-In / Out History" />
      {logs.length === 0 && <EmptyState message="No check-in/out records." />}
      {logs.map((log) => (
        <Card key={log.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.value}>
              {log.date} at {log.time}
            </Text>
            <Badge label={log.type === "in" ? "CHECK-IN" : "CHECK-OUT"} tone={log.type === "in" ? "success" : "warning"} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: fontSize.sm, color: colors.textMuted },
  value: { fontSize: fontSize.md, color: colors.text },
  detail: { fontSize: fontSize.sm, color: colors.textMuted },
  date: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  actionButton: { marginTop: spacing.md },
});
