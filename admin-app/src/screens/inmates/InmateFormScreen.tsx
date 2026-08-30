import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import {
  RoomFullError,
  InmateInput,
  createInmate,
  getInmate,
  peekNextAdmissionNo,
  updateInmate,
} from "@/services/inmates";
import { listRooms } from "@/services/rooms";
import { deletePhoto, photoUri, savePhoto } from "@/services/photos";
import { formatMoney, initials, toIsoDate } from "@/utils/format";
import { isValidEmail, isValidPhone, parseAmount } from "@/utils/validate";
import { DEFAULT_CYCLE_DAYS } from "@/services/fees";
import { formatInmateId } from "@/services/branches";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "InmateForm">;

const EMPTY: InmateInput = {
  admissionNo: "",
  fullName: "",
  phone: "",
  guardianName: "",
  guardianPhone: "",
  email: "",
  course: "",
  year: "",
  address: "",
  idProof: "",
  photoFile: null,
  roomId: null,
  // Left blank on purpose: createInmate stamps the active branch.
  branchId: "",
  status: "active",
  monthlyRent: 0,
  billingCycleDays: DEFAULT_CYCLE_DAYS,
  joinedOn: toIsoDate(),
  leftOn: null,
  notes: "",
};

function roomLabelOf(room: { block: string; roomNumber: string }): string {
  return room.block ? `${room.block}-${room.roomNumber}` : room.roomNumber;
}

