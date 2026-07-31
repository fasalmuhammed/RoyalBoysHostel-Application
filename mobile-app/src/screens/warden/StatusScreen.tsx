import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { subscribeStudentLogs } from "@/services/checkinout";
import { subscribeStudents } from "@/services/users";
import { CheckLog, UserProfile } from "@/types";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import StudentPicker from "@/components/StudentPicker";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function StatusScreen() {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<CheckLog[]>([]);
  const [loading, setLoading] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => subscribeStudents(setStudents), []);
  useEffect(() => () => unsubscribeRef.current?.(), []);

  useEffect(() => {
    unsubscribeRef.current?.();
    if (!selectedStudent) {
      setLogs([]);
      return;
    }
    setLoading(true);
    unsubscribeRef.current = subscribeStudentLogs(selectedStudent.uid, (items) => {
      setLogs(items);
      setLoading(false);
    });
  }, [selectedStudent]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Check-In / Out Status" subtitle="Look up a student's latest activity" />

        <StudentPicker label="Student" students={students} selected={selectedStudent} onSelect={setSelectedStudent} />

        {selectedStudent && !loading && logs.length === 0 && (
          <EmptyState message={`No check-in/out records found for ${selectedStudent.name}.`} />
        )}

        {logs.map((log) => (
          <Card key={log.id}>
            <Badge label={log.type === "in" ? "CHECK-IN" : "CHECK-OUT"} tone={log.type === "in" ? "success" : "warning"} />
            <Text style={styles.detail}>
              {log.date} at {log.time}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  detail: { fontSize: fontSize.md, color: colors.text, marginTop: spacing.sm },
});
