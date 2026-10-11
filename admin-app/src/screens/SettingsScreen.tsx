import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, fontSize, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import {
  BiometricSupport,
  biometricSupport,
  isBiometricEnabled,
  setBiometricEnabled,
} from "@/services/security";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export default function SettingsScreen({ navigation }: Props) {
  const { settings, updateSettings, access } = useApp();

  const [hostelName, setHostelName] = useState(settings.hostelName);
  const [countryCode, setCountryCode] = useState(settings.countryCode);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);

  const [biometrics, setBiometrics] = useState<BiometricSupport | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    biometricSupport().then(setBiometrics);
    isBiometricEnabled().then(setBiometricOn);
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        hostelName: hostelName.trim() || "Royal Boys Hostel",
        countryCode: countryCode.replace(/\D/g, "") || "91",
        currencySymbol: currencySymbol.trim() || "₹",
      });

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
        {/* Hostel details are the admin's; a manager sees the app lock only. */}
        {access.isOwner ? (
          <>
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

          </>
        ) : null}

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
              Fingerprint and face unlock are not available in the browser.
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

        {access.isOwner ? (
          <>
        <Button
          title={saved ? "Saved" : "Save settings"}
          icon={saved ? "checkmark" : undefined}
          onPress={onSave}
          loading={saving}
        />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  pair: { flexDirection: "row", gap: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { ...type.bodyStrong, color: colors.text },
  switchHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
