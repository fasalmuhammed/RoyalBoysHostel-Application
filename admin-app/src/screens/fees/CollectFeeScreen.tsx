import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import FormScroll from "@/components/FormScroll";
import { Alert } from "@/web/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import PromiseDateField from "@/components/PromiseDateField";
import { HIT_TARGET, colors, fontSize, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { getFee, OverpaymentError, promiseDateProblem, recordPayment } from "@/services/fees";
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
  // For a part payment: the day they said they will pay the rest.
  const [promisedDate, setPromisedDate] = useState("");
  const [promiseError, setPromiseError] = useState<string | null>(null);

  // An earlier promise that is still ahead is the starting answer.
  useEffect(() => {
    if (fee?.promisedDate && !promiseDateProblem(fee.promisedDate)) setPromisedDate((now) => now || (fee.promisedDate ?? ""));
  }, [fee]);

  // Starts at the full balance, the usual case -- once only, so clearing the
  // box to type a different amount leaves it empty.
  const prefilled = useRef(false);
  useEffect(() => {
    if (fee && !prefilled.current) {
      prefilled.current = true;
      setAmount(String(Math.max(fee.balance, 0)));
    }
  }, [fee]);

  if (loading && !fee) return <Loading />;
  if (!fee) return null;

  const symbol = settings.currencySymbol;
  const entered = parseAmount(amount);
  const remaining = Math.max(fee.balance - entered, 0);
  const partial = entered > 0 && remaining > 0.01;

  const onSubmit = async () => {
    setError(null);
    if (entered <= 0) {
      setError("Enter the amount being paid.");
      return;
    }
    // Part paid: the rest needs a date, so someone knows when to ask again.
    const problem = partial ? promiseDateProblem(promisedDate) : null;
    setPromiseError(problem);
    if (problem) return;

    setSaving(true);
    try {
      await recordPayment(feeId, entered, method, paidOn, reference.trim(), note.trim(), partial ? promisedDate : null);
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
      <FormScroll
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
          placeholder="Type the amount being paid"
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
          {/* Any smaller amount: empties the box to type what they are paying. */}
          <QuickAmount label="Part payment" onPress={() => setAmount("")} />
        </View>

        {partial ? (
          <View style={styles.promise}>
            <View style={styles.promiseHead}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.promiseTitle}>Part payment · {formatMoney(remaining, symbol)} left</Text>
                <Text style={styles.promiseHint}>When will they pay the rest?</Text>
              </View>
            </View>
            <PromiseDateField
              value={promisedDate}
              onChange={(iso) => {
                setPromisedDate(iso);
                setPromiseError(null);
              }}
              error={promiseError ?? undefined}
            />
          </View>
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
          title={partial ? `Record part payment of ${formatMoney(entered, symbol)}` : `Record ${formatMoney(entered, symbol)}`}
          onPress={onSubmit}
          loading={saving}
          disabled={entered <= 0}
        />
      </FormScroll>

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
  promise: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: 0,
    marginBottom: spacing.md,
  },
  promiseHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  promiseTitle: { ...type.bodyStrong, color: colors.text },
  promiseHint: { ...type.support, color: colors.textMuted, marginTop: 1 },
  remaining: {
    ...type.support,
    color: colors.warning,
    marginBottom: spacing.md,
    marginTop: -4,
  },
});
