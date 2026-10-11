import React, { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, DetailRow, Divider, EmptyState, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { approveApplication, getApplication, rejectApplication } from "@/services/admissions";
import { formatRoomLabel, listRooms } from "@/services/rooms";
import { usePhotoUri } from "@/services/photos";
import { formatDateTime } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "AdmissionReview">;

/** One student's form: check it against their Aadhaar, pick the room, admit. */
export default function AdmissionReviewScreen({ navigation, route }: Props) {
  const { applicationId } = route.params;
  const { dataVersion, settings } = useApp();
  // Read on every refresh, so a form handled on another phone closes here too.
  const application = React.useMemo(() => getApplication(applicationId), [applicationId, dataVersion]);
  const { data: rooms } = useAsyncData(() => listRooms(), [dataVersion]);

  const [roomId, setRoomId] = useState<string | null>(application?.roomId ?? null);
  const [rent, setRent] = useState("");
  const [rentTouched, setRentTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const room = rooms?.find((r) => r.id === roomId) ?? null;

  // The room's rent is the starting figure until someone types another.
  useEffect(() => {
    if (!rentTouched && room) setRent(room.rent ? String(room.rent) : "");
  }, [room, rentTouched]);

  if (!application) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
        <EmptyState
          icon="checkmark-done-outline"
          title="Already handled"
          message="This form was approved or rejected, here or on another device."
          action={<Button title="Back to admissions" compact onPress={() => navigation.goBack()} />}
        />
      </SafeAreaView>
    );
  }

  const onApprove = async () => {
    const amount = Number(rent.replace(/[^\d.]/g, "")) || 0;
    setBusy("approve");
    setError(null);
    try {
      const studentId = await approveApplication(application.id, { roomId, monthlyRent: amount });
      navigation.replace("InmateDetail", { studentId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not admit this student. Try again.");
      setBusy(null);
    }
  };

  const onReject = () => {
    Alert.alert(
      `Reject ${application.fullName}'s form?`,
      "The form and its photos are deleted. The student can fill it in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setBusy("reject");
            try {
              await rejectApplication(application.id);
              navigation.goBack();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not reject this form. Try again.");
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Avatar name={application.fullName} photoFile={application.photoFile} size={76} />
          <Text style={styles.name}>{application.fullName}</Text>
          <Text style={styles.sent}>Sent {formatDateTime(application.createdAt)}</Text>
        </View>

        <SectionTitle title="Their details" />
        <Card>
          <DetailRow label="Mobile" value={application.phone} />
          <Divider />
          <DetailRow label="Email" value={application.email} />
          <Divider />
          <DetailRow label="College / company" value={application.institution} />
          <Divider />
          <DetailRow label="Course" value={[application.course, application.year].filter(Boolean).join(" · ")} />
          <Divider />
          <DetailRow label="Blood group" value={application.bloodGroup} />
          <Divider />
          <DetailRow label="Address" value={application.address} />
        </Card>

        <SectionTitle title="Family and emergency" />
        <Card>
          <DetailRow label="Guardian" value={application.guardianName} />
          <Divider />
          <DetailRow label="Guardian mobile" value={application.guardianPhone} />
          <Divider />
          <DetailRow label="Emergency contact" value={application.emergencyPhone} />
        </Card>

        <SectionTitle title="Aadhaar card" />
        <View style={styles.documents}>
          <DocumentImage label="Front" file={application.idProofFile} />
          <DocumentImage label="Back" file={application.idProofBackFile} />
        </View>

        <SectionTitle title="Admit to" />
        <PickerField
          label="Room"
          value={room ? `Room ${formatRoomLabel(room)} · ${room.vacant} free` : null}
          placeholder="No room yet"
          onPress={() => setPicking(true)}
          icon="bed-outline"
        />
        <Input
          label={`Monthly rent (${settings.currencySymbol})`}
          value={rent}
          onChangeText={(t) => {
            setRentTouched(true);
            setRent(t.replace(/[^\d]/g, ""));
          }}
          keyboardType="number-pad"
          placeholder="0"
          icon="cash-outline"
          hint="The first bill is raised as soon as you approve."
        />

        {error ? (
          <Callout tone="danger" icon="alert-circle-outline">
            <CalloutText>{error}</CalloutText>
          </Callout>
        ) : null}

        <Button title="Approve and admit" icon="checkmark-circle-outline" onPress={onApprove} loading={busy === "approve"} disabled={busy !== null} />
        <View style={{ height: spacing.sm }} />
        <Button title="Reject this form" variant="ghost" onPress={onReject} loading={busy === "reject"} disabled={busy !== null} />
      </ScrollView>

      <OptionPicker
        visible={picking}
        title="Choose a room"
        options={[
          { key: "", label: "No room yet", sublabel: "Admit now, allot a bed later" },
          ...(rooms ?? []).map((r) => ({
            key: r.id,
            label: `Room ${formatRoomLabel(r)}`,
            sublabel: r.vacant > 0 ? `${r.vacant} of ${r.capacity} free` : "Full",
            disabled: r.vacant <= 0,
          })),
        ]}
        selectedKey={roomId ?? ""}
        onSelect={(key) => setRoomId(key || null)}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

function DocumentImage({ label, file }: { label: string; file: string | null }) {
  const uri = usePhotoUri(file);
  return (
    <View style={styles.document}>
      {uri ? (
        <Image source={{ uri }} style={styles.documentImage} resizeMode="contain" accessibilityLabel={`Aadhaar ${label}`} />
      ) : (
        <View style={[styles.documentImage, styles.documentMissing]}>
          <Text style={styles.documentMissingText}>{file ? "Loading…" : "Not sent"}</Text>
        </View>
      )}
      <Text style={styles.documentLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  head: { alignItems: "center", marginBottom: spacing.lg, gap: spacing.xs },
  name: { ...type.title, color: colors.text, textAlign: "center", marginTop: spacing.sm },
  sent: { ...type.support, color: colors.textMuted },
  documents: { gap: spacing.md, marginBottom: spacing.md },
  document: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  // Full width and tall enough to read the card's small print.
  documentImage: { width: "100%", aspectRatio: 1.58, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  documentMissing: { alignItems: "center", justifyContent: "center" },
  documentMissingText: { ...type.support, color: colors.textFaint },
  documentLabel: { ...type.label, color: colors.textMuted, textAlign: "center" },
});
