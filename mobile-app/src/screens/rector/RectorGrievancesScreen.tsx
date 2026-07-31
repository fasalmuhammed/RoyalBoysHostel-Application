import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { setGrievanceStatus, subscribeGrievances } from "@/services/grievances";
import { Grievance } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function RectorGrievancesScreen() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);

  useEffect(() => subscribeGrievances(setGrievances), []);

  return (
    <View style={styles.container}>
      <FlatList
        data={grievances}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<ScreenHeader title="Grievances" subtitle="Student complaints & issues" />}
        ListEmptyComponent={<EmptyState message="No grievances filed yet." />}
        renderItem={({ item }) => (
          <Card>
            <Badge label={item.status.toUpperCase()} tone={item.status === "resolved" ? "success" : "warning"} />
            <Text style={styles.name}>{item.username}</Text>
            <Text style={styles.detail}>
              Block {item.hostelBlock} · Room {item.roomNo}
            </Text>
            <Text style={styles.message}>{item.message}</Text>

            {item.status === "open" && (
              <Button
                title="Mark as Resolved"
                style={styles.actionButton}
                onPress={() => setGrievanceStatus(item.id, "resolved")}
              />
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
  detail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  message: { fontSize: fontSize.md, color: colors.text, marginTop: spacing.sm },
  actionButton: { marginTop: spacing.md },
});
