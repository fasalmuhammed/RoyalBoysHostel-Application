import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

/**
 * "Which hostel?" for a form. Needed when both hostels are showing, because a
 * new room or inmate has to belong to one of them.
 */
export default function BranchChoice({
  value,
  onChange,
  error,
  label = "Hostel",
}: {
  value: string | null;
  onChange: (branchId: string) => void;
  error?: string;
  label?: string;
}) {
  const { branches } = useApp();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        <Text style={{ color: colors.danger }}> *</Text>
      </Text>
      <View style={styles.choices}>
        {branches.map((branch) => {
          const active = branch.id === value;
          return (
            <Pressable
              key={branch.id}
              onPress={() => onChange(branch.id)}
              style={[styles.choice, active && styles.choiceActive, !!error && !active && styles.choiceError]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={active ? colors.primary : colors.textFaint}
              />
              <Text style={[styles.choiceText, active && { color: colors.primary }]} numberOfLines={1}>
                {branch.shortName || branch.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...type.support, fontFamily: type.bodyStrong.fontFamily, color: colors.text, marginBottom: spacing.xs + 2 },
  choices: { flexDirection: "row", gap: spacing.sm },
  choice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  choiceError: { borderColor: colors.danger },
  choiceText: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  error: { ...type.support, color: colors.danger, marginTop: spacing.xs },
});