export default function InmateFormScreen({ navigation, route }: Props) {
  const studentId = route.params?.studentId;
  const isEditing = Boolean(studentId);
  const { invalidate, activeBranch } = useApp();

  const [form, setForm] = useState<InmateInput>({
    ...EMPTY,
    roomId: route.params?.presetRoomId ?? null,
  });
  // Kept as text so the field can be empty while typing; parsed on save.
  const [rentText, setRentText] = useState("");
  const [cycleText, setCycleText] = useState(String(DEFAULT_CYCLE_DAYS));
  const [rentTouched, setRentTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof InmateInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(!isEditing);

  /**
   * Photo bookkeeping, held in refs rather than state.
   *
   * These must not be effect dependencies. An earlier version cleared the
   * pending photo through `useState` on save, which re-ran the cleanup effect
   * and deleted the very file the newly saved inmate pointed at -- the row
   * kept its filename while the image vanished from disk.
   */
  const pendingPhotoRef = useRef<string | null>(null);
  const originalPhotoRef = useRef<string | null>(null);
  /** Set once the row owning the pending photo is written. */
  const committedRef = useRef(false);

  const { data: rooms } = useAsyncData(() => listRooms(), []);
  const { data: nextAdmissionNo } = useAsyncData(
    () => (isEditing ? Promise.resolve(null) : peekNextAdmissionNo()),
    [isEditing]
  );

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const inmate = await getInmate(studentId);
      if (!inmate) return;
      setForm({
        admissionNo: inmate.admissionNo,
        fullName: inmate.fullName,
        phone: inmate.phone,
        guardianName: inmate.guardianName,
        guardianPhone: inmate.guardianPhone,
        email: inmate.email,
        course: inmate.course,
        year: inmate.year,
        address: inmate.address,
        idProof: inmate.idProof,
        photoFile: inmate.photoFile,
        roomId: inmate.roomId,
        branchId: inmate.branchId,
        status: inmate.status,
        monthlyRent: inmate.monthlyRent,
        billingCycleDays: inmate.billingCycleDays,
        joinedOn: inmate.joinedOn,
        leftOn: inmate.leftOn,
        notes: inmate.notes,
      });
      setRentText(inmate.monthlyRent > 0 ? String(inmate.monthlyRent) : "");
      setCycleText(String(inmate.billingCycleDays || DEFAULT_CYCLE_DAYS));
      // An existing inmate already has an agreed rent; never overwrite it.
      setRentTouched(true);
      originalPhotoRef.current = inmate.photoFile;
      setLoaded(true);
    })();
  }, [studentId]);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit inmate" : "Add inmate" });
  }, [navigation, isEditing]);

  /**
   * Fills the rent from the allocated room.
   *
   * Only until the admin types their own figure -- `rentTouched` stops a later
   * room change from silently overwriting a negotiated rate.
   */
  useEffect(() => {
    if (rentTouched || !form.roomId || !rooms) return;
    const room = rooms.find((r) => r.id === form.roomId);
    if (room && room.rent > 0) setRentText(String(room.rent));
  }, [form.roomId, rooms, rentTouched]);

  const set = <K extends keyof InmateInput>(key: K, value: InmateInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /**
   * Captures or picks a photo, compresses it, and stores it immediately.
   *
   * The file is written before the inmate row is saved, so `pendingPhoto`
   * tracks it -- if the admin backs out without saving, cleanup removes the
   * orphan rather than leaving it on disk forever.
   */
  const choosePhoto = async (source: "camera" | "library") => {
    setCapturing(true);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          source === "camera" ? "Camera access needed" : "Photo access needed",
          "Allow access in your phone's settings to add a inmate photo."
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      };

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.[0]) return;

      const stored = await savePhoto(result.assets[0].uri);
      // Drop a photo taken earlier in this same session; it was never saved.
      const superseded = pendingPhotoRef.current;
      if (superseded && superseded !== originalPhotoRef.current) deletePhoto(superseded);
      pendingPhotoRef.current = stored;
      set("photoFile", stored);
    } catch {
      Alert.alert("Could not add photo", "Something went wrong while saving the image.");
    } finally {
      setCapturing(false);
    }
  };

  const promptPhoto = () => {
    Alert.alert("Inmate photo", "Where should the photo come from?", [
      { text: "Take photo", onPress: () => choosePhoto("camera") },
      { text: "Choose from gallery", onPress: () => choosePhoto("library") },
      ...(form.photoFile
        ? [
            {
              text: "Remove photo",
              style: "destructive" as const,
              onPress: () => {
                const dropped = pendingPhotoRef.current;
                if (dropped && dropped !== originalPhotoRef.current) deletePhoto(dropped);
                pendingPhotoRef.current = null;
                set("photoFile", null);
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof InmateInput, string>> = {};
    if (!form.fullName.trim()) next.fullName = "A name is required.";
    if (form.phone.trim() && !isValidPhone(form.phone)) next.phone = "That phone number looks wrong.";
    if (form.guardianPhone.trim() && !isValidPhone(form.guardianPhone)) {
      next.guardianPhone = "That phone number looks wrong.";
    }
    if (!isValidEmail(form.email)) next.email = "That email address looks wrong.";

    if (parseAmount(rentText) < 0) next.monthlyRent = "Rent cannot be negative.";

    const cycle = Number.parseInt(cycleText, 10);
    if (!Number.isFinite(cycle) || cycle < 1 || cycle > 365) {
      next.billingCycleDays = "Enter a cycle between 1 and 365 days.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: InmateInput = {
        ...form,
        fullName: form.fullName.trim(),
        monthlyRent: parseAmount(rentText),
        billingCycleDays: Number.parseInt(cycleText, 10) || DEFAULT_CYCLE_DAYS,
      };
      if (studentId) {
        await updateInmate(studentId, payload);
      } else {
        await createInmate(payload);
      }
      // Committed: the photo now belongs to a row, so it must not be cleaned up.
      committedRef.current = true;
      invalidate();
      navigation.goBack();
    } catch (e) {
      if (e instanceof RoomFullError) {
        setErrors({ roomId: e.message });
      } else {
        Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Removes a photo captured but never saved, so it does not linger on disk.
   *
   * Empty deps on purpose: this must run only when the screen is torn down,
   * never as a side effect of state changing while it is still open.
   */
  useEffect(
    () => () => {
      const pending = pendingPhotoRef.current;
      if (!committedRef.current && pending && pending !== originalPhotoRef.current) {
        deletePhoto(pending);
      }
    },
    []
  );

  const previewUri = photoUri(form.photoFile);
  const selectedRoom = rooms?.find((room) => room.id === form.roomId);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.photoBlock}>
            <Pressable onPress={promptPhoto} disabled={capturing} style={styles.photoTarget}>
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  {capturing ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.photoInitials}>
                      {form.fullName.trim() ? initials(form.fullName) : ""}
                    </Text>
                  )}
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={15} color={colors.primaryOn} />
              </View>
            </Pressable>
            <Text style={styles.photoHint}>
              {previewUri ? "Tap to change photo" : "Tap to take a photo"}
            </Text>
          </View>

          <SectionTitle title="Inmate" />
          <Input
            label="Full name"
            required
            value={form.fullName}
            onChangeText={(t) => set("fullName", t)}
            placeholder="e.g. Rahul Sharma"
            error={errors.fullName}
            icon="person-outline"
            autoCapitalize="words"
          />
          <View style={styles.admissionRow}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.admissionLabel}>Inmate ID</Text>
              <Text style={styles.admissionHint}>
                {isEditing
                  ? "Assigned when this inmate was added."
                  : `Assigned automatically when you save, counting within ${
                      activeBranch?.shortName ?? "this branch"
                    }.`}
              </Text>
            </View>
            <Text style={styles.admissionValue}>
              {isEditing
                ? formatInmateId(activeBranch?.code, form.admissionNo)
                : nextAdmissionNo
                  ? formatInmateId(activeBranch?.code, nextAdmissionNo)
                  : "…"}
            </Text>
          </View>
          <Input
            label="Mobile number"
            value={form.phone}
            onChangeText={(t) => set("phone", t)}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
            error={errors.phone}
            icon="call-outline"
            hint="Used to open WhatsApp for reminders."
          />
          <Input
            label="Email"
            value={form.email}
            onChangeText={(t) => set("email", t)}
            placeholder="optional"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            icon="mail-outline"
          />

          <View style={styles.pairRow}>
            <Input
              label="Course"
              value={form.course}
              onChangeText={(t) => set("course", t)}
              placeholder="e.g. CSE"
              containerStyle={{ flex: 1 }}
              autoCapitalize="characters"
            />
            <Input
              label="Year"
              value={form.year}
              onChangeText={(t) => set("year", t)}
              placeholder="e.g. 2"
              keyboardType="number-pad"
              containerStyle={{ width: 90 }}
            />
          </View>

          <SectionTitle title="Room" />
          <PickerField
            label="Assigned room"
            icon="bed-outline"
            value={
              selectedRoom
                ? `${selectedRoom.block ? `${selectedRoom.block}-` : ""}${selectedRoom.roomNumber}` +
                  ` · ${selectedRoom.vacant} free`
                : null
            }
            placeholder="Not assigned"
            onPress={() => setRoomPickerOpen(true)}
            error={errors.roomId}
          />

          <SectionTitle title="Fees" />
          <Input
            label="Monthly rent"
            value={rentText}
            onChangeText={(t) => {
              setRentText(t);
              setRentTouched(true);
              setErrors((current) => ({ ...current, monthlyRent: undefined }));
            }}
            placeholder="0"
            keyboardType="numeric"
            icon="cash-outline"
            error={errors.monthlyRent}
            hint={
              selectedRoom && !rentTouched
                ? `Filled in from room ${roomLabelOf(selectedRoom)}. Change it if this inmate pays something different.`
                : "What this inmate pays per billing cycle."
            }
          />
          <Input
            label="Billing cycle (days)"
            value={cycleText}
            onChangeText={(t) => {
              setCycleText(t.replace(/\D/g, "").slice(0, 3));
              setErrors((current) => ({ ...current, billingCycleDays: undefined }));
            }}
            placeholder={String(DEFAULT_CYCLE_DAYS)}
            keyboardType="number-pad"
            icon="calendar-outline"
            error={errors.billingCycleDays}
            hint={`Bills fall due this many days into the period. ${DEFAULT_CYCLE_DAYS} days is a normal month.`}
          />

          <SectionTitle title="Guardian" />
          <Input
            label="Guardian name"
            value={form.guardianName}
            onChangeText={(t) => set("guardianName", t)}
            placeholder="Parent or guardian"
            icon="people-outline"
            autoCapitalize="words"
          />
          <Input
            label="Guardian mobile"
            value={form.guardianPhone}
            onChangeText={(t) => set("guardianPhone", t)}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
            error={errors.guardianPhone}
            icon="call-outline"
          />

          <SectionTitle title="Other details" />
          <Input
            label="Address"
            value={form.address}
            onChangeText={(t) => set("address", t)}
            placeholder="Home address"
            multiline
            icon="location-outline"
          />
          <Input
            label="ID proof"
            value={form.idProof}
            onChangeText={(t) => set("idProof", t)}
            placeholder="e.g. Aadhaar last 4 digits"
            icon="card-outline"
          />
          <Input
            label="Joined on"
            value={form.joinedOn}
            onChangeText={(t) => set("joinedOn", t)}
            placeholder="YYYY-MM-DD"
            icon="calendar-outline"
          />
          <Input
            label="Notes"
            value={form.notes}
            onChangeText={(t) => set("notes", t)}
            placeholder="Anything worth remembering"
            multiline
          />

          <Callout tone="info" icon="phone-portrait-outline">
            <CalloutText>
              This inmate is saved only on this phone. Export a backup from Settings so a lost
              phone does not mean lost records.
            </CalloutText>
          </Callout>

          <Button
            title={isEditing ? "Save changes" : "Save inmate"}
            onPress={onSave}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionPicker
        visible={roomPickerOpen}
        title="Assign a room"
        selectedKey={form.roomId}
        onClose={() => setRoomPickerOpen(false)}
        onSelect={(key) => set("roomId", key === "__none__" ? null : key)}
        emptyMessage="No rooms yet. Add a room first."
        options={[
          { key: "__none__", label: "No room", sublabel: "Leave unassigned for now" },
          ...(rooms ?? []).map((room) => ({
            key: room.id,
            label: `Room ${room.block ? `${room.block}-` : ""}${room.roomNumber}`,
            sublabel:
              room.vacant > 0
                ? `${room.vacant} of ${room.capacity} beds free`
                : `Full (${room.capacity} beds)`,
            // The already-assigned room stays selectable so editing other
            // fields does not force the admin to move the inmate out.
            disabled: room.vacant <= 0 && room.id !== form.roomId,
          })),
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  photoBlock: { alignItems: "center", marginBottom: spacing.lg },
  photoTarget: { width: 108, height: 108 },
  photo: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.primaryLight },
  photoPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  photoInitials: { fontSize: 34, fontWeight: "800", color: colors.primary },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.background,
  },
  photoHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  pairRow: { flexDirection: "row", gap: spacing.md },
  admissionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    marginBottom: spacing.md,
  },
  admissionLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.text },
  admissionHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  admissionValue: { fontSize: fontSize.xl, fontWeight: "800", color: colors.primary },
});
