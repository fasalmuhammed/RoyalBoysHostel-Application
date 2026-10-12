import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { OptionPicker } from "./Controls";
import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

const ALL = "__all__";

/**
 * The hostel being looked at, as a drop-down: one hostel, or both together.
 * It sits at the top of every tab and they all follow it. Only the admin has
 * a choice; a manager works in their own hostel, so for them it shows nothing.
 */
export default function HostelSwitch({
  variant = "light",
  style,
}: {
  /** "dark" for the navy header, "light" for a normal page. */
  variant?: "light" | "dark";
  style?: ViewStyle;
}) {
  const { access, branches, activeBranch, allHostels, chooseBranch, chooseAll } = useApp();
  const [open, setOpen] = useState(false);

  if (!access.isOwner || branches.length < 2) return null;

  const dark = variant === "dark";
  const label = allHostels ? "Both hostels" : activeBranch?.shortName || activeBranch?.name || "Choose hostel";
  const tint = dark ? colors.onDark : colors.text;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, dark ? styles.pillDark : styles.pillLight, pressed && { opacity: 0.8 }, style]}
        accessibilityRole="button"
        accessibilityLabel={`Hostel: ${label}. Change`}
      >
        <View style={[styles.icon, dark ? styles.iconDark : styles.iconLight]}>
          <Ionicons name={allHostels ? "layers" : "business"} size={14} color={dark ? colors.goldLight : colors.primary} />
        </View>
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={dark ? colors.onDarkMuted : colors.textMuted} />
      </Pressable>

      <OptionPicker
        visible={open}
        title="Show hostel"
        options={[
          ...branches.map((branch) => ({ key: branch.id, label: branch.shortName || branch.name, sublabel: branch.name })),
          { key: ALL, label: "Both hostels", sublabel: "Everything from both, combined" },
        ]}
        selectedKey={allHostels ? ALL : (activeBranch?.id ?? null)}
        onSelect={(key) => (key === ALL ? chooseAll() : void chooseBranch(key))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    minHeight: HIT_TARGET - 4,
    paddingLeft: 6,
    paddingRight: spacing.sm + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: "100%",
  },
  pillLight: { backgroundColor: colors.surface, borderColor: colors.border },
  pillDark: { backgroundColor: colors.glass, borderColor: colors.glassBorder },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconLight: { backgroundColor: colors.primaryLight },
  iconDark: { backgroundColor: colors.glass },
  label: { ...type.bodyStrong, fontSize: type.support.fontSize + 1, flexShrink: 1 },
});
