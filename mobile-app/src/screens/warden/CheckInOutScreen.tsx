import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { logCheck } from "@/services/checkinout";
import { subscribeStudents } from "@/services/users";
import { CheckType, UserProfile } from "@/types";
import Input from "@/components/Input";
import Button from "@/components/Button";
import ScreenHeader from "@/components/ScreenHeader";
import StudentPicker from "@/components/StudentPicker";
import { colors, fontSize, spacing } from "@/constants/theme";

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toTimeString().slice(0, 5);

export default function CheckInOutScreen() {
  const { user, logout } = useAuth();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [type, setType] = useState<CheckType>("in");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(now());
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeStudents(setStudents), []);

  const onSubmit = async () => {
    if (!user || !selectedStudent || !date || !time) return;
    setLoading(true);
    try {
      await logCheck(selectedStudent.uid, selectedStudent.name, type, date, time, user.uid);
      Alert.alert("Logged", `Check-${type} recorded for ${selectedStudent.name}.`);
      setSelectedStudent(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Check In / Out" subtitle="Log a student's hostel entry or exit" />

        <StudentPicker label="Student" students={students} selected={selectedStudent} onSelect={setSelectedStudent} />

        <View style={styles.toggleRow}>
          {(["in", "out"] as CheckType[]).map((option) => (
            <Button
              key={option}
              title={option === "in" ? "Check-In" : "Check-Out"}
              variant={type === option ? "primary" : "secondary"}
              style={styles.toggleButton}
              onPress={() => setType(option)}
            />
          ))}
        </View>

        <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <Input label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" />

        <Button title="Submit" onPress={onSubmit} loading={loading} disabled={!selectedStudent} />

        <Text style={styles.link} onPress={logout}>
          Logout
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  toggleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  toggleButton: { flex: 1 },
  link: { color: colors.primary, textAlign: "center", fontWeight: "600", marginTop: spacing.lg, fontSize: fontSize.md },
});
