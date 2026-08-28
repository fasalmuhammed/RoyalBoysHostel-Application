import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Screen } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { parseAmount } from "@/utils/validate";
import type { SetupStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<SetupStackParamList, "HostelDetails">;

/** Collects the few settings that show up inside messages and receipts. */
export default function HostelDetailsScreen({ navigation }: Props) {
  const { settings, updateSettings } = useApp();

  const [hostelName, setHostelName] = useState(
    settings.hostelName === "My Hostel" ? "" : settings.hostelName
  );
  const [countryCode, setCountryCode] = useState(settings.countryCode);
  const [defaultRent, setDefaultRent] = useState(String(settings.defaultRent));
  const [feeDueDay, setFeeDueDay] = useState(String(settings.feeDueDay));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onContinue = async () => {
    if (!hostelName.trim()) {
      setError("Enter your hostel's name.");
      return;
    }

    const dueDay = Number.parseInt(feeDueDay, 10);
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) {
      setError("The fee due day must be between 1 and 28.");
      return;
    }

    setSaving(true);
    try {
      await updateSettings({
        hostelName: hostelName.trim(),
        countryCode: countryCode.replace(/\D/g, "") || "91",
        defaultRent: parseAmount(defaultRent),
        feeDueDay: dueDay,
      });
      navigation.navigate("CreatePin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Hostel details</Text>
      <Text style={styles.subtitle}>
        These appear on receipts and in the WhatsApp messages you send.
      </Text>

      <Input
        label="Hostel name"
        required
        value={hostelName}
        onChangeText={setHostelName}
        placeholder="e.g. Green Valley Boys Hostel"
        icon="business-outline"
        error={error && !hostelName.trim() ? error : undefined}
      />

      <Input
        label="Phone country code"
        value={countryCode}
        onChangeText={setCountryCode}
        placeholder="91"
        keyboardType="number-pad"
        icon="call-outline"
        hint="Added to student numbers when opening WhatsApp. India is 91."
      />

      <Input
        label="Default monthly rent"
        value={defaultRent}
        onChangeText={setDefaultRent}
        placeholder="6000"
        keyboardType="numeric"
        icon="cash-outline"
        hint="Used when a room has no rent of its own. You can change it per room."
      />

      <Input
        label="Fees due on day"
        value={feeDueDay}
        onChangeText={setFeeDueDay}
        placeholder="10"
        keyboardType="number-pad"
        icon="calendar-outline"
        hint="Day of the month invoices fall due (1–28)."
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Continue" onPress={onContinue} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.text },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginBottom: spacing.md },
});
