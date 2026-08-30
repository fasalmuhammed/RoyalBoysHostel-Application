import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Screen } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, font, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { BiometricSupport, biometricSupport, setBiometricEnabled, setPin } from "@/services/security";
import { initReminders, scheduleBackupReminder, scheduleFeeReminder } from "@/services/reminders";
import type { SetupStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<SetupStackParamList, "CreatePin">;

const MIN_PIN = 4;

export default function CreatePinScreen({}: Props) {
  const { settings, updateSettings, refreshPinState, unlock } = useApp();

  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [useBiometric, setUseBiometric] = useState(true);
  const [biometrics, setBiometrics] = useState<BiometricSupport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    biometricSupport().then(setBiometrics);
  }, []);

  const canUseBiometrics = Boolean(biometrics?.available && biometrics.enrolled);

  const onFinish = async () => {
    if (pin.length < MIN_PIN) {
      setError(`Choose a PIN of at least ${MIN_PIN} digits.`);
      return;
    }
    if (pin !== confirm) {
      setError("The two PINs do not match.");
      return;
    }

    setSaving(true);
    try {
      await setPin(pin);
      await setBiometricEnabled(canUseBiometrics && useBiometric);
      await refreshPinState();
      await updateSettings({ setupComplete: true });

      // Best-effort: reminders are a convenience, and a denied permission must
      // not block the admin from finishing setup.
      if (await initReminders()) {
        await scheduleFeeReminder();
        await scheduleBackupReminder(settings.backupReminderDays);
      }

      unlock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PIN could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Lock the app</Text>
      <Text style={styles.subtitle}>
        Inmate records, phone numbers and fee history sit on this phone. A PIN keeps them out of
        reach if someone else picks it up.
      </Text>

      <Input
        label="Choose a PIN"
        required
        value={pin}
        onChangeText={(text) => setPinValue(text.replace(/\D/g, "").slice(0, 8))}
        placeholder="At least 4 digits"
        keyboardType="number-pad"
        secureTextEntry
        icon="keypad-outline"
      />

      <Input
        label="Confirm PIN"
        required
        value={confirm}
        onChangeText={(text) => setConfirm(text.replace(/\D/g, "").slice(0, 8))}
        placeholder="Enter it again"
        keyboardType="number-pad"
        secureTextEntry
        icon="checkmark-circle-outline"
      />

      {canUseBiometrics ? (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>{biometrics?.label}</Text>
            <Text style={styles.switchHint}>Faster than typing the PIN each time.</Text>
          </View>
          <Switch
            value={useBiometric}
            onValueChange={setUseBiometric}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </View>
      ) : null}

      <Callout tone="warning" icon="warning-outline">
        <CalloutText>
          There is no way to reset this PIN from outside the app — no email, no account. If you
          forget it you will have to reinstall, which erases the data on this phone. Keep a backup
          file somewhere safe.
        </CalloutText>
      </Callout>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Finish setup" onPress={onFinish} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontFamily: font.extrabold, color: colors.text },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  switchLabel: { fontSize: fontSize.md, fontFamily: font.semibold, color: colors.text },
  switchHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  error: { color: colors.danger, fontSize: fontSize.sm, marginBottom: spacing.md },
});
