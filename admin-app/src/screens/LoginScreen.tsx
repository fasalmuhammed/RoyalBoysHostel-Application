import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import FormScroll from "@/components/FormScroll";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import Button from "@/components/Button";
import Input from "@/components/Input";
import { LiquidBlobs, Surface } from "@/components/Liquid";
import { colors, fontSize, gradients, radius, shadow, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";

/**
 * The door to the app. The admin and each branch manager sign in with the
 * user ID and password the admin set; what they see afterwards depends on
 * which login it is.
 */
export default function LoginScreen() {
  const { signIn, settings, loginNotice } = useApp();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      setError("Enter your user ID and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FormScroll
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={[styles.hero, { paddingTop: insets.top + spacing.xl + spacing.md }]}>
          <LinearGradient colors={[...gradients.hero]} start={gradients.heroStart} end={gradients.heroEnd} style={StyleSheet.absoluteFill} />
          <LiquidBlobs />
          <View style={styles.logo}>
            <Ionicons name="business" size={30} color={colors.goldLight} />
          </View>
          <Text style={styles.title}>{settings.hostelName}</Text>
          <Text style={styles.subtitle}>Hostel management</Text>
        </View>

        <Surface style={styles.card} distance={28}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSubtitle}>Log in to open the hostel records.</Text>
          {loginNotice ? (
            <View style={styles.notice}>
              <Ionicons name="time-outline" size={16} color={colors.info} />
              <Text style={styles.noticeText}>{loginNotice}</Text>
            </View>
          ) : null}

          <Input
            label="User ID"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            icon="person-outline"
            placeholder="e.g. thammanam"
          />
          <View>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              icon="lock-closed-outline"
              onSubmitEditing={onSubmit}
              error={error ?? undefined}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              style={styles.eye}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color={colors.textFaint} />
            </Pressable>
          </View>

          <Button title="Log in" icon="log-in-outline" onPress={onSubmit} loading={busy} />
        </Surface>

        <View style={styles.note}>
          <Ionicons name="help-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>Forgot your password? Ask the admin to reset it.</Text>
        </View>

        <View style={styles.secure}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.textFaint} />
          <Text style={styles.secureText}>Records are kept safely online</Text>
        </View>
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl * 2 },
  hero: {
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    // Room for the card to ride up over the bottom edge.
    paddingBottom: spacing.xl * 2 + spacing.md,
    borderBottomLeftRadius: radius.xl + 6,
    borderBottomRightRadius: radius.xl + 6,
    overflow: "hidden",
  },
  glowA: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#FFFFFF",
    opacity: 0.14,
    top: -140,
    right: -80,
  },
  glowB: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#FFFFFF",
    opacity: 0.1,
    bottom: -120,
    left: -70,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: { ...type.title, color: colors.onDark, textAlign: "center" },
  subtitle: { ...type.support, color: colors.onDarkMuted, textAlign: "center", marginTop: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xl - spacing.md,
    ...shadow.raised,
  },
  cardTitle: { ...type.title, color: colors.text },
  cardSubtitle: { ...type.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  noticeText: { ...type.support, color: colors.text, flex: 1 },
  // Sits inside the password field, level with what is typed.
  eye: { position: "absolute", right: spacing.md, top: 38 },

  note: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  noteText: { fontSize: fontSize.sm, color: colors.textMuted },
  secure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  secureText: { fontSize: fontSize.xs, color: colors.textFaint },
});
