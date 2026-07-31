import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AuthStackParamList } from "@/navigation/types";
import { useAuth } from "@/context/AuthContext";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { colors, fontSize, spacing } from "@/constants/theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

const roleLabel: Record<string, string> = { rector: "Rector", warden: "Warden", student: "Student" };

export default function RegisterScreen({ route, navigation }: Props) {
  const { role } = route.params;
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(name, email, password, role);
    } catch (e: any) {
      setError(e.message ?? "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{roleLabel[role]} Registration</Text>

        <Input label="Full Name" placeholder="Jane Doe" value={name} onChangeText={setName} />
        <Input
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} />
        <Input
          label="Confirm Password"
          placeholder="••••••••"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Register" onPress={onSubmit} loading={loading} />

        <Text style={styles.link} onPress={() => navigation.navigate("Login", { role })}>
          Already have an account? Login
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  heading: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md },
  link: { color: colors.primary, textAlign: "center", fontWeight: "600", marginTop: spacing.lg },
});
