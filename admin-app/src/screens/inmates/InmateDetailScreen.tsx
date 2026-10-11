import React, { useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, DetailRow, Divider, EmptyState, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Avatar from "@/components/Avatar";
import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { FadeIn, PressableScale } from "@/components/Motion";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { deleteInmate, getInmate, markLeft, reinstate } from "@/services/inmates";
import { listFeesForStudent } from "@/services/fees";
import { savePhotoToDevice, usePhotoUri } from "@/services/photos";
import PhotoViewer, { ViewedPhoto } from "@/components/PhotoViewer";
import { formatInmateId } from "@/services/branches";
import { formatDate, formatMoney, formatPeriod, relativeDays } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "InmateDetail">;

export default function InmateDetailScreen({ navigation, route }: Props) {
  const { studentId } = route.params;
  const { settings, invalidate } = useApp();

  const { data, loading, reload } = useAsyncData(async () => {
    const [inmate, fees] = await Promise.all([getInmate(studentId), listFeesForStudent(studentId)]);
    return { inmate, fees };
  }, [studentId]);

  // Which photo is open full screen, if any.
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null);

  if (loading && !data) return <Loading />;

  const inmate = data?.inmate;
  if (!inmate) {
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState
          icon="person-outline"
          title="Inmate not found"
          message="This record may have been deleted."
        />
      </SafeAreaView>
    );
  }

  const fees = data?.fees ?? [];
  const outstanding = fees.reduce((sum, fee) => sum + Math.max(fee.balance, 0), 0);
  const oldestDue = fees
    .filter((fee) => fee.balance > 0.01 && fee.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
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
      `${inmate.fullName} will be moved out of ${
        inmate.roomLabel ? `room ${inmate.roomLabel}` : "the hostel"
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

  const saveName = (label: string) => `${inmate?.fullName ?? "inmate"} ${label}`;

  const downloadImage = async (fileName: string | null, label: string) => {
    if (!fileName) return;
    try {
      await savePhotoToDevice(fileName, saveName(label));
    } catch (error) {
      Alert.alert("Could not download", error instanceof Error ? error.message : "Try again.");
    }
  };
  const openImage = (fileName: string | null, label: string) => {
    if (fileName) setViewing({ file: fileName, label, saveAs: saveName(label) });
  };

  const onDelete = () => {
    Alert.alert(
      "Delete permanently?",
      `This removes ${inmate.fullName}, their photo and all ${fees.length} fee records. ` +
        "It cannot be undone. Consider 'Mark as left' instead.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteInmate(studentId);
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
        <FadeIn>
          <View style={styles.hero}>
            <Avatar name={inmate.fullName} photoFile={inmate.photoFile} size={84} />
            <Text style={styles.name} numberOfLines={2}>
              {inmate.fullName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[
                formatInmateId(inmate.branchCode, inmate.admissionNo),
                inmate.course,
                inmate.year ? `Year ${inmate.year}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
            <View style={styles.heroBadges}>
              <Badge
                label={inmate.status === "active" ? "ACTIVE" : "LEFT"}
                tone={inmate.status === "active" ? "success" : "neutral"}
              />
              {inmate.roomLabel ? <Badge label={`ROOM ${inmate.roomLabel}`} tone="info" /> : null}
              {inmate.admissionType === "stay" ? (
                <Badge label={`${inmate.stayDays ?? "?"}-DAY STAY`} tone="neutral" />
              ) : null}
            </View>
          </View>
        </FadeIn>

        {/*
          Money before biography. Whether this person owes anything is the
          question the profile is usually opened to answer, so it sits above
          the contact details rather than below the fold.
        */}
        <FadeIn index={1}>
          <View style={[styles.balanceCard, outstanding <= 0.01 && styles.balanceCardClear]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>
                {outstanding > 0.01 ? "OUTSTANDING" : "ACCOUNT"}
              </Text>
              <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>
                {outstanding > 0.01 ? formatMoney(outstanding, symbol) : "All settled"}
              </Text>
              {oldestDue ? (
                <Text style={styles.balanceNote} numberOfLines={1}>
                  Oldest bill due {relativeDays(oldestDue.dueDate)}
                </Text>
              ) : null}
            </View>
            {oldestDue ? (
              <Button
                title="Collect"
                icon="cash-outline"
                compact
                onPress={() => navigation.navigate("CollectFee", { feeId: oldestDue.id })}
              />
            ) : null}
          </View>
        </FadeIn>

        <View style={styles.actionRow}>
          <ActionButton
            icon="call-outline"
            label="Call"
            disabled={!inmate.phone}
            onPress={() => call(inmate.phone)}
          />
          <ActionButton
            icon="logo-whatsapp"
            label="Message"
            disabled={!inmate.phone}
            onPress={() => navigation.navigate("Compose", { kind: "custom", studentIds: [studentId] })}
          />
          <ActionButton
            icon="create-outline"
            label="Edit"
            onPress={() => navigation.navigate("InmateForm", { studentId })}
          />
          <ActionButton
            icon="receipt-outline"
            label="New bill"
            onPress={() => navigation.navigate("FeeForm", { studentId })}
          />
        </View>

        <SectionTitle title="Contact" />
        <Card>
          <DetailRow label="Mobile" value={inmate.phone} />
          <Divider />
          <DetailRow label="Email" value={inmate.email} />
          <Divider />
          <DetailRow label="Guardian" value={inmate.guardianName} />
          <Divider />
          <DetailRow label="Guardian mobile" value={inmate.guardianPhone} />
          <Divider />
          <DetailRow label="Emergency contact" value={inmate.emergencyPhone} />
          <Divider />
          <DetailRow label="College / company" value={inmate.institution} />
          <Divider />
          <DetailRow label="Blood group" value={inmate.bloodGroup} />
          <Divider />
          <DetailRow label="Address" value={inmate.address} />
        </Card>

        <SectionTitle title="Hostel" />
        <Card>
          <DetailRow label="Branch" value={inmate.branchName ?? "—"} />
          <Divider />
          <DetailRow label="Room" value={inmate.roomLabel ?? "Not assigned"} />
          <Divider />
          <DetailRow
            label="Billing"
            value={
              inmate.admissionType === "stay" ? `Fixed ${inmate.stayDays ?? "?"} days` : "Monthly"
            }
          />
          <Divider />
          <DetailRow
            label={inmate.admissionType === "stay" ? "Rent for the stay" : "Monthly rent"}
            value={inmate.monthlyRent > 0 ? formatMoney(inmate.monthlyRent, symbol) : "Not set"}
          />
          {inmate.admissionType === "monthly" ? (
            <>
              <Divider />
              <DetailRow
                label="Bills due"
                value={`Day ${Number(inmate.joinedOn.slice(8, 10)) || 1} of each month`}
              />
            </>
          ) : null}
          <Divider />
          <DetailRow label="Joined on" value={formatDate(inmate.joinedOn)} />
          {inmate.leftOn ? (
            <>
              <Divider />
              <DetailRow label="Left on" value={formatDate(inmate.leftOn)} />
            </>
          ) : null}
          {/* Only shown for older records typed before ID proof became a photo. */}
          {!inmate.idProofFile && !inmate.idProofBackFile && inmate.idProof ? (
            <>
              <Divider />
              <DetailRow label="ID proof" value={inmate.idProof} />
            </>
          ) : null}
          {inmate.notes ? (
            <>
              <Divider />
              <DetailRow label="Notes" value={inmate.notes} />
            </>
          ) : null}
        </Card>

        <SectionTitle title="Documents" />
        <Card>
          <DocumentRow
            label="Profile photo"
            fileName={inmate.photoFile}
            onDownload={() => downloadImage(inmate.photoFile, "profile photo")}
            onOpen={() => openImage(inmate.photoFile, "Profile photo")}
          />
          <Divider />
          <DocumentRow
            label="Aadhaar front"
            fileName={inmate.idProofFile}
            onDownload={() => downloadImage(inmate.idProofFile, "Aadhaar front")}
            onOpen={() => openImage(inmate.idProofFile, "Aadhaar front")}
          />
          <Divider />
          <DocumentRow
            label="Aadhaar back"
            fileName={inmate.idProofBackFile}
            onDownload={() => downloadImage(inmate.idProofBackFile, "Aadhaar back")}
            onOpen={() => openImage(inmate.idProofBackFile, "Aadhaar back")}
          />
        </Card>

        <SectionTitle
          title={`Bills (${fees.length})`}
          action={
            <PressableScale
              scaleTo={0.95}
              onPress={() => navigation.navigate("FeeForm", { studentId })}
            >
              <Text style={styles.link}>Add bill</Text>
            </PressableScale>
          }
        />
        {fees.length === 0 ? (
          <Card>
            <Text style={styles.emptyFees}>No bills raised for this inmate yet.</Text>
          </Card>
        ) : (
          fees.map((fee, index) => (
            <FadeIn key={fee.id} index={index}>
              <Card
                style={styles.feeRow}
                onPress={() => navigation.navigate("FeeDetail", { feeId: fee.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.feePeriod}>{formatPeriod(fee.period)}</Text>
                  <Text style={styles.feeMeta}>
                    {formatMoney(fee.amountPaid, symbol)} of {formatMoney(fee.total, symbol)} paid
                  </Text>
                </View>
                {fee.status === "paid" ? (
                  <Badge label="PAID" tone="success" />
                ) : (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.feeBalance}>{formatMoney(fee.balance, symbol)}</Text>
                    <Text style={styles.feeBalanceLabel}>
                      {fee.status === "partial" ? "still due" : "due"}
                    </Text>
                  </View>
                )}
              </Card>
            </FadeIn>
          ))
        )}

        <SectionTitle title="Manage" />
        {inmate.status === "active" ? (
          <Button title="Mark as left" variant="secondary" icon="exit-outline" onPress={onMarkLeft} />
        ) : (
          <Button
            title="Reinstate inmate"
            variant="secondary"
            icon="refresh-outline"
            onPress={async () => {
              await reinstate(studentId);
              invalidate();
              reload();
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
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </SafeAreaView>
  );
}

function DocumentRow({
  label,
  fileName,
  onDownload,
  onOpen,
}: {
  label: string;
  fileName: string | null;
  onDownload: () => void;
  onOpen: () => void;
}) {
  const uri = usePhotoUri(fileName);
  return (
    <Pressable style={styles.documentRow} onPress={onOpen} disabled={!uri} accessibilityRole="button">
      {uri ? (
        <Image source={{ uri }} style={styles.documentThumb} />
      ) : (
        <View style={styles.documentThumbPlaceholder}>
          <Ionicons name="image-outline" size={20} color={colors.textFaint} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.documentLabel}>{label}</Text>
        <Text style={styles.documentMeta}>{uri ? "Tap to open" : "Not added"}</Text>
      </View>
      {uri ? (
        <PressableScale onPress={onDownload} scaleTo={0.9} style={styles.documentAction}>
          <Ionicons name="download-outline" size={20} color={colors.primary} />
        </PressableScale>
      ) : null}
    </Pressable>
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
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={disabled ? [styles.action, styles.actionDisabled] : styles.action}
    >
      <Ionicons name={icon} size={19} color={colors.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },

  hero: { alignItems: "center", marginBottom: spacing.md },
  name: { ...type.title, color: colors.text, marginTop: spacing.sm, textAlign: "center" },
  meta: { ...type.support, color: colors.textMuted, marginTop: 2 },
  heroBadges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  balanceCardClear: { backgroundColor: colors.successBg },
  balanceLabel: { ...type.label, color: colors.textMuted },
  balanceValue: { ...type.metric, color: colors.text, marginTop: 2 },
  balanceNote: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  actionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  action: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: HIT_TARGET + 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  actionDisabled: { opacity: 0.35 },
  actionLabel: { ...type.caption, color: colors.primary },

  link: { ...type.bodyStrong, color: colors.primary },
  emptyFees: { ...type.support, color: colors.textMuted, textAlign: "center" },

  feeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  feePeriod: { ...type.bodyStrong, color: colors.text },
  feeMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  feeBalance: { ...type.metricSmall, color: colors.danger },
  feeBalanceLabel: { ...type.caption, color: colors.textFaint },

  documentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  documentThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  documentThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  documentLabel: { ...type.bodyStrong, color: colors.text },
  documentMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  documentAction: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
});
