import React from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, DetailRow, Divider, EmptyState, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { deleteStudent, getStudent, markLeft, reinstate } from "@/services/students";
import { listFeesForStudent } from "@/services/fees";
import { formatInmateId } from "@/services/branches";
import { formatDate, formatMoney, formatPeriod } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "StudentDetail">;

export default function StudentDetailScreen({ navigation, route }: Props) {
  const { studentId } = route.params;
  const { settings, invalidate } = useApp();

  const { data, loading } = useAsyncData(async () => {
    const [student, fees] = await Promise.all([
      getStudent(studentId),
      listFeesForStudent(studentId),
    ]);
    return { student, fees };
  }, [studentId]);

  if (loading && !data) return <Loading />;

  const student = data?.student;
  if (!student) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState
          icon="person-outline"
          title="Student not found"
          message="This record may have been deleted."
        />
      </SafeAreaView>
    );
  }

  const fees = data?.fees ?? [];
  const outstanding = fees.reduce((sum, fee) => sum + Math.max(fee.balance, 0), 0);
  const symbol = settings.currencySymbol;

  const call = (number: string) => {
    if (!number.trim()) return;
    Linking.openURL(`tel:${number.replace(/\s/g, "")}`).catch(() => {
      Alert.alert("Could not place the call");
    });
  };

  const onMarkLeft = () => {
    Alert.alert(
      "Mark as left",
      `${student.fullName} will be moved out of ${
        student.roomLabel ? `room ${student.roomLabel}` : "the hostel"
      }. Their fee history is kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark as left",
          style: "destructive",
          onPress: async () => {
            await markLeft(studentId);
            invalidate();
            navigation.goBack();
          },
        },
      ]
    );
  };

  const onDelete = () => {
    Alert.alert(
      "Delete permanently?",
      `This removes ${student.fullName}, their photo and all ${fees.length} fee records. ` +
        "It cannot be undone. Consider 'Mark as left' instead.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteStudent(studentId);
            invalidate();
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar name={student.fullName} photoFile={student.photoFile} size={92} />
          <Text style={styles.name}>{student.fullName}</Text>
          <Text style={styles.meta}>
            {[student.course, student.year ? `Year ${student.year}` : null,
              formatInmateId(student.branchCode, student.admissionNo)]
              .filter(Boolean)
              .join("  ·  ") || "No course recorded"}
          </Text>
          <View style={styles.heroBadges}>
            <Badge
              label={student.status === "active" ? "ACTIVE" : "LEFT"}
              tone={student.status === "active" ? "success" : "neutral"}
            />
            {student.roomLabel ? <Badge label={`ROOM ${student.roomLabel}`} tone="info" /> : null}
            {outstanding > 0 ? (
              <Badge label={`DUE ${formatMoney(outstanding, symbol)}`} tone="danger" />
            ) : null}
          </View>
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            icon="call-outline"
            label="Call"
            disabled={!student.phone}
            onPress={() => call(student.phone)}
          />
          <ActionButton
            icon="logo-whatsapp"
            label="Message"
            disabled={!student.phone}
            onPress={() =>
              navigation.navigate("Compose", { kind: "custom", studentIds: [studentId] })
            }
          />
          <ActionButton
            icon="create-outline"
            label="Edit"
            onPress={() => navigation.navigate("StudentForm", { studentId })}
          />
          <ActionButton
            icon="receipt-outline"
            label="New bill"
            onPress={() => navigation.navigate("FeeForm", { studentId })}
          />
        </View>

        <SectionTitle title="Contact" />
        <Card>
          <DetailRow label="Mobile" value={student.phone} />
          <Divider />
          <DetailRow label="Email" value={student.email} />
          <Divider />
          <DetailRow label="Guardian" value={student.guardianName} />
          <Divider />
          <DetailRow label="Guardian mobile" value={student.guardianPhone} />
          <Divider />
          <DetailRow label="Address" value={student.address} />
        </Card>

        <SectionTitle title="Hostel" />
        <Card>
          <DetailRow label="Branch" value={student.branchName ?? "—"} />
          <Divider />
          <DetailRow label="Room" value={student.roomLabel ?? "Not assigned"} />
          <Divider />
          <DetailRow
            label="Monthly rent"
            value={student.monthlyRent > 0 ? formatMoney(student.monthlyRent, symbol) : "Not set"}
          />
          <Divider />
          <DetailRow
            label="Billing cycle"
            value={`${student.billingCycleDays || 30} days`}
          />
          <Divider />
          <DetailRow label="Joined on" value={formatDate(student.joinedOn)} />
          {student.leftOn ? (
            <>
              <Divider />
              <DetailRow label="Left on" value={formatDate(student.leftOn)} />
            </>
          ) : null}
          <Divider />
          <DetailRow label="ID proof" value={student.idProof} />
          {student.notes ? (
            <>
              <Divider />
              <DetailRow label="Notes" value={student.notes} />
            </>
          ) : null}
        </Card>

        <SectionTitle
          title={`Fees (${fees.length})`}
          action={
            <Pressable onPress={() => navigation.navigate("FeeForm", { studentId })}>
              <Text style={styles.link}>Add bill</Text>
            </Pressable>
          }
        />
        {fees.length === 0 ? (
          <Card>
            <Text style={styles.emptyFees}>No bills raised for this student yet.</Text>
          </Card>
        ) : (
          fees.map((fee) => (
            <Card
              key={fee.id}
              style={styles.feeRow}
              onPress={() => navigation.navigate("FeeDetail", { feeId: fee.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.feePeriod}>{formatPeriod(fee.period)}</Text>
                <Text style={styles.feeMeta}>
                  {formatMoney(fee.amountPaid, symbol)} of {formatMoney(fee.total, symbol)} paid
                </Text>
              </View>
              <Badge
                label={fee.status.toUpperCase()}
                tone={
                  fee.status === "paid" ? "success" : fee.status === "partial" ? "warning" : "danger"
                }
              />
            </Card>
          ))
        )}

        <SectionTitle title="Manage" />
        {student.status === "active" ? (
          <Button title="Mark as left" variant="secondary" icon="exit-outline" onPress={onMarkLeft} />
        ) : (
          <Button
            title="Reinstate student"
            variant="secondary"
            icon="refresh-outline"
            onPress={async () => {
              await reinstate(studentId);
              invalidate();
            }}
          />
        )}
        <Button
          title="Delete permanently"
          variant="danger"
          icon="trash-outline"
          onPress={onDelete}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  name: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.md,
    textAlign: "center",
  },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  heroBadges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  action: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md - 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  actionLabel: { fontSize: fontSize.xs, fontWeight: "700", color: colors.primary },
  link: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
  emptyFees: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  feeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  feePeriod: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  feeMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
