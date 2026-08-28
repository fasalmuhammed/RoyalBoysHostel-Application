import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import { colors, fontSize, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { currentPeriod, generateInvoices, listFees } from "@/services/fees";
import { studentCounts } from "@/services/students";
import { formatPeriod, shiftPeriod } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "GenerateInvoices">;

/**
 * Bulk-raises one invoice per active student for a chosen month.
 *
 * Existing invoices for that month are left untouched, so running this twice
 * is safe — the second run simply picks up students admitted since the first.
 */
export default function GenerateInvoicesScreen({ navigation }: Props) {
  const { invalidate } = useApp();

  const [period, setPeriod] = useState(currentPeriod());
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: counts } = useAsyncData(() => studentCounts(), []);
  const { data: existing } = useAsyncData(() => listFees("all", period, ""), [period]);

  const alreadyBilled = existing?.length ?? 0;
  const toRaise = Math.max((counts?.active ?? 0) - alreadyBilled, 0);

  const choosePeriod = (value: string) => setPeriod(value);

  const onGenerate = async () => {
    if (toRaise === 0) {
      Alert.alert(
        "Nothing to raise",
        alreadyBilled > 0
          ? `Every active student already has a bill for ${formatPeriod(period)}.`
          : "There are no active students to bill yet."
      );
      return;
    }

    Alert.alert(
      "Raise bills",
      `${toRaise} bill(s) will be created for ${formatPeriod(period)}, each priced at that ` +
        "student's own rent and due after their own billing cycle. Students who already have a " +
        "bill for this month are skipped.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Raise bills",
          onPress: async () => {
            setRunning(true);
            try {
              const result = await generateInvoices(period);
              invalidate();
              Alert.alert(
                "Bills raised",
                `${result.created} created${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.`,
                [{ text: "Done", onPress: () => navigation.goBack() }]
              );
            } catch (e) {
              Alert.alert(
                "Could not raise bills",
                e instanceof Error ? e.message : "Please try again."
              );
            } finally {
              setRunning(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Raise monthly bills</Text>
        <Text style={styles.subtitle}>
          Creates one bill per active student, using the rent recorded on each of them.
        </Text>

        <SectionTitle title="Month" />
        <PickerField
          label="Billing month"
          icon="calendar-outline"
          value={formatPeriod(period)}
          placeholder="Choose a month"
          onPress={() => setPeriodPickerOpen(true)}
        />

        <SectionTitle title="What will happen" />
        <Card>
          <Row label="Active students" value={String(counts?.active ?? 0)} />
          <Row label={`Already billed for ${formatPeriod(period)}`} value={String(alreadyBilled)} />
          <Row label="Bills to be created" value={String(toRaise)} highlight />
        </Card>

        <Callout tone="info" icon="information-circle-outline">
          <CalloutText>
            Each bill uses the rent recorded on that student, and falls due after their own
            billing cycle (30 days unless you changed it). Edit a student to adjust their terms.
          </CalloutText>
        </Callout>

        <Button
          title={`Raise ${toRaise} bill${toRaise === 1 ? "" : "s"}`}
          onPress={onGenerate}
          loading={running}
          disabled={toRaise === 0}
        />
      </ScrollView>

      <OptionPicker
        visible={periodPickerOpen}
        title="Billing month"
        selectedKey={period}
        onClose={() => setPeriodPickerOpen(false)}
        onSelect={choosePeriod}
        options={Array.from({ length: 14 }, (_, index) => {
          const value = shiftPeriod(currentPeriod(), 1 - index);
          return { key: value, label: formatPeriod(value) };
        })}
      />
    </SafeAreaView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: colors.primary, fontSize: fontSize.lg }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.text },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  rowLabel: { fontSize: fontSize.sm, color: colors.textMuted, flex: 1 },
  rowValue: { fontSize: fontSize.md, fontWeight: "800", color: colors.text },
});
