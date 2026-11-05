import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DateInput } from "./Input";
import { colors, radius, spacing, type } from "@/constants/theme";
import { formatDate, toIsoDate } from "@/utils/format";
import { promiseDateProblem } from "@/services/fees";

function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function endOfMonth(): string {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/**
 * "When will they pay the rest?" -- the date a part-paid bill's balance is
 * promised for. One tap for the usual answers, or any date typed in.
 */
export default function PromiseDateField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
}) {
  const quick: { label: string; iso: string }[] = [
    { label: "Tomorrow", iso: inDays(1) },
    { label: "In 3 days", iso: inDays(3) },
    { label: "In a week", iso: inDays(7) },
    { label: "In 2 weeks", iso: inDays(14) },
  ];
  // Offered only while it is still a few days off; otherwise it repeats a choice above.
  const monthEnd = endOfMonth();
  if (monthEnd > inDays(3) && !quick.some((q) => q.iso === monthEnd)) quick.push({ label: "Month end", iso: monthEnd });

  const readable = value && !promiseDateProblem(value) ? formatDate(value) : undefined;

  return (
    <View>
      <View style={styles.chips}>
        {quick.map((choice) => {
          const active = choice.iso === value;
          return (
            <Pressable
              key={choice.label}
              onPress={() => onChange(choice.iso)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{choice.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <DateInput
        label="Balance promised by"
        required
        value={value}
        onChange={onChange}
        icon="calendar-outline"
        error={error}
        hint={readable ? `${readable}. They will show in the dues list again on this day.` : "The day they said they will pay the rest."}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.bodyStrong, fontSize: type.support.fontSize, color: colors.primary },
  chipTextActive: { color: colors.primaryOn },
});
