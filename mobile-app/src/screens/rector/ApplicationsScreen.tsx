import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { setApplicationStatus, subscribeAllApplications } from "@/services/applications";
import { HostelApplication } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { colors, fontSize, spacing } from "@/constants/theme";

const statusTone: Record<string, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

export default function ApplicationsScreen() {
  const [applications, setApplications] = useState<HostelApplication[]>([]);

  useEffect(() => subscribeAllApplications(setApplications), []);

  return (
    <View style={styles.container}>
      <FlatList
        data={applications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<ScreenHeader title="Hostel Applications" subtitle="Review and approve student applications" />}
        ListEmptyComponent={<EmptyState message="No applications submitted yet." />}
        renderItem={({ item }) => (
          <Card>
            <Badge label={item.status.toUpperCase()} tone={statusTone[item.status]} />
            <Text style={styles.name}>
              {item.firstName} {item.lastName}
            </Text>
            <Text style={styles.detail}>Father's Name: {item.fatherName}</Text>
            <Text style={styles.detail}>Address: {item.address}</Text>
            <Text style={styles.detail}>ID Proof: {item.idProof}</Text>
            <Text style={styles.detail}>Family Income: ₹{item.income}</Text>
            {!item.studentId && item.applicantEmail && (
              <Text style={styles.detail}>Contact: {item.applicantEmail} (no mobile account yet)</Text>
            )}

            {item.status === "pending" && (
              <View style={styles.actions}>
                <Button
                  title="Approve"
                  style={styles.actionButton}
                  onPress={() => setApplicationStatus(item.id, "approved")}
                />
                <Button
                  title="Reject"
                  variant="danger"
                  style={styles.actionButton}
                  onPress={() => setApplicationStatus(item.id, "rejected")}
                />
              </View>
            )}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  name: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  detail: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1 },
});
