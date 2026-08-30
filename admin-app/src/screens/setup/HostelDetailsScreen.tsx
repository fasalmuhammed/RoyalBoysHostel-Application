import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Screen } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, font, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import type { SetupStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<SetupStackParamList, "HostelDetails">;

/**
 * Setup asks only for what is genuinely hostel-wide.
 *
 * Rent and payment deadlines deliberately live on the inmate, not here: the
 * amount follows the room a inmate is given and can be negotiated per person,
 * and the period they pay for varies. Asking once at setup would have implied
 * a single hostel price that then had to be corrected everywhere.
 */
export default function HostelDetailsScreen({ navigation }: Props) {
  const { settings, updateSettings } = useApp();

  const [hostelName, setHostelName] = useState(
    settings.hostelName === "My Hostel" ? "" : settings.hostelName
  );
  const [countryCode, setCountryCode] = useState(settings.countryCode);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onContinue = async () => {
    if (!hostelName.trim()) {
      setError("Enter your hostel's name.");
      return;
    }

    setSaving(true);
    try {
      await updateSettings({
        hostelName: hostelName.trim(),
        countryCode: countryCode.replace(/\D/g, "") || "91",
        currencySymbol: currencySymbol.trim() || "₹",
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
        error={error ?? undefined}
      />

      <Input
        label="Phone country code"
        value={countryCode}
        onChangeText={setCountryCode}
        placeholder="91"
        keyboardType="number-pad"
        icon="call-outline"
        hint="Added to inmate numbers when opening WhatsApp. India is 91."
      />

      <Input
        label="Currency symbol"
        value={currencySymbol}
        onChangeText={setCurrencySymbol}
        placeholder="₹"
        icon="cash-outline"
      />

      <Callout tone="info" icon="information-circle-outline">
        <CalloutText>
          Rent is not set here. You enter it for each inmate when you add them — it fills in
          automatically from the room you allocate, and you can change it per inmate. Bills fall
          due 30 days into the period unless you set a different cycle for that inmate.
        </CalloutText>
      </Callout>

      <Button title="Continue" onPress={onContinue} loading={saving} />
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
});
