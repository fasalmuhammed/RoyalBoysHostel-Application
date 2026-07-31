import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { subscribeStudentApplications } from "@/services/applications";
import { HostelApplication } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import { colors, fontSize, spacing } from "@/constants/theme";

const statusTone: Record<string, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

export default function StudentHomeScreen() {
  const { user, logout } = useAuth();
  const [applications, setApplications] = useState<HostelApplication[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeStudentApplications(user.uid, setApplications);
  }, [user]);

  const latest = applications[0];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={`Welcome, ${user?.name ?? "Student"}`} subtitle="Here's what's happening at your hostel" />

      <Card>
        <Text style={styles.cardTitle}>Your Hostel Application</Text>
        {latest ? (
          <>
            <Badge label={latest.status.toUpperCase()} tone={statusTone[latest.status]} />
            <Text style={styles.cardBody}>Submitted on {new Date(latest.createdAt).toLocaleDateString()}</Text>
          </>
        ) : (
          <Text style={styles.cardBody}>You haven't applied for hostel accommodation yet.</Text>
        )}
      </Card>

      <Button title="Logout" variant="secondary" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  cardBody: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.sm },
});
