import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "@/constants/theme";

interface Props {
  label: string;
  value: string | number;
  color?: string;
}

export default function StatCard({ label, value, color = colors.primary }: Props) {
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  value: { fontSize: fontSize.xxl, fontWeight: "700" },
  label: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
});
