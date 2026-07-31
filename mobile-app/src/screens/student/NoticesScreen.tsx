import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { subscribeNotices } from "@/services/notices";
import { Notice } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function NoticesScreen() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => subscribeNotices(setNotices), []);

  return (
    <View style={styles.container}>
      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<ScreenHeader title="Notices" subtitle="Announcements from the Rector" />}
        ListEmptyComponent={<EmptyState message="No notices yet." />}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.message}>{item.message}</Text>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  date: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.xs, fontWeight: "600" },
  message: { fontSize: fontSize.md, color: colors.text },
});
