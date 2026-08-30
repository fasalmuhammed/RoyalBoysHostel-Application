import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, font, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import {
  BiometricSupport,
  biometricSupport,
  isBiometricEnabled,
  setBiometricEnabled,
} from "@/services/security";
import { scheduleBackupReminder } from "@/services/reminders";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export default function SettingsScreen({ navigation }: Props) {
  const { settings, updateSettings } = useApp();

  const [hostelName, setHostelName] = useState(settings.hostelName);
  const [countryCode, setCountryCode] = useState(settings.countryCode);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [reminderDays, setReminderDays] = useState(String(settings.backupReminderDays));

  const [biometrics, setBiometrics] = useState<BiometricSupport | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    biometricSupport().then(setBiometrics);
    isBiometricEnabled().then(setBiometricOn);
  }, []);

  const onSave = async () => {
    const days = Number.parseInt(reminderDays, 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7;

    setSaving(true);
    try {
      await updateSettings({
        hostelName: hostelName.trim() || "My Hostel",
        countryCode: countryCode.replace(/\D/g, "") || "91",
        currencySymbol: currencySymbol.trim() || "₹",
        backupReminderDays: safeDays,
      });

      // Reschedule so the backup nudge tracks the value just saved.
      await scheduleBackupReminder(safeDays);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggleBiometric = async (value: boolean) => {
    setBiometricOn(value);
    await setBiometricEnabled(value);
  };

  const canUseBiometrics = Boolean(biometrics?.available && biometrics.enrolled);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title="Hostel" />
        <Input
          label="Hostel name"
          value={hostelName}
          onChangeText={setHostelName}
          icon="business-outline"
        />
        <View style={styles.pair}>
          <Input
            label="Country code"
            value={countryCode}
            onChangeText={setCountryCode}
            keyboardType="number-pad"
            containerStyle={{ flex: 1 }}
            icon="call-outline"
          />
          <Input
            label="Currency"
            value={currencySymbol}
            onChangeText={setCurrencySymbol}
            containerStyle={{ width: 100 }}
          />
        </View>

        <SectionTitle title="Fees" />
        <Callout tone="info" icon="cash-outline">
          <CalloutText>
            Rent and payment deadlines are set per inmate, not here — the amount follows the room
            they are given and can differ per person. Open a inmate to change their rent or
            billing cycle.
          </CalloutText>
        </Callout>

        <SectionTitle title="Security" />
        <Card>
          {canUseBiometrics ? (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>{biometrics?.label}</Text>
                <Text style={styles.switchHint}>Unlock without typing the PIN.</Text>
              </View>
              <Switch
                value={biometricOn}
                onValueChange={toggleBiometric}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                thumbColor={colors.surface}
              />
            </View>
          ) : (
            <Text style={styles.switchHint}>
              No fingerprint or face unlock is set up on this phone.
            </Text>
          )}
          <Button
            title="Change PIN"
            variant="secondary"
            icon="keypad-outline"
            onPress={() => navigation.navigate("ChangePin")}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <SectionTitle title="Backup reminders" />
        <Input
          label="Remind me every (days)"
          value={reminderDays}
          onChangeText={setReminderDays}
          keyboardType="number-pad"
          icon="alarm-outline"
        />

        <Callout tone="info" icon="phone-portrait-outline">
          <CalloutText>
            This app keeps everything on this phone alone. Uninstalling it, or losing the phone,
            deletes the data permanently. Export a backup regularly and keep it elsewhere.
          </CalloutText>
        </Callout>

        <Button
          title={saved ? "Saved" : "Save settings"}
          icon={saved ? "checkmark" : undefined}
          onPress={onSave}
          loading={saving}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  pair: { flexDirection: "row", gap: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: fontSize.md, fontFamily: font.semibold, color: colors.text },
  switchHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
