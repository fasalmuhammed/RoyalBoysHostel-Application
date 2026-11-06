import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import Glass from "./Glass";
import Button from "./Button";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
import { parseIsoDate, toIsoDate } from "@/utils/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * A month calendar in a sheet: tap a day to choose it. Dates go in and out as
 * ISO yyyy-MM-dd, so nothing typed by hand can be saved in the wrong form.
 */
export default function CalendarSheet({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** yyyy-MM-dd, or "" for none (the calendar then opens on this month). */
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const start = value ? parseIsoDate(value) : new Date();
  const [shown, setShown] = useState({ year: start.getFullYear(), month: start.getMonth() });

  // Opening again shows the month of the chosen date.
  useEffect(() => {
    if (visible) setShown({ year: start.getFullYear(), month: start.getMonth() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const move = (months: number) =>
    setShown(({ year, month }) => {
      const d = new Date(year, month + months, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const today = toIsoDate();
  const daysInMonth = new Date(shown.year, shown.month + 1, 0).getDate();
  // Monday-first: how many blanks before the 1st.
  const lead = (new Date(shown.year, shown.month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const isoOf = (day: number) => toIsoDate(new Date(shown.year, shown.month, day));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.stage}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close calendar" />
        <Glass thick radius={28} intensity={70} style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.header}>
            <NavButton icon="play-back" label="Previous year" onPress={() => move(-12)} />
            <NavButton icon="chevron-back" label="Previous month" onPress={() => move(-1)} />
            <Text style={styles.month}>
              {MONTHS[shown.month]} {shown.year}
            </Text>
            <NavButton icon="chevron-forward" label="Next month" onPress={() => move(1)} />
            <NavButton icon="play-forward" label="Next year" onPress={() => move(12)} />
          </View>

          <View style={styles.row}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={styles.weekday}>
                {d}
              </Text>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, week) => (
            <View key={week} style={styles.row}>
              {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
                if (!day) return <View key={i} style={styles.cell} />;
                const iso = isoOf(day);
                const selected = iso === value;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      onSelect(iso);
                      onClose();
                    }}
                    style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${day} ${MONTHS[shown.month]} ${shown.year}`}
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.day, selected && styles.daySelected, !selected && iso === today && styles.dayToday]}>
                      <Text style={[styles.dayText, selected && styles.dayTextSelected, !selected && iso === today && styles.dayTextToday]}>
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.actions}>
            <Button
              title="Today"
              variant="secondary"
              compact
              onPress={() => {
                onSelect(today);
                onClose();
              }}
              style={{ flex: 1 }}
            />
            <Button title="Cancel" variant="ghost" compact onPress={onClose} style={{ flex: 1 }} />
          </View>
        </Glass>
      </View>
    </Modal>
  );
}

function NavButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.nav, pressed && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={icon.startsWith("play") ? 14 : 20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.lg },
  sheet: { padding: spacing.lg, width: "100%", maxWidth: 380, alignSelf: "center" },
  title: { ...type.section, color: colors.text, textAlign: "center", marginBottom: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  month: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: fontSize.md, color: colors.text },
  nav: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", ...type.caption, color: colors.textFaint, paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.text },
  dayTextSelected: { color: colors.primaryOn, fontFamily: font.bold },
  dayTextToday: { color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
