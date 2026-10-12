import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import { HIT_TARGET, colors, fontSize, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { getFee, OverpaymentError, recordPayment } from "@/services/fees";
import { PaymentMethod } from "@/types";
import { formatMoney, formatPeriod, toIsoDate } from "@/utils/format";
import { parseAmount } from "@/utils/validate";
import { successFeedback } from "@/utils/haptics";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CollectFee">;

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "upi", label: "UPI" },
  { key: "card", label: "Card" },
  { key: "bank", label: "Bank transfer" },
  { key: "cheque", label: "Cheque" },
];

export default function CollectFeeScreen({ navigation, route }: Props) {
  const { feeId } = route.params;
  const { settings, invalidate } = useApp();

  const { data: fee, loading } = useAsyncData(() => getFee(feeId), [feeId]);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(toIsoDate());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Default to settling the bill outright, which is the usual case.
  useEffect(() => {
    if (fee && amount === "") setAmount(String(Math.max(fee.balance, 0)));
  }, [fee, amount]);

  if (loading && !fee) return <Loading />;
  if (!fee) return null;

  const symbol = settings.currencySymbol;
  const entered = parseAmount(amount);
  const remaining = Math.max(fee.balance - entered, 0);

  const onSubmit = async () => {
    setError(null);
    if (entered <= 0) {
      setError("Enter the amount being paid.");
      return;
    }

    setSaving(true);
    try {
      await recordPayment(feeId, entered, method, paidOn, reference.trim(), note.trim());
      successFeedback();
      invalidate();
      navigation.goBack();
    } catch (e) {
      setError(
        e instanceof OverpaymentError ? e.message : "The payment could not be saved. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.summary}>
          <Text style={styles.inmate}>{fee.studentName}</Text>
          <Text style={styles.period}>
            {formatPeriod(fee.period)}
            {fee.roomLabel ? ` · Room ${fee.roomLabel}` : ""}
          </Text>
          <View style={styles.summaryRow}>
            <SummaryCell label="Total" value={formatMoney(fee.total, symbol)} />
            <SummaryCell label="Already paid" value={formatMoney(fee.amountPaid, symbol)} />
            <SummaryCell
              label="Balance"
              value={formatMoney(fee.balance, symbol)}
              tone={colors.danger}
            />
          </View>
        </Card>

        <SectionTitle title="Payment" />
        <Input
          label={`Amount being paid (${symbol})`}
          required
          value={amount}
          onChangeText={(text) => {
            setAmount(text);
            setError(null);
          }}
          keyboardType="numeric"
          icon="cash-outline"
          error={error ?? undefined}
        />

        <View style={styles.quickAmounts}>
          <QuickAmount label="Full balance" onPress={() => setAmount(String(fee.balance))} />
          <QuickAmount label="Half" onPress={() => setAmount(String(Math.round(fee.balance / 2)))} />
        </View>

        {entered > 0 && entered < fee.balance ? (
          <Text style={styles.remaining}>
            {formatMoney(remaining, symbol)} will still be outstanding after this.
          </Text>
        ) : null}

        <PickerField
          label="Method"
          icon="card-outline"
          value={METHODS.find((m) => m.key === method)?.label ?? null}
          placeholder="Choose"
          onPress={() => setMethodPickerOpen(true)}
        />

        <Input
          label="Paid on"
          value={paidOn}
          onChangeText={setPaidOn}
          placeholder="YYYY-MM-DD"
          icon="calendar-outline"
        />
        <Input
          label="Reference"
          value={reference}
          onChangeText={setReference}
          placeholder="UPI ref, cheque no, etc."
          icon="pricetag-outline"
        />
        <Input
          label="Note"
          value={note}
          onChangeText={setNote}
          placeholder="optional"
          multiline
        />

        <Button
          title={`Record ${formatMoney(entered, symbol)}`}
          onPress={onSubmit}
          loading={saving}
          disabled={entered <= 0}
        />
      </ScrollView>

      <OptionPicker
        visible={methodPickerOpen}
        title="Payment method"
        selectedKey={method}
        onClose={() => setMethodPickerOpen(false)}
        onSelect={(key) => setMethod(key as PaymentMethod)}
        options={METHODS.map((m) => ({ key: m.key, label: m.label }))}
      />
    </SafeAreaView>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function QuickAmount({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  summary: { marginBottom: spacing.lg },
  inmate: { ...type.section, color: colors.text },
  period: { ...type.support, color: colors.textMuted, marginTop: 2 },
  summaryRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm },
  cellLabel: { ...type.caption, color: colors.textMuted },
  cellValue: { ...type.metricSmall, color: colors.text, marginTop: 2 },
  quickAmounts: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, marginTop: -8 },
  chip: {
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    minHeight: HIT_TARGET - 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  chipText: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.primary },
  remaining: {
    ...type.support,
    color: colors.warning,
    marginBottom: spacing.md,
    marginTop: -4,
  },
});
