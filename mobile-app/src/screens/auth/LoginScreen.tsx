import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AuthStackParamList } from "@/navigation/types";
import { useAuth } from "@/context/AuthContext";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { colors, fontSize, spacing } from "@/constants/theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const roleLabel: Record<string, string> = { rector: "Rector", warden: "Warden", student: "Student" };

export default function LoginScreen({ route, navigation }: Props) {
  const { role } = route.params;
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password, role);
      // RootNavigator switches automatically once the auth state updates.
    } catch (e: any) {
      setError(e.message ?? "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{roleLabel[role]} Login</Text>

        <Input
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Login" onPress={onSubmit} loading={loading} />

        <View style={styles.links}>
          <Text style={styles.link} onPress={() => navigation.navigate("Register", { role })}>
            Don't have an account? Register
          </Text>
          <Text style={styles.link} onPress={() => navigation.navigate("ForgotPassword", { role })}>
            Forgot password?
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  heading: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md },
  links: { marginTop: spacing.lg, gap: spacing.md },
  link: { color: colors.primary, textAlign: "center", fontWeight: "600" },
});
