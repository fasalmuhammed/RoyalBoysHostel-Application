import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: ViewStyle;
}

export default function Input({
  label,
  error,
  hint,
  required,
  icon,
  containerStyle,
  style,
  multiline,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.primary : colors.textFaint}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Read-only field that opens a picker. Looks identical to a text input. */
export function PickerField({
  label,
  value,
  placeholder,
  onPress,
  error,
  required,
  icon,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: string;
  required?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.field,
          !!error && styles.fieldError,
          pressed && { opacity: 0.75 },
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textFaint} style={styles.icon} /> : null}
        <Text style={[styles.input, !value && { color: colors.textFaint }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    ...type.support,
    fontFamily: type.bodyStrong.fontFamily,
    color: colors.textMuted,
    marginBottom: spacing.xs + 2,
  },
  required: { color: colors.danger },
  field: {
    flexDirection: "row",
    alignItems: "center",
    // A hairline at rest, thickening only on focus: a permanently heavy border
    // on every field makes a form look like a spreadsheet.
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    minHeight: HIT_TARGET + 6,
  },
  fieldMultiline: { alignItems: "flex-start", paddingVertical: spacing.sm },
  fieldFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  fieldError: { borderColor: colors.danger, borderWidth: 1.5 },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    ...type.body,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  error: { ...type.support, color: colors.danger, marginTop: spacing.xs },
  hint: { ...type.support, color: colors.textFaint, marginTop: spacing.xs },
});
