import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AuthStackParamList } from "@/navigation/types";
import { useAuth } from "@/context/AuthContext";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { colors, fontSize, spacing } from "@/constants/theme";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!email) {
      setError("Please enter your account email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage("A password reset link has been sent to your email.");
    } catch (e: any) {
      setError(e.message ?? "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Reset your password</Text>
      <Text style={styles.body}>
        Enter the email you registered with — we'll send you a link to reset your password.
      </Text>

      <Input
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <Button title="Send reset link" onPress={onSubmit} loading={loading} />
      <Text style={styles.link} onPress={() => navigation.navigate("Login", route.params)}>
        Back to login
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  heading: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md },
  success: { color: colors.success, marginBottom: spacing.md },
  link: { color: colors.primary, textAlign: "center", fontWeight: "600", marginTop: spacing.lg },
});
