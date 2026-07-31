import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { UserProfile } from "@/types";
import Input from "./Input";
import { colors, fontSize, radius, spacing } from "@/constants/theme";

interface Props {
  label: string;
  students: UserProfile[];
  selected: UserProfile | null;
  onSelect: (student: UserProfile | null) => void;
}

export default function StudentPicker({ label, students, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return students.filter((s) => s.name.toLowerCase().includes(lower)).slice(0, 6);
  }, [query, students]);

  if (selected) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.selectedRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedName}>{selected.name}</Text>
            <Text style={styles.selectedEmail}>{selected.email}</Text>
          </View>
          <Pressable
            onPress={() => {
              onSelect(null);
              setQuery("");
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Input
        label={label}
        placeholder="Type a student's name…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      {matches.length > 0 && (
        <View style={styles.dropdown}>
          {matches.map((student) => (
            <Pressable
              key={student.uid}
              style={styles.option}
              onPress={() => {
                onSelect(student);
                setQuery("");
              }}
            >
              <Text style={styles.optionName}>{student.name}</Text>
              <Text style={styles.optionEmail}>{student.email}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {query.trim().length > 0 && matches.length === 0 && (
        <Text style={styles.noMatch}>No registered students match "{query}".</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.xs, fontWeight: "600" },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  selectedName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  selectedEmail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  dropdown: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionName: { fontSize: fontSize.md, color: colors.text, fontWeight: "600" },
  optionEmail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  noMatch: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
});
