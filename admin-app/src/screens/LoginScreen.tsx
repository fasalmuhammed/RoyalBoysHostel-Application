import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, fontSize, radius, shadow, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

/**
 * The door to the app. The admin and each branch manager sign in with the
 * user ID and password the admin set; what they see afterwards depends on
 * which login it is.
 */
export default function LoginScreen() {
  const { signIn, settings } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      setError("Enter your user ID and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="business" size={32} color={colors.primaryOn} />
        </View>
        <Text style={styles.title}>{settings.hostelName}</Text>
        <Text style={styles.subtitle}>Log in to open the hostel records.</Text>
      </View>

      <Input
        label="User ID"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        icon="person-outline"
        placeholder="e.g. thammanam"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        icon="lock-closed-outline"
        onSubmitEditing={onSubmit}
        error={error ?? undefined}
      />

      <Button title="Log in" icon="log-in-outline" onPress={onSubmit} loading={busy} />

      <View style={styles.note}>
        <Ionicons name="help-circle-outline" size={16} color={colors.textMuted} />
        <Text style={styles.noteText}>Forgot your password? Ask the admin to reset it.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginBottom: spacing.xl, marginTop: spacing.xl },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.raised,
  },
  title: { ...type.title, color: colors.text, textAlign: "center" },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  noteText: { fontSize: fontSize.sm, color: colors.textMuted },
});
