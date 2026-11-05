import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import PopoverMenu, { MenuItem, usePopoverMenu } from "./PopoverMenu";
import { housesOf } from "@/services/branches";
import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

const ALL = "__all__";
/** Joins a hostel's id to one of its buildings in a menu key. */
const SEP = "::";

/**
 * The hostel being looked at, as a drop-down: one hostel, or both together.
 * It sits at the top of every tab and they all follow it. Only the admin has
 * a choice; a manager works in their own hostel, so for them it shows nothing.
 */
export default function HostelSwitch({
  variant = "light",
  style,
  compact = false,
}: {
  /** Leaves out the round icon, for a crowded row. */
  compact?: boolean;
  /** "dark" for the navy header, "light" for a normal page. */
  variant?: "light" | "dark";
  style?: ViewStyle;
}) {
  const { access, branches, activeBranch, allHostels, chooseBranch, chooseAll, activeHouse, chooseHouse } = useApp();
  const menu = usePopoverMenu();

  // The admin chooses between hostels. A manager has one hostel, and a choice
  // only when theirs is made of more than one building.
  const mine = access.isOwner ? branches : branches.filter((branch) => branch.id === activeBranch?.id);
  const choice = access.isOwner ? branches.length > 1 : mine.some((branch) => housesOf(branch).length > 0);
  if (!choice) return null;

  const dark = variant === "dark";
  const label = allHostels ? "Both hostels" : activeHouse || activeBranch?.shortName || activeBranch?.name || "Choose hostel";
  const tint = dark ? colors.onDark : colors.text;

  // A hostel, then its buildings set in beneath it.
  const items: MenuItem[] = [];
  for (const branch of mine) {
    const houses = housesOf(branch);
    items.push({
      key: branch.id,
      label: branch.shortName || branch.name,
      sublabel: houses.length > 0 ? `All of it: ${houses.join(" and ")}` : undefined,
    });
    for (const house of houses) items.push({ key: `${branch.id}${SEP}${house}`, label: house, indent: true });
  }
  if (access.isOwner) items.push({ key: ALL, label: "Both hostels", sublabel: "Everything, combined" });

  const selectedKey = allHostels
    ? ALL
    : activeHouse && activeBranch
      ? `${activeBranch.id}${SEP}${activeHouse}`
      : (activeBranch?.id ?? null);

  const onSelect = (key: string) => {
    if (key === ALL) chooseAll();
    else if (key.includes(SEP)) {
      const [branchId, house] = key.split(SEP);
      void chooseHouse(branchId, house);
    } else void chooseBranch(key);
  };

  return (
    <>
      <Pressable
        ref={menu.anchorRef}
        onPress={menu.open}
        style={({ pressed }) => [styles.pill, compact && styles.pillCompact, dark ? styles.pillDark : styles.pillLight, pressed && { opacity: 0.8 }, style]}
        accessibilityRole="button"
        accessibilityLabel={`Hostel: ${label}. Change`}
      >
        {compact ? null : (
        <View style={[styles.icon, dark ? styles.iconDark : styles.iconLight]}>
          <Ionicons
            name={allHostels ? "layers" : activeHouse ? "home" : "business"}
            size={14}
            color={dark ? colors.goldLight : colors.primary}
          />
        </View>
        )}
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={dark ? colors.onDarkMuted : colors.textMuted} />
      </Pressable>

      <PopoverMenu {...menu.props} title="Show" items={items} selectedKey={selectedKey} onSelect={onSelect} />
    </>
  );
}

const styles = StyleSheet.create({
  pillCompact: { paddingLeft: spacing.sm + 4 },
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
