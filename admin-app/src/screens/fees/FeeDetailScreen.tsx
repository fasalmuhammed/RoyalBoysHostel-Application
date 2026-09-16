import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, DetailRow, Divider, EmptyState, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { colors, radius, scaleFont, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { deleteFee, deletePayment, getFee, listPayments } from "@/services/fees";
import { formatDate, formatMoney, formatPeriod } from "@/utils/format";
import { receiptHtml } from "@/utils/receipt";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "FeeDetail">;

export default function FeeDetailScreen({ navigation, route }: Props) {
  const { feeId } = route.params;
  const { settings, invalidate, activeBranch } = useApp();

  const { data, loading, reload } = useAsyncData(async () => {
    const [fee, payments] = await Promise.all([getFee(feeId), listPayments(feeId)]);
    return { fee, payments };
  }, [feeId]);

  if (loading && !data) return <Loading />;

  const fee = data?.fee;
  if (!fee) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState icon="receipt-outline" title="Bill not found" />
      </SafeAreaView>
    );
  }

  const payments = data?.payments ?? [];
  const symbol = settings.currencySymbol;

  const shareReceipt = async () => {
    try {
      const html = receiptHtml({
        hostelName: activeBranch?.name ?? settings.hostelName,
        currencySymbol: symbol,
        fee,
        payments,
      });
      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Receipt — ${fee.studentName}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Receipt saved", `The PDF was written to:\n${uri}`);
      }
    } catch {
      Alert.alert("Could not create the receipt", "Please try again.");
    }
  };

  const onDeleteBill = () => {
    Alert.alert(
      "Delete this bill?",
      payments.length > 0
        ? `${payments.length} recorded payment(s) will be deleted with it. This cannot be undone.`
        : "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteFee(feeId);
            invalidate();
            navigation.goBack();
          },
        },
      ]
    );
  };

  const onDeletePayment = (paymentId: string, amount: number) => {
    Alert.alert(
      "Remove this payment?",
      `${formatMoney(amount, symbol)} will be added back to the outstanding balance.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deletePayment(paymentId);
            invalidate();
            reload();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card
          style={styles.studentCard}
          onPress={() => navigation.navigate("InmateDetail", { studentId: fee.studentId })}
        >
          <Avatar name={fee.studentName} photoFile={fee.photoFile} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{fee.studentName}</Text>
            <Text style={styles.studentMeta}>
              {fee.roomLabel ? `Room ${fee.roomLabel} · ` : ""}
              {fee.admissionNo || "No admission no"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            {fee.balance > 0 ? "Outstanding balance" : "Fully paid"}
          </Text>
          <Text style={styles.balanceValue}>
            {formatMoney(Math.max(fee.balance, 0), symbol)}
          </Text>
          <View style={styles.balanceMeta}>
            <View style={styles.balanceBadges}>
              <Badge
                label={fee.status.toUpperCase()}
                tone={
                  fee.status === "paid" ? "success" : fee.status === "partial" ? "warning" : "danger"
                }
              />
              {fee.admissionType === "stay" ? <Badge label="STAY" tone="info" /> : null}
            </View>
            <Text style={styles.balancePeriod}>{formatPeriod(fee.period)}</Text>
          </View>
        </View>

        {fee.balance > 0 ? (
          <Button
            title="Collect payment"
            icon="cash-outline"
            onPress={() => navigation.navigate("CollectFee", { feeId })}
          />
        ) : null}

        <SectionTitle title="Breakdown" />
        <Card>
          <DetailRow label="Room rent" value={formatMoney(fee.rent, symbol)} />
          <Divider />
          <DetailRow label="Electricity" value={formatMoney(fee.electricity, symbol)} />
          <Divider />
          <DetailRow label="Water" value={formatMoney(fee.water, symbol)} />
          <Divider />
          <DetailRow label="Other charges" value={formatMoney(fee.other, symbol)} />
          {fee.discount > 0 ? (
            <>
              <Divider />
              <DetailRow label="Discount" value={`- ${formatMoney(fee.discount, symbol)}`} />
            </>
          ) : null}
          <Divider />
          <DetailRow label="Total" value={formatMoney(fee.total, symbol)} />
          <Divider />
          <DetailRow label="Paid" value={formatMoney(fee.amountPaid, symbol)} tone="success" />
          <Divider />
          <DetailRow label="Due date" value={formatDate(fee.dueDate)} />
          {fee.note ? (
            <>
              <Divider />
              <DetailRow label="Note" value={fee.note} />
            </>
          ) : null}
        </Card>

        <SectionTitle title={`Payments (${payments.length})`} />
        {payments.length === 0 ? (
          <Card>
            <Text style={styles.empty}>Nothing collected against this bill yet.</Text>
          </Card>
        ) : (
          payments.map((payment) => (
            <Card key={payment.id} style={styles.paymentRow}>
              <View style={styles.paymentIcon}>
                <Ionicons name="checkmark" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentAmount}>{formatMoney(payment.amount, symbol)}</Text>
                <Text style={styles.paymentMeta}>
                  {formatDate(payment.paidOn)} · {payment.method.toUpperCase()}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </Text>
              </View>
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={colors.textFaint}
                onPress={() => onDeletePayment(payment.id, payment.amount)}
              />
            </Card>
          ))
        )}

        <SectionTitle title="Actions" />
        <Button
          title="Download Receipt"
          variant="secondary"
          icon="share-outline"
          onPress={shareReceipt}
        />
        <Button
          title="Send WhatsApp reminder"
          variant="secondary"
          icon="logo-whatsapp"
          onPress={() =>
            navigation.navigate("Compose", { kind: "fee_reminder", feeIds: [feeId] })
          }
          style={{ marginTop: spacing.sm }}
        />
        <Button
          title="Edit bill"
          variant="secondary"
          icon="create-outline"
          onPress={() => navigation.navigate("FeeForm", { feeId })}
          style={{ marginTop: spacing.sm }}
        />
        <Button
          title="Delete bill"
          variant="danger"
          icon="trash-outline"
          onPress={onDeleteBill}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  studentCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  studentName: { ...type.bodyStrong, color: colors.text },
  studentMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  balanceLabel: { ...type.support, color: "rgba(255,255,255,0.85)" },
  balanceValue: {
    ...type.display,
    fontSize: scaleFont(34),
    lineHeight: scaleFont(40),
    color: colors.primaryOn,
    marginTop: spacing.xs,
  },
  balanceMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  balanceBadges: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  balancePeriod: {
    ...type.support,
    fontFamily: type.bodyStrong.fontFamily,
    color: "rgba(255,255,255,0.9)",
  },
  empty: { ...type.support, color: colors.textMuted, textAlign: "center" },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  paymentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentAmount: { ...type.bodyStrong, color: colors.text },
  paymentMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
