import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "@/constants/theme";

const toneColors: Record<string, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  neutral: colors.textMuted,
};

export default function Badge({ label, tone = "neutral" }: { label: string; tone?: keyof typeof toneColors }) {
  const color = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1A`, borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { fontSize: fontSize.sm, fontWeight: "600" },
});
