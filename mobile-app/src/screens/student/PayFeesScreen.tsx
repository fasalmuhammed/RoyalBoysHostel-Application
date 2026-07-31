import React, { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { HOSTEL_UPI_ID, submitPayment, subscribeStudentPayments } from "@/services/payments";
import { Payment } from "@/types";
import Input from "@/components/Input";
import Button from "@/components/Button";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import ScreenHeader from "@/components/ScreenHeader";
import { colors, fontSize, spacing } from "@/constants/theme";

export default function PayFeesScreen() {
  const { user } = useAuth();
  const [transactionId, setTransactionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeStudentPayments(user.uid, setPayments);
  }, [user]);

  const onSubmit = async () => {
    if (!user || !transactionId) return;
    setLoading(true);
    try {
      await submitPayment(user.uid, user.name, transactionId);
      setTransactionId("");
      Alert.alert("Submitted", "We will confirm your payment shortly. Thank you!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View>
            <ScreenHeader title="Pay Fees" subtitle="Pay your hostel fees via UPI" />
            <Card>
              <Text style={styles.upiLabel}>Pay to UPI ID</Text>
              <Text style={styles.upiId}>{HOSTEL_UPI_ID}</Text>
            </Card>
            <Input label="Transaction ID" placeholder="e.g. 123456789012" value={transactionId} onChangeText={setTransactionId} />
            <Button title="Submit Payment Proof" onPress={onSubmit} loading={loading} disabled={!transactionId} />
            <Text style={styles.historyTitle}>Payment History</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <Badge label={item.status.toUpperCase()} tone={item.status === "confirmed" ? "success" : "warning"} />
            <Text style={styles.txn}>Txn ID: {item.transactionId}</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
          </Card>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  upiLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  upiId: { fontSize: fontSize.lg, fontWeight: "700", color: colors.primary, marginTop: spacing.xs },
  historyTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  txn: { fontSize: fontSize.md, color: colors.text, marginTop: spacing.sm },
  date: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
});
