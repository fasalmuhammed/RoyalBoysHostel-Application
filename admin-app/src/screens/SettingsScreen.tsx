import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import FormScroll from "@/components/FormScroll";
import { Alert } from "@/web/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, fontSize, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export default function SettingsScreen({ navigation }: Props) {
  const { settings, updateSettings, access } = useApp();

  const [hostelName, setHostelName] = useState(settings.hostelName);
  const [countryCode, setCountryCode] = useState(settings.countryCode);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <FormScroll
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hostel details; only the admin opens this screen. */}
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
      </FormScroll>
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
