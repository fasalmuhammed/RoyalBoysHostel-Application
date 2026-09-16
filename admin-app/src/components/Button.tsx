import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { HIT_TARGET, colors, fontSize, radius, shadow, spacing, type } from "@/constants/theme";
import { PressableScale } from "./Motion";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: ViewStyle;
}

export default function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  compact = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const foreground =
    variant === "primary" || variant === "danger" ? colors.primaryOn : colors.primary;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      // A destructive button should not feel inviting to press.
      haptic={!isDisabled && variant !== "danger"}
      style={[
        styles.base,
        compact && styles.compact,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        isDisabled && styles.disabled,
        style,
      ] as ViewStyle[]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={compact ? 15 : 17} color={foreground} /> : null}
          <Text
            style={[
              styles.text,
              compact && { fontSize: fontSize.sm },
              { color: foreground },
              variant === "danger" && { color: colors.primaryOn },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: HIT_TARGET + 4,
  },
  compact: { paddingVertical: spacing.sm, minHeight: HIT_TARGET - 6, paddingHorizontal: spacing.md },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  primary: { backgroundColor: colors.primary, ...shadow.card },
  // A hairline neutral border reads as a secondary action; a heavy coloured
  // outline competes with the primary button sitting next to it.
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  text: { ...type.bodyStrong, fontSize: fontSize.md },
});
