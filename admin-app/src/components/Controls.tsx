import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, font, fontSize, radius, shadow, spacing, toneColor, Tone } from "@/constants/theme";
import Button from "./Button";
import { AnimatedBar, FadeIn, PressableScale, useCountUp } from "./Motion";

// --- search -----------------------------------------------------------------

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

// --- tabs -------------------------------------------------------------------

export interface TabOption<T extends string> {
  key: T;
  label: string;
  count?: number;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {option.label}
              {option.count !== undefined ? ` (${option.count})` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// --- stat tile --------------------------------------------------------------

export function StatCard({
  label,
  value,
  icon,
  tone = "info",
  onPress,
  style,
}: {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const { fg, bg } = toneColor[tone];
  // Numbers tick up; anything already formatted (a ratio, an amount) is left
  // alone rather than animated into nonsense.
  const numeric = typeof value === "number";
  const counted = useCountUp(numeric ? value : 0);

  const body = (
    <>
      {icon ? (
        <View style={[styles.statIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={16} color={fg} />
        </View>
      ) : null}
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {numeric ? counted : value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.97} style={[styles.stat, style] as ViewStyle[]}>
        {body}
      </PressableScale>
    );
  }
  return <View style={[styles.stat, style]}>{body}</View>;
}

// --- quick action -----------------------------------------------------------

export function QuickAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.93} style={styles.quick}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={21} color={colors.primary} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

// --- option picker ----------------------------------------------------------

export interface PickerOption {
  key: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

/**
 * Bottom-sheet single choice list. Used for rooms, months, payment methods and
 * templates so every picker in the app behaves identically.
 */
export function OptionPicker({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  emptyMessage = "Nothing to choose from yet.",
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  emptyMessage?: string;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <FadeIn offsetY={24} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>

        {options.length === 0 ? (
          <Text style={styles.sheetEmpty}>{emptyMessage}</Text>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(item) => item.key}
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => {
              const selected = item.key === selectedKey;
              return (
                <PressableScale
                  disabled={item.disabled}
                  scaleTo={0.98}
                  onPress={() => {
                    onSelect(item.key);
                    onClose();
                  }}
                  style={[styles.option, item.disabled && { opacity: 0.4 }] as ViewStyle[]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{item.label}</Text>
                    {item.sublabel ? (
                      <Text style={styles.optionSublabel}>{item.sublabel}</Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </PressableScale>
              );
            }}
          />
        )}

        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </FadeIn>
    </Modal>
  );
}

// --- progress overlay -------------------------------------------------------

export function ProgressOverlay({
  visible,
  title,
  detail,
  fraction,
}: {
  visible: boolean;
  title: string;
  detail?: string;
  fraction?: number | null;
}) {
  const percent = fraction == null ? null : Math.round(Math.min(Math.max(fraction, 0), 1) * 100);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.progressBackdrop}>
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{title}</Text>
          {detail ? <Text style={styles.progressDetail}>{detail}</Text> : null}
          <AnimatedBar fraction={percent == null ? 0.35 : percent / 100} />
          {percent != null ? <Text style={styles.progressPercent}>{percent}%</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

// --- floating action --------------------------------------------------------

export function Fab({
  icon = "add",
  label,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel={label ?? "Add"}
    >
      <Ionicons name={icon} size={22} color={colors.primaryOn} />
      {label ? <Text style={styles.fabLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: 0 },

  tabs: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.md },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontFamily: font.semibold, color: colors.textMuted },
  tabTextActive: { color: colors.primaryOn },

  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  statValue: { fontSize: fontSize.xl, fontFamily: font.extrabold, color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  quick: { alignItems: "center", width: 74 },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs + 2,
  },
  quickLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: "center",
    fontFamily: font.semibold,
  },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: font.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sheetEmpty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    textAlign: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.sm,
  },
  optionLabel: { fontSize: fontSize.md, color: colors.text, fontFamily: font.semibold },
  optionSublabel: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },

  progressBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  progressCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.raised,
  },
  progressTitle: { fontSize: fontSize.lg, fontFamily: font.bold, color: colors.text },
  progressDetail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  progressPercent: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: "right",
  },

  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md + 2,
    height: 52,
    borderRadius: radius.pill,
    ...shadow.raised,
  },
  fabLabel: { color: colors.primaryOn, fontFamily: font.bold, fontSize: fontSize.md },
});
