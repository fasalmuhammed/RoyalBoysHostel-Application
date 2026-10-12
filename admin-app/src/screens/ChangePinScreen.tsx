import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, font, fontSize, spacing } from "@/constants/theme";
import { changePin, setPin } from "@/services/security";
import { useApp } from "@/context/AppContext";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ChangePin">;

export default function ChangePinScreen({ navigation }: Props) {
  // The PIN is per device; one opened here for the first time has none yet.
  const { hasPin, refreshPinState } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (next.length < 4) {
      setError("The new PIN must be at least 4 digits.");
      return;
    }
    if (next !== confirm) {
      setError("The two new PINs do not match.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ok = hasPin ? await changePin(current, next) : (await setPin(next), true);
      await refreshPinState();
      if (!ok) {
        setError("That current PIN is not right.");
        return;
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const digits = (text: string) => text.replace(/\D/g, "").slice(0, 8);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{hasPin ? "Change your PIN" : "Set a PIN for this device"}</Text>

        {hasPin ? (
        <Input
          label="Current PIN"
          required
          value={current}
          onChangeText={(t) => setCurrent(digits(t))}
          secureTextEntry
          keyboardType="number-pad"
          icon="lock-closed-outline"
        />
        ) : null}
        <Input
          label="New PIN"
          required
          value={next}
          onChangeText={(t) => setNext(digits(t))}
          secureTextEntry
          keyboardType="number-pad"
          icon="keypad-outline"
        />
        <Input
          label="Confirm new PIN"
          required
          value={confirm}
          onChangeText={(t) => setConfirm(digits(t))}
          secureTextEntry
          keyboardType="number-pad"
          icon="checkmark-circle-outline"
          error={error ?? undefined}
        />

        <Callout tone="warning" icon="warning-outline">
          <CalloutText>
            This PIN belongs to this device only. A forgotten one is removed by clearing this
            browser's data for the app; the hostel records stay safe in online storage.
          </CalloutText>
        </Callout>

        <Button title={hasPin ? "Change PIN" : "Set PIN"} onPress={onSubmit} loading={saving} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  title: {
    fontSize: fontSize.xl,
    fontFamily: font.extrabold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
});
