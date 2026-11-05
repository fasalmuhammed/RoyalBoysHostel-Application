import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import FormScroll from "@/components/FormScroll";
import { Alert } from "@/web/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { DateInput, PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import { colors, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import {
  billingDayOf,
  createFee,
  currentPeriod,
  DuplicateInvoiceError,
  dueDateFor,
  getFee,
  updateFee,
} from "@/services/fees";
import { getInmate, listInmates } from "@/services/inmates";
import { formatMoney, formatPeriod, shiftPeriod } from "@/utils/format";
import { parseAmount } from "@/utils/validate";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "FeeForm">;

export default function FeeFormScreen({ navigation, route }: Props) {
  const feeId = route.params?.feeId;
  const isEditing = Boolean(feeId);
  const { settings, invalidate } = useApp();

  const [studentId, setStudentId] = useState<string | null>(route.params?.studentId ?? null);
  const [inmateName, setInmateName] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [rent, setRent] = useState("");
  const [electricity, setElectricity] = useState("");
  const [water, setWater] = useState("");
  const [other, setOther] = useState("");
  const [discount, setDiscount] = useState("");
  const [anchorDay, setAnchorDay] = useState(1);
  const [dueDate, setDueDate] = useState(dueDateFor(currentPeriod()));
  const [note, setNote] = useState("");

  const [inmatePickerOpen, setInmatePickerOpen] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: inmates } = useAsyncData(() => listInmates("", "active"), []);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit bill" : "New bill" });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!feeId) return;
    (async () => {
      const fee = await getFee(feeId);
      if (!fee) return;
      setStudentId(fee.studentId);
      setInmateName(fee.studentName);
      setPeriod(fee.period);
      setRent(String(fee.rent));
      setElectricity(String(fee.electricity));
      setWater(String(fee.water));
      setOther(String(fee.other));
      setDiscount(String(fee.discount));
      setDueDate(fee.dueDate);
      setNote(fee.note);
    })();
  }, [feeId]);

  // Pre-fill from the inmate's own agreed terms, falling back to their room's
  // rent for records created before rent moved onto the inmate.
  useEffect(() => {
    if (isEditing || !studentId) return;
    (async () => {
      const inmate = await getInmate(studentId);
      if (!inmate) return;
      setInmateName(inmate.fullName);
      setRent(String(inmate.monthlyRent > 0 ? inmate.monthlyRent : (inmate.roomRent ?? 0)));
      const anchor = billingDayOf(inmate);
      setAnchorDay(anchor);
      setDueDate(dueDateFor(period, anchor));
    })();
  }, [studentId, isEditing, period]);

  const total = Math.max(
    parseAmount(rent) + parseAmount(electricity) + parseAmount(water) + parseAmount(other) -
      parseAmount(discount),
    0
  );

  const onSave = async () => {
    if (!studentId) {
      setError("Choose a inmate.");
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const payload = {
        studentId,
        period,
        rent: parseAmount(rent),
        electricity: parseAmount(electricity),
        water: parseAmount(water),
        other: parseAmount(other),
        discount: parseAmount(discount),
        dueDate,
        note: note.trim(),
      };

      if (feeId) await updateFee(feeId, payload);
      else await createFee(payload);

      invalidate();
      navigation.goBack();
    } catch (e) {
      if (e instanceof DuplicateInvoiceError) setError(e.message);
      else Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const symbol = settings.currencySymbol;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <FormScroll
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title="Who and when" />
        <PickerField
          label="Inmate"
          required
          icon="person-outline"
          value={inmateName}
          placeholder="Choose a inmate"
          onPress={() => setInmatePickerOpen(true)}
          error={error ?? undefined}
        />
        <PickerField
          label="Billing month"
          icon="calendar-outline"
          value={formatPeriod(period)}
          placeholder="Choose"
          onPress={() => setPeriodPickerOpen(true)}
        />
        <DateInput label="Due date" value={dueDate} onChange={setDueDate} icon="alarm-outline" />

        <SectionTitle title="Charges" />
        <Input
          label={`Room rent (${symbol})`}
          value={rent}
          onChangeText={setRent}
          keyboardType="numeric"
          placeholder="0"
        />
        <View style={styles.pair}>
          <Input
            label={`Electricity (${symbol})`}
            value={electricity}
            onChangeText={setElectricity}
            keyboardType="numeric"
            placeholder="0"
            containerStyle={{ flex: 1 }}
          />
          <Input
            label={`Water (${symbol})`}
            value={water}
            onChangeText={setWater}
            keyboardType="numeric"
            placeholder="0"
            containerStyle={{ flex: 1 }}
          />
        </View>
        <View style={styles.pair}>
          <Input
            label={`Other (${symbol})`}
            value={other}
            onChangeText={setOther}
            keyboardType="numeric"
            placeholder="0"
            containerStyle={{ flex: 1 }}
          />
          <Input
            label={`Discount (${symbol})`}
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
            placeholder="0"
            containerStyle={{ flex: 1 }}
          />
        </View>

        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total payable</Text>
          <Text style={styles.totalValue}>{formatMoney(total, symbol)}</Text>
        </Card>

        <Input
          label="Note"
          value={note}
          onChangeText={setNote}
          placeholder="optional"
          multiline
        />

        <Button
          title={isEditing ? "Save changes" : "Create bill"}
          onPress={onSave}
          loading={saving}
        />
      </FormScroll>

      <OptionPicker
        visible={inmatePickerOpen}
        title="Choose a inmate"
        selectedKey={studentId}
        onClose={() => setInmatePickerOpen(false)}
        onSelect={(key) => {
          setStudentId(key);
          setError(null);
        }}
        emptyMessage="No active inmates yet."
        options={(inmates ?? []).map((inmate) => ({
          key: inmate.id,
          label: inmate.fullName,
          sublabel: inmate.roomLabel ? `Room ${inmate.roomLabel}` : "No room assigned",
        }))}
      />

      <OptionPicker
        visible={periodPickerOpen}
        title="Billing month"
        selectedKey={period}
        onClose={() => setPeriodPickerOpen(false)}
        onSelect={(value) => {
          setPeriod(value);
          setDueDate(dueDateFor(value, anchorDay));
        }}
        options={Array.from({ length: 14 }, (_, index) => {
          const value = shiftPeriod(currentPeriod(), 1 - index);
          return { key: value, label: formatPeriod(value) };
        })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  pair: { flexDirection: "row", gap: spacing.md },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primaryLight,
  },
  totalLabel: { ...type.bodyStrong, color: colors.primary },
  totalValue: { ...type.title, color: colors.primary },
});
