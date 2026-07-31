import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/AuthContext";
import Button from "@/components/Button";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function PendingApprovalScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <Ionicons name="time-outline" size={56} color={colors.warning} />
      <Text style={styles.title}>Awaiting Approval</Text>
      <Text style={styles.body}>
        Hi {user?.name}, your Rector account has been created but needs to be approved by an existing Rector before
        you can access the dashboard. Check back once someone on the hostel administration team has approved you.
      </Text>
      <Button title="Logout" variant="secondary" onPress={logout} style={styles.button} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  body: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  button: { alignSelf: "stretch" },
});
