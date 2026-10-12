import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import Glass from "./Glass";
import { colors, font } from "@/constants/theme";
import { tapFeedback } from "@/utils/haptics";

/**
 * How much room the floating tab bar takes at the bottom of a tab's screen,
 * not counting the phone's own bottom inset. Lists pad themselves by this so
 * their last row can scroll clear of the bar.
 */
export const TAB_BAR_SPACE = 84;

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Dashboard: ["home-outline", "home"],
  Inmates: ["people-outline", "people"],
  Rooms: ["bed-outline", "bed"],
  Fees: ["wallet-outline", "wallet"],
  More: ["ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle"],
};
const LABELS: Record<string, string> = { Dashboard: "Home" };

/**
 * The tab bar as a capsule of glass floating over the content, which scrolls
 * underneath it. The current tab sits in a lighter lozenge and is marked by a
 * filled icon as well as colour.
 */
export default function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
      <Glass radius={34} intensity={55} style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const [idle, active] = ICONS[route.name] ?? ["ellipse-outline", "ellipse"];
          const label = LABELS[route.name] ?? route.name;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              tapFeedback();
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.item, focused && styles.itemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <Ionicons name={focused ? active : idle} size={23} color={focused ? colors.primary : colors.textMuted} />
              <Text style={[styles.label, { color: focused ? colors.primary : colors.textMuted }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14, alignItems: "center" },
  bar: { flexDirection: "row", padding: 5, width: "100%", maxWidth: 460 },
  item: { flex: 1, height: 54, borderRadius: 28, alignItems: "center", justifyContent: "center", gap: 2 },
  itemActive: { backgroundColor: "rgba(0, 122, 255, 0.12)" },
  label: { fontFamily: font.semibold, fontSize: 10.5, letterSpacing: 0.1 },
});
