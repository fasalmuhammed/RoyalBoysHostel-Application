import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xl, alignItems: "center" },
  text: { color: colors.textMuted, fontSize: fontSize.md, textAlign: "center" },
});
