import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import Glass from "./Glass";
import { useReducedMotion } from "./Liquid";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
import { formatMoney, formatPeriod, shiftPeriod } from "@/utils/format";
import type { RentChange } from "@/services/fees";

/** "1st", "2nd", "17th"... */
function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

/**
 * Asked after an inmate moves into a room priced differently from what they
 * pay: whether to take the room's rent, from when, and whether their bills
 * should now fall due on today's date instead of their old billing day.
 */
export default function RentChangeSheet({
  visible,
  name,
  roomLabel,
  currentRent,
  newRent,
  billingDay,
  period,
  symbol,
  onKeep,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  roomLabel: string;
  currentRent: number;
  newRent: number;
  /** The day of the month their bills fall due now. */
  billingDay: number;
  /** This month, yyyy-mm. */
  period: string;
  symbol: string;
  onKeep: () => void;
  onConfirm: (change: RentChange) => Promise<void>;
}) {
  const today = new Date().getDate();
  const [from, setFrom] = useState<RentChange["from"]>("this");
  const [moveDay, setMoveDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setFrom("this");
    setMoveDay(false);
    setBusy(false);
    appear.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.timing(appear, { toValue: 1, duration: 240, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start();
    }
  }, [visible, reduced, appear]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm({ rent: newRent, from, billingDay: moveDay ? today : null });
    } finally {
      setBusy(false);
    }
  };

  const sameDay = billingDay === today;
  const firstName = name.split(" ")[0] || name;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={busy ? undefined : onKeep}>
      <View style={styles.scrim}>
        <Animated.View
          style={[
            styles.wrap,
            { opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] },
          ]}
        >
          <Glass thick radius={26} intensity={60} style={styles.card}>
            <Text style={styles.title}>Update {firstName}'s rent?</Text>
            <Text style={styles.message}>Room {roomLabel} is priced differently from what {firstName} pays now.</Text>

            <View style={styles.compare}>
              <View style={styles.compareCell}>
                <Text style={styles.compareLabel}>NOW</Text>
                <Text style={styles.compareOld}>{formatMoney(currentRent, symbol)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textFaint} />
              <View style={styles.compareCell}>
                <Text style={styles.compareLabel}>ROOM {roomLabel}</Text>
                <Text style={styles.compareNew}>{formatMoney(newRent, symbol)}</Text>
              </View>
            </View>

            <Text style={styles.question}>New rent starts</Text>
            <Choice
              selected={from === "this"}
              onPress={() => setFrom("this")}
              title={`This month (${formatPeriod(period)})`}
              detail={currentRent <= 0 ? "This month's bill is set to the new rent, so it shows as due" : "This month's bill changes to the new rent"}
            />
            <Choice
              selected={from === "next"}
              onPress={() => setFrom("next")}
              title={`From next month (${formatPeriod(shiftPeriod(period, 1))})`}
              detail="This month's bill stays as it is"
            />

            {sameDay ? null : (
              <>
                <Text style={styles.question}>Rent due date</Text>
                <Choice
                  selected={!moveDay}
                  onPress={() => setMoveDay(false)}
                  title={`Keep the ${ordinal(billingDay)} of each month`}
                  detail="Their existing due date"
                />
                <Choice
                  selected={moveDay}
                  onPress={() => setMoveDay(true)}
                  title={`Change to the ${ordinal(today)} of each month`}
                  detail="Counted from today, the day they moved in"
                />
              </>
            )}

            <View style={styles.actions}>
              <Pressable
                disabled={busy}
                onPress={onKeep}
                style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryText}>Keep {formatMoney(currentRent, symbol)}</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={confirm}
                style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={colors.primaryOn} /> : <Text style={styles.primaryText}>Update rent</Text>}
              </Pressable>
            </View>
          </Glass>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Choice({ selected, onPress, title, detail }: { selected: boolean; onPress: () => void; title: string; detail: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.3)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  wrap: { width: "100%", maxWidth: 380 },
  card: { padding: spacing.lg, overflow: "hidden" },
  title: { ...type.section, fontSize: fontSize.lg, color: colors.text, textAlign: "center" },
  message: { ...type.body, fontSize: fontSize.sm, lineHeight: 19, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  compare: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(120, 120, 128, 0.1)",
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  compareCell: { alignItems: "center", gap: 2 },
  compareLabel: { ...type.label, color: colors.textFaint },
  compareOld: { fontFamily: font.semibold, fontSize: fontSize.lg, color: colors.textMuted },
  compareNew: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.primary },
  question: { ...type.label, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    marginTop: 6,
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textFaint, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  choiceTitle: { ...type.bodyStrong, fontSize: fontSize.sm + 1, color: colors.text },
  choiceDetail: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  button: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: "rgba(120, 120, 128, 0.14)" },
  primaryText: { fontFamily: font.semibold, fontSize: fontSize.md, color: colors.primaryOn },
  secondaryText: { fontFamily: font.semibold, fontSize: fontSize.md, color: colors.text },
  pressed: { opacity: 0.75 },
});
