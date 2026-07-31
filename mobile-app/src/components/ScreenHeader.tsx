import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.xs },
});
