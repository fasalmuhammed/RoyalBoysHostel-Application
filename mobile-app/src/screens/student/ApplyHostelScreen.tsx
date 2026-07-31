import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { submitApplication } from "@/services/applications";
import Input from "@/components/Input";
import Button from "@/components/Button";
import ScreenHeader from "@/components/ScreenHeader";
import { colors, spacing } from "@/constants/theme";

export default function ApplyHostelScreen() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [address, setAddress] = useState("");
  const [idProof, setIdProof] = useState("");
  const [income, setIncome] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!user) return;
    if (!firstName || !lastName || !fatherName || !address || !idProof || !income) {
      setError("Please fill in all fields.");
      return;
    }
    const incomeNumber = Number(income);
    if (Number.isNaN(incomeNumber) || incomeNumber < 0) {
      setError("Please enter a valid income amount.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await submitApplication({
        studentId: user.uid,
        studentName: user.name,
        firstName,
        lastName,
        fatherName,
        address,
        idProof,
        income: incomeNumber,
      });
      setFirstName("");
      setLastName("");
      setFatherName("");
      setAddress("");
      setIdProof("");
      setIncome("");
      Alert.alert("Submitted", "Your hostel application has been submitted. Check the Notices tab for updates.");
    } catch (e: any) {
      setError(e.message ?? "Could not submit application.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Apply for Hostel" subtitle="Fill in the details below to submit your application" />

        <Input label="First Name" value={firstName} onChangeText={setFirstName} />
        <Input label="Last Name" value={lastName} onChangeText={setLastName} />
        <Input label="Father's Name" value={fatherName} onChangeText={setFatherName} />
        <Input label="Residential Address" value={address} onChangeText={setAddress} multiline />
        <Input label="Aadhar / PAN No." value={idProof} onChangeText={setIdProof} />
        <Input label="Family Income (₹)" value={income} onChangeText={setIncome} keyboardType="numeric" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Submit Application" onPress={onSubmit} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  error: { color: colors.danger, marginBottom: spacing.md },
});
