import React, { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import Glass from "./Glass";
import { useReducedMotion } from "./Liquid";
import { colors, font } from "@/constants/theme";
import { tapFeedback } from "@/utils/haptics";

/**
 * How much room the floating tab bar takes at the bottom of a tab's screen,
 * not counting the phone's own bottom inset. Lists pad themselves by this so
 * their last row can scroll clear of the bar.
 */
export const TAB_BAR_SPACE = 84;

/** Space between the glass edge and the tabs. */
const PAD = 5;

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
  // While typing (a search box, say) the bar steps aside, as on iOS.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setTyping(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /**
   * The highlight behind the current tab is one drop that slides to the next
   * tab, stretching as it sets off and settling as it lands.
   */
  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const slot = barWidth > 0 ? (barWidth - PAD * 2) / count : 0;
  const position = useRef(new Animated.Value(state.index)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const still = useReducedMotion();
  useEffect(() => {
    if (still) {
      position.setValue(state.index);
      return;
    }
    Animated.spring(position, { toValue: state.index, damping: 17, stiffness: 190, mass: 0.9, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.timing(stretch, { toValue: 1.22, duration: 120, useNativeDriver: true }),
      Animated.spring(stretch, { toValue: 1, damping: 9, stiffness: 180, useNativeDriver: true }),
    ]).start();
  }, [state.index, position, stretch, still]);

  if (typing) return null;

  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
      <Glass radius={34} intensity={55} style={styles.bar}>
        <View style={StyleSheet.absoluteFill} onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} pointerEvents="none" />
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.drop,
              {
                width: slot,
                transform: [
                  { translateX: position.interpolate({ inputRange: [0, count - 1], outputRange: [0, slot * (count - 1)] }) },
                  { scaleX: stretch },
                ],
              },
            ]}
          />
        ) : null}
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
              style={styles.item}
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
  bar: { flexDirection: "row", padding: PAD, width: "100%", maxWidth: 460 },
  drop: { position: "absolute", left: PAD, top: PAD, height: 54, borderRadius: 28, backgroundColor: "rgba(0, 122, 255, 0.12)" },
  item: { flex: 1, height: 54, borderRadius: 28, alignItems: "center", justifyContent: "center", gap: 2 },
  label: { fontFamily: font.semibold, fontSize: 10.5, letterSpacing: 0.1 },
});
