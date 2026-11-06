import React, { useEffect, useRef, useState } from "react";
import { toDisplayDate } from "@/utils/format";
import CalendarSheet from "./CalendarSheet";

import {
  Platform,
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
import { useFormScroll } from "./FormScroll";

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
  const form = useFormScroll();
  const inputRef = useRef<TextInput>(null);

  // Inside a form page: take part in "Next", and come into view when tapped.
  useEffect(() => {
    if (!form || !inputRef.current) return;
    return form.register(inputRef.current);
  }, [form]);
  const nextKey = form && !multiline && rest.editable !== false && !rest.onSubmitEditing;

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
          ref={inputRef}
          placeholderTextColor={colors.textFaint}
          multiline={multiline}
          {...(nextKey
            ? {
                returnKeyType: "next" as const,
                submitBehavior: "submit" as const,
                onSubmitEditing: () => inputRef.current && form.focusNext(inputRef.current),
              }
            : {})}
          {...rest}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          onFocus={(e) => {
            setFocused(true);
            form?.reveal();
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
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

/**
 * A date chosen on a calendar and shown day first (DD-MM-YYYY). Holds an ISO
 * yyyy-MM-dd value; nothing is typed, so no date can be saved in a wrong form.
 */
export function DateInput({
  label = "Date",
  value,
  onChange,
  error,
  hint,
  required,
  icon = "calendar-outline",
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerField
        label={label}
        value={value ? toDisplayDate(value) : null}
        placeholder="Choose a date"
        onPress={() => setOpen(true)}
        error={error}
        hint={hint}
        required={required}
        icon={icon}
      />
      <CalendarSheet visible={open} title={label} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
    </>
  );
}

/** Read-only field that opens a picker. Looks identical to a text input. */
export function PickerField({
  label,
  value,
  placeholder,
  onPress,
  error,
  hint,
  required,
  icon,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: string;
  hint?: string;
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
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    ...type.support,
    fontFamily: type.bodyStrong.fontFamily,
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  required: { color: colors.danger },
  field: {
    flexDirection: "row",
    alignItems: "center",
    // A hairline at rest, thickening only on focus: a permanently heavy border
    // on every field makes a form look like a spreadsheet.
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    minHeight: HIT_TARGET + 8,
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
    // The field draws its own focus border; a browser adds a second ring.
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  error: { ...type.support, color: colors.danger, marginTop: spacing.xs },
  hint: { ...type.support, color: colors.textFaint, marginTop: spacing.xs },
});
