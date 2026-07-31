import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { submitGrievance } from "@/services/grievances";
import Input from "@/components/Input";
import Button from "@/components/Button";
import ScreenHeader from "@/components/ScreenHeader";
import { colors, spacing } from "@/constants/theme";

export default function GrievancesScreen() {
  const { user } = useAuth();
  const [hostelBlock, setHostelBlock] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!user) return;
    if (!hostelBlock || !roomNo || !message) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await submitGrievance({
        studentId: user.uid,
        username: user.name,
        hostelBlock,
        roomNo,
        message,
      });
      setHostelBlock("");
      setRoomNo("");
      setMessage("");
      Alert.alert("Submitted", "Your grievance has been submitted to the Rector.");
    } catch (e: any) {
      setError(e.message ?? "Could not submit grievance.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Grievances" subtitle="Report an issue in your hostel" />
        <Input label="Hostel Dormitory / Block" value={hostelBlock} onChangeText={setHostelBlock} />
        <Input label="Room No." value={roomNo} onChangeText={setRoomNo} keyboardType="numeric" />
        <Input label="Grievance / Complaint" value={message} onChangeText={setMessage} multiline numberOfLines={4} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Submit Grievance" onPress={onSubmit} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  error: { color: colors.danger, marginBottom: spacing.md },
});
