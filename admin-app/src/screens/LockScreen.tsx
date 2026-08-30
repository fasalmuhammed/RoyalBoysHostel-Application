import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, font, fontSize, radius, shadow, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import {
  authenticateBiometric,
  biometricSupport,
  getLockedUntil,
  isBiometricEnabled,
  verifyPin,
} from "@/services/security";

const PIN_LENGTH_MAX = 8;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"] as const;

export default function LockScreen() {
  const { settings, unlock } = useApp();

  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [biometricLabel, setBiometricLabel] = useState<string | null>(null);
  const promptedRef = useRef(false);

  const tryBiometric = useCallback(async () => {
    if (await authenticateBiometric()) unlock();
  }, [unlock]);

  useEffect(() => {
    (async () => {
      const [enabled, support, until] = await Promise.all([
        isBiometricEnabled(),
        biometricSupport(),
        getLockedUntil(),
      ]);
      setLockedUntil(until);

      if (enabled && support.available && support.enrolled) {
        setBiometricLabel(support.label);
        // Offer the prompt once on mount; re-prompting on every render would
        // trap the admin in a loop they cannot cancel out of.
        if (!promptedRef.current && !until) {
          promptedRef.current = true;
          tryBiometric();
        }
      }
    })();
  }, [tryBiometric]);

  // Ticks only while a cool-down is running, so the countdown stays live.
  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const secondsLeft = lockedUntil ? Math.max(Math.ceil((lockedUntil - now) / 1000), 0) : 0;
  const isLockedOut = secondsLeft > 0;

  useEffect(() => {
    if (lockedUntil && secondsLeft === 0) {
      setLockedUntil(null);
      setMessage(null);
    }
  }, [lockedUntil, secondsLeft]);

  const submit = useCallback(
    async (value: string) => {
      const result = await verifyPin(value);
      if (result.ok) {
        unlock();
        return;
      }

      setPin("");
      if (result.lockedUntil) {
        setLockedUntil(result.lockedUntil);
        setNow(Date.now());
        setMessage("Too many wrong attempts.");
      } else if (result.attemptsLeft !== null) {
        setMessage(
          `Wrong PIN. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`
        );
      } else {
        setMessage("Wrong PIN.");
      }
    },
    [unlock]
  );

  const onKey = (key: string) => {
    if (isLockedOut) return;

    if (key === "del") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (key === "bio") {
      tryBiometric();
      return;
    }

    setPin((current) => {
      const next = (current + key).slice(0, PIN_LENGTH_MAX);
      setMessage(null);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Ionicons name="lock-closed" size={26} color={colors.primaryOn} />
        </View>
        <Text style={styles.hostel} numberOfLines={1}>
          {settings.hostelName}
        </Text>
        <Text style={styles.prompt}>Enter your PIN</Text>

        <View style={styles.dots}>
          {Array.from({ length: Math.max(pin.length, 4) }).map((_, index) => (
            <View key={index} style={[styles.dot, index < pin.length && styles.dotFilled]} />
          ))}
        </View>

        <Text style={[styles.message, isLockedOut && { color: colors.danger }]}>
          {isLockedOut
            ? `Locked. Try again in ${secondsLeft}s.`
            : message ?? " "}
        </Text>
      </View>

      <View style={styles.pad}>
        {KEYS.map((key) => {
          if (key === "bio" && !biometricLabel) {
            return <View key={key} style={styles.key} />;
          }
          return (
            <Pressable
              key={key}
              onPress={() => onKey(key)}
              disabled={isLockedOut && key !== "del"}
              style={({ pressed }) => [
                styles.key,
                pressed && !isLockedOut && styles.keyPressed,
                isLockedOut && key !== "del" && { opacity: 0.4 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                key === "del" ? "Delete" : key === "bio" ? biometricLabel ?? "Biometric" : key
              }
            >
              {key === "del" ? (
                <Ionicons name="backspace-outline" size={24} color={colors.text} />
              ) : key === "bio" ? (
                <Ionicons name="finger-print" size={26} color={colors.primary} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.unlockButton}
        disabled={pin.length < 4 || isLockedOut}
        onPress={() => submit(pin)}
      >
        <Text style={[styles.unlockText, (pin.length < 4 || isLockedOut) && { opacity: 0.4 }]}>
          Unlock
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "space-between",
    paddingVertical: spacing.xl,
  },
  top: { alignItems: "center", paddingTop: spacing.xl },
  logo: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  hostel: {
    fontSize: fontSize.lg,
    fontFamily: font.extrabold,
    color: colors.text,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  prompt: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  dots: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.lg },
  dot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  message: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.md,
    minHeight: 20,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  key: {
    width: 76,
    height: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: colors.primaryLight },
  keyText: { fontSize: fontSize.xl, fontFamily: font.semibold, color: colors.text },
  unlockButton: { alignSelf: "center", padding: spacing.md },
  unlockText: { fontSize: fontSize.md, fontFamily: font.bold, color: colors.primary },
});
