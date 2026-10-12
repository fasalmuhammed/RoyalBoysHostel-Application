import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  HIT_TARGET,
  colors,
  font,
  layout,
  radius,
  shadow,
  spacing,
  type,
} from "@/constants/theme";
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

/**
 * Three keys per row, sharing the width left after the pad's own padding and
 * the two gaps between them. Capped so the pad does not become absurd on a
 * tablet.
 */
const KEY_SIZE = Math.min((layout.width - spacing.lg * 2 - spacing.md * 2) / 3, 96);

export default function LockScreen() {
  const { settings, unlock } = useApp();

  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [biometricLabel, setBiometricLabel] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const promptedRef = useRef(false);
  /** Mirrors `checking` for the guard, which must read the value synchronously. */
  const checkingRef = useRef(false);

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
      // Hashing runs on the JS thread, so a second tap would queue another one
      // behind the first and make the freeze worse rather than doing anything.
      if (checkingRef.current) return;
      checkingRef.current = true;
      setChecking(true);
      setMessage(null);

      try {
        // One frame to paint "Checking…" before the hash blocks the thread.
        await new Promise((resolve) => setTimeout(resolve, 0));
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
      } catch {
        // Without this the rejection was swallowed and the screen simply sat
        // there, looking hung, with no way to tell the PIN was never checked.
        setPin("");
        setMessage("Could not check that PIN. Please try again.");
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [unlock]
  );

  const onKey = (key: string) => {
    if (isLockedOut || checking) return;

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
            : checking
              ? "Checking…"
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
              disabled={checking || (isLockedOut && key !== "del")}
              style={({ pressed }) => [
                styles.key,
                pressed && !isLockedOut && !checking && styles.keyPressed,
                ((isLockedOut && key !== "del") || checking) && { opacity: 0.4 },
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
        disabled={pin.length < 4 || isLockedOut || checking}
        onPress={() => submit(pin)}
        accessibilityRole="button"
        accessibilityState={{ disabled: pin.length < 4 || isLockedOut, busy: checking }}
      >
        {checking ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[styles.unlockText, (pin.length < 4 || isLockedOut) && { opacity: 0.4 }]}>
            Unlock
          </Text>
        )}
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
    ...type.section,
    color: colors.text,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    textAlign: "center",
  },
  prompt: { ...type.support, color: colors.textMuted, marginTop: spacing.xs },
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
    ...type.support,
    color: colors.textMuted,
    marginTop: spacing.md,
    minHeight: 20,
    paddingHorizontal: spacing.lg,
    textAlign: "center",
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  key: {
    // Keys share the row instead of being pinned to 76dp: on a 320dp phone a
    // fixed width overflows once padding and gaps are counted, and on a large
    // phone it strands the pad in the middle of the screen.
    width: KEY_SIZE,
    height: Math.min(KEY_SIZE * 0.82, 66),
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: colors.primaryLight },
  keyText: { ...type.title, fontFamily: font.semibold, color: colors.text },
  unlockButton: { alignSelf: "center", padding: spacing.md, minHeight: HIT_TARGET },
  unlockText: { ...type.bodyStrong, color: colors.primary },
});
