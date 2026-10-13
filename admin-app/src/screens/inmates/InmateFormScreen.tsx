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
  Switch,
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
import { OptionPicker, SegmentedTabs } from "@/components/Controls";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
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
import { deletePhoto, savePhoto, usePhotoUri } from "@/services/photos";
import { formatMoney, initials, toIsoDate } from "@/utils/format";
import { isValidEmail, isValidPhone, parseAmount } from "@/utils/validate";
import { createFee, DEFAULT_CYCLE_DAYS, DuplicateInvoiceError, stayDueDateFor } from "@/services/fees";
import { formatInmateId } from "@/services/branches";
import BranchChoice from "@/components/BranchChoice";
import { successFeedback } from "@/utils/haptics";
import { AdmissionType } from "@/types";
import type { RootStackParamList } from "@/navigation/types";
import { roomLabelOf } from "@/store/views";

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
  emergencyPhone: "",
  bloodGroup: "",
  institution: "",
  institutionType: "college",
  termsAcceptedAt: null,
  termsVersion: "",
  idProof: "",
  photoFile: null,
  idProofFile: null,
  idProofBackFile: null,
  roomId: null,
  // Left blank on purpose: createInmate stamps the active branch.
  branchId: "",
  status: "active",
  monthlyRent: 0,
  billingCycleDays: DEFAULT_CYCLE_DAYS,
  admissionType: "monthly",
  stayDays: null,
  joinedOn: toIsoDate(),
  leftOn: null,
  notes: "",
};

const BILLING_OPTIONS: { key: AdmissionType; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "stay", label: "Fixed days" },
];

export default function InmateFormScreen({ navigation, route }: Props) {
  const studentId = route.params?.studentId;
  const isEditing = Boolean(studentId);
  const { invalidate, activeBranch, allHostels, branches } = useApp();

  const [form, setForm] = useState<InmateInput>({
    ...EMPTY,
    roomId: route.params?.presetRoomId ?? null,
  });
  // Kept as text so the field can be empty while typing; parsed on save.
  const [rentText, setRentText] = useState("");
  const [stayDaysText, setStayDaysText] = useState("");
  const [rentTouched, setRentTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof InmateInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturingIdProof, setCapturingIdProof] = useState(false);
  const [capturingIdProofBack, setCapturingIdProofBack] = useState(false);
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
  const pendingIdProofRef = useRef<string | null>(null);
  const originalIdProofRef = useRef<string | null>(null);
  const pendingIdProofBackRef = useRef<string | null>(null);
  const originalIdProofBackRef = useRef<string | null>(null);
  /** Set once the row owning the pending photos is written. */
  const committedRef = useRef(false);

  type PhotoKind = "photo" | "idProof" | "idProofBack";
  const refsFor = (kind: PhotoKind) =>
    kind === "photo"
      ? { pending: pendingPhotoRef, original: originalPhotoRef }
      : kind === "idProof"
        ? { pending: pendingIdProofRef, original: originalIdProofRef }
        : { pending: pendingIdProofBackRef, original: originalIdProofBackRef };

  const fieldFor = (kind: PhotoKind): "photoFile" | "idProofFile" | "idProofBackFile" =>
    kind === "photo" ? "photoFile" : kind === "idProof" ? "idProofFile" : "idProofBackFile";

  const labelFor = (kind: PhotoKind): string =>
    kind === "photo" ? "inmate photo" : kind === "idProof" ? "Aadhaar front photo" : "Aadhaar back photo";

  // Once recorded (on the QR form or here), acceptance of the rules stays as it is.
  const [termsLocked, setTermsLocked] = useState(false);
  const { data: rooms } = useAsyncData(() => listRooms(), []);
  /**
   * The hostel this inmate belongs to: their own when editing; otherwise the
   * one being worked in, or -- with both hostels showing -- the one chosen on
   * the form (or the hostel of the room they are being added to).
   */
  const presetRoom = rooms?.find((room) => room.id === route.params?.presetRoomId);
  const formBranchId = form.branchId || (allHostels ? (presetRoom?.branchId ?? "") : (activeBranch?.id ?? ""));
  const formBranch = branches.find((branch) => branch.id === formBranchId) ?? null;
  const isCompany = form.institutionType === "company";
  const askBranch = !isEditing && allHostels && !route.params?.presetRoomId;
  const branchRooms = (rooms ?? []).filter((room) => !formBranchId || room.branchId === formBranchId);
  const { data: nextAdmissionNo } = useAsyncData(
    () => (isEditing || !formBranchId ? Promise.resolve(null) : peekNextAdmissionNo(formBranchId)),
    [isEditing, formBranchId]
  );

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const inmate = await getInmate(studentId);
      if (!inmate) return;
      setTermsLocked(Boolean(inmate.termsAcceptedAt));
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
        emergencyPhone: inmate.emergencyPhone ?? "",
        bloodGroup: inmate.bloodGroup ?? "",
        institution: inmate.institution ?? "",
        institutionType: inmate.institutionType === "company" ? "company" : "college",
        termsAcceptedAt: inmate.termsAcceptedAt ?? null,
        termsVersion: inmate.termsVersion ?? "",
        idProof: inmate.idProof,
        photoFile: inmate.photoFile,
        idProofFile: inmate.idProofFile,
        idProofBackFile: inmate.idProofBackFile,
        roomId: inmate.roomId,
        branchId: inmate.branchId,
        status: inmate.status,
        monthlyRent: inmate.monthlyRent,
        billingCycleDays: inmate.billingCycleDays,
        admissionType: inmate.admissionType,
        stayDays: inmate.stayDays,
        joinedOn: inmate.joinedOn,
        leftOn: inmate.leftOn,
        notes: inmate.notes,
      });
      setRentText(inmate.monthlyRent > 0 ? String(inmate.monthlyRent) : "");
      setStayDaysText(inmate.stayDays ? String(inmate.stayDays) : "");
      // An existing inmate already has an agreed rent; never overwrite it.
      setRentTouched(true);
      originalPhotoRef.current = inmate.photoFile;
      originalIdProofRef.current = inmate.idProofFile;
      originalIdProofBackRef.current = inmate.idProofBackFile;
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
   * room change from silently overwriting a negotiated rate. Only for monthly
   * admissions -- a room's monthly rate is not a sane default for a fixed-days
   * stay's flat total.
   */
  useEffect(() => {
    if (form.admissionType !== "monthly" || rentTouched || !form.roomId || !rooms) return;
    const room = rooms.find((r) => r.id === form.roomId);
    if (room && room.rent > 0) setRentText(String(room.rent));
  }, [form.roomId, form.admissionType, rooms, rentTouched]);

  const set = <K extends keyof InmateInput>(key: K, value: InmateInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /**
   * Captures or picks a photo, compresses it, and stores it immediately.
   *
   * The file is written before the inmate row is saved, so the matching
   * `pending*Ref` tracks it -- if the admin backs out without saving, cleanup
   * removes the orphan rather than leaving it on disk forever. Shared between
   * the profile photo and the ID proof photo -- both are stored the same way,
   * just under a different field on the inmate.
   */
  const choosePhoto = async (kind: PhotoKind, source: "camera" | "library") => {
    const setCapturingFlag =
      kind === "photo" ? setCapturing : kind === "idProof" ? setCapturingIdProof : setCapturingIdProofBack;
    setCapturingFlag(true);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          source === "camera" ? "Camera access needed" : "Photo access needed",
          `Allow access in your phone's settings to add the ${labelFor(kind)}.`
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        // The profile photo is a square headshot; ID cards are landscape.
        aspect: kind === "photo" ? [1, 1] : [1.6, 1],
        quality: 1,
      };

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.[0]) return;

      // An ID card keeps more detail than a face, so its text stays readable.
      const stored = await savePhoto(result.assets[0].uri, kind === "photo" ? "profile" : "document", formBranchId);
      const { pending, original } = refsFor(kind);
      // Drop a photo taken earlier in this same session; it was never saved.
      const superseded = pending.current;
      if (superseded && superseded !== original.current) deletePhoto(superseded);
      pending.current = stored;
      set(fieldFor(kind), stored);
    } catch {
      Alert.alert("Could not add photo", "Something went wrong while saving the image.");
    } finally {
      setCapturingFlag(false);
    }
  };

  const promptPhoto = (kind: PhotoKind) => {
    const current = form[fieldFor(kind)];
    const { pending, original } = refsFor(kind);
    Alert.alert(kind === "photo" ? "Inmate photo" : kind === "idProof" ? "Aadhaar front" : "Aadhaar back", "Where should the photo come from?", [
      { text: "Take photo", onPress: () => choosePhoto(kind, "camera") },
      { text: "Choose from gallery", onPress: () => choosePhoto(kind, "library") },
      ...(current
        ? [
            {
              text: "Remove photo",
              style: "destructive" as const,
              onPress: () => {
                const dropped = pending.current;
                if (dropped && dropped !== original.current) deletePhoto(dropped);
                pending.current = null;
                set(fieldFor(kind), null);
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof InmateInput, string>> = {};
    if (!isEditing && !formBranchId) next.branchId = "Choose which hostel this inmate is joining.";
    if (!form.fullName.trim()) next.fullName = "A name is required.";
    // A new inmate needs everything the QR form asks a student for. Editing an
    // older record stays lenient, so it can still be opened and corrected.
    if (!isEditing) {
      if (!form.phone.trim()) next.phone = "Enter their mobile number.";
      if (!(form.institution ?? "").trim()) next.institution = isCompany ? "Enter the company they work at." : "Enter their college.";
      if (!isCompany && !form.course.trim()) next.course = "Enter their course.";
      if (!isCompany && !form.year.trim()) next.year = "Enter their year.";
      if (!form.address.trim()) next.address = "Enter their home address.";
      if (!form.guardianName.trim()) next.guardianName = "Enter the guardian's name.";
      if (!form.guardianPhone.trim()) next.guardianPhone = "Enter the guardian's mobile number.";
      if (!(form.emergencyPhone ?? "").trim()) next.emergencyPhone = "Enter an emergency contact number.";
      if (!form.photoFile) next.photoFile = "Add the inmate's photo.";
      if (!form.termsAcceptedAt) next.termsAcceptedAt = "Switch this on once they have accepted the rules.";
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) next.phone = "That phone number looks wrong.";
    if (form.guardianPhone.trim() && !isValidPhone(form.guardianPhone)) {
      next.guardianPhone = "That phone number looks wrong.";
    }
    if (form.emergencyPhone?.trim() && !isValidPhone(form.emergencyPhone)) {
      next.emergencyPhone = "That phone number looks wrong.";
    }
    if (!isValidEmail(form.email)) next.email = "That email address looks wrong.";
    if (!form.idProofFile) next.idProofFile = "Add a clear photo of the Aadhaar front.";
    if (!form.idProofBackFile) next.idProofBackFile = "Add a clear photo of the Aadhaar back.";

    if (parseAmount(rentText) < 0) next.monthlyRent = "Rent cannot be negative.";

    if (form.admissionType === "stay") {
      const days = Number.parseInt(stayDaysText, 10);
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        next.stayDays = "Enter a stay length between 1 and 365 days.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const isNewStay = !studentId && form.admissionType === "stay";
      const stayDays = form.admissionType === "stay" ? Number.parseInt(stayDaysText, 10) : null;

      const payload: InmateInput = {
        ...form,
        fullName: form.fullName.trim(),
        monthlyRent: parseAmount(rentText),
        stayDays,
      };

      let newId: string | null = null;
      if (studentId) {
        await updateInmate(studentId, payload);
      } else {
        newId = await createInmate({ ...payload, branchId: formBranchId });
      }

      // Fixed-days stays are billed exactly once, immediately -- never on edit,
      // so changing an existing stay's day count later can't rewrite a bill
      // that may already have payments recorded against it.
      if (isNewStay && newId && stayDays) {
        try {
          await createFee({
            studentId: newId,
            period: payload.joinedOn.slice(0, 7),
            rent: payload.monthlyRent,
            electricity: 0,
            water: 0,
            other: 0,
            discount: 0,
            dueDate: stayDueDateFor(payload.joinedOn, stayDays),
            note: "",
          });
        } catch (feeError) {
          // The inmate is already saved -- a billing hiccup must not look like
          // the admission itself failed, or cost the admin the record.
          Alert.alert(
            "Inmate saved, but the bill could not be raised",
            (feeError instanceof DuplicateInvoiceError || feeError instanceof Error
              ? feeError.message
              : "Please try again.") + " Raise it manually from this inmate's page."
          );
        }
      }

      // Committed: the photo now belongs to a row, so it must not be cleaned up.
      successFeedback();
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
      if (committedRef.current) return;
      const pendingPhoto = pendingPhotoRef.current;
      if (pendingPhoto && pendingPhoto !== originalPhotoRef.current) deletePhoto(pendingPhoto);
      const pendingIdProof = pendingIdProofRef.current;
      if (pendingIdProof && pendingIdProof !== originalIdProofRef.current) deletePhoto(pendingIdProof);
      const pendingIdProofBack = pendingIdProofBackRef.current;
      if (pendingIdProofBack && pendingIdProofBack !== originalIdProofBackRef.current) {
        deletePhoto(pendingIdProofBack);
      }
    },
    []
  );

  const previewUri = usePhotoUri(form.photoFile);
  const idProofPreviewUri = usePhotoUri(form.idProofFile);
  const idProofBackPreviewUri = usePhotoUri(form.idProofBackFile);
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
          {/* The same sections, in the same order, as the form students fill in from the QR code. */}
          <SectionTitle title="About the inmate" />
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
          {askBranch ? (
            <BranchChoice
              value={form.branchId || null}
              // Rooms belong to a hostel, so a room picked for the other one is dropped.
              onChange={(branchId) => setForm((current) => ({ ...current, branchId, roomId: null }))}
              error={errors.branchId}
            />
          ) : null}
          <View style={styles.admissionRow}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.admissionLabel}>Inmate ID</Text>
              <Text style={styles.admissionHint}>
                {isEditing
                  ? "Assigned when this inmate was added."
                  : `Assigned automatically when you save, counting within ${
                      formBranch?.shortName ?? "the hostel"
                    }.`}
              </Text>
            </View>
            <Text style={styles.admissionValue}>
              {isEditing
                ? formatInmateId(formBranch?.code, form.admissionNo)
                : nextAdmissionNo
                  ? formatInmateId(formBranch?.code, nextAdmissionNo)
                  : "…"}
            </Text>
          </View>
          <Input
            label="Mobile number"
            required={!isEditing}
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
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.fieldLabel}>They are a</Text>
            <SegmentedTabs
              value={form.institutionType === "company" ? "company" : "college"}
              onChange={(key) =>
                setForm((current) => ({
                  ...current,
                  institutionType: key,
                  // Someone working has no course or year.
                  ...(key === "company" ? { course: "", year: "" } : {}),
                }))
              }
              options={[
                { key: "college", label: "College student" },
                { key: "company", label: "Working at a company" },
              ]}
            />
          </View>
          <Input
            label={isCompany ? "Company name" : "College name"}
            required={!isEditing}
            value={form.institution ?? ""}
            onChangeText={(t) => set("institution", t)}
            icon={isCompany ? "briefcase-outline" : "school-outline"}
            autoCapitalize="words"
            error={errors.institution}
          />
          {isCompany ? null : (
            <>
            <View style={styles.pairRow}>
              <Input
                label="Course"
                required={!isEditing}
                error={errors.course}
                value={form.course}
                onChangeText={(t) => set("course", t)}
                placeholder="e.g. CSE"
                containerStyle={{ flex: 1 }}
                autoCapitalize="characters"
              />
              <Input
                label="Year"
                required={!isEditing}
                error={errors.year}
                value={form.year}
                onChangeText={(t) => set("year", t)}
                placeholder="e.g. 2"
                keyboardType="number-pad"
                containerStyle={{ width: 90 }}
              />
            </View>
              </>
          )}
          <Input
            label="Blood group"
            value={form.bloodGroup ?? ""}
            onChangeText={(t) => set("bloodGroup", t.toUpperCase().slice(0, 4))}
            placeholder="Optional, e.g. O+"
            icon="water-outline"
            autoCapitalize="characters"
          />
          <PickerField
            label="Assigned room"
            icon="bed-outline"
            value={
              selectedRoom
                ? `${roomLabelOf(selectedRoom) ?? ""}` +
                  ` · ${selectedRoom.vacant} free`
                : null
            }
            placeholder="Not assigned"
            onPress={() => setRoomPickerOpen(true)}
            error={errors.roomId}
          />
          <Input
            label="Home address"
            required={!isEditing}
            error={errors.address}
            value={form.address}
            onChangeText={(t) => set("address", t)}
            placeholder="Home address"
            multiline
            icon="location-outline"
          />

          <SectionTitle title="Family and emergency" />
          <Input
            label="Guardian name"
            required={!isEditing}
            error={errors.guardianName}
            value={form.guardianName}
            onChangeText={(t) => set("guardianName", t)}
            placeholder="Parent or guardian"
            icon="people-outline"
            autoCapitalize="words"
          />
          <Input
            label="Guardian mobile"
            required={!isEditing}
            value={form.guardianPhone}
            onChangeText={(t) => set("guardianPhone", t)}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
            error={errors.guardianPhone}
            icon="call-outline"
          />
          <Input
            label="Emergency contact number"
            required={!isEditing}
            value={form.emergencyPhone ?? ""}
            onChangeText={(t) => set("emergencyPhone", t)}
            placeholder="Who to call in an emergency"
            keyboardType="phone-pad"
            error={errors.emergencyPhone}
            icon="medkit-outline"
          />

          <SectionTitle title="Photos" />
          <View style={styles.photoBlock}>
            <Pressable onPress={() => promptPhoto("photo")} disabled={capturing} style={styles.photoTarget}>
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
          {errors.photoFile ? <Text style={[styles.errorText, { textAlign: "center", marginBottom: spacing.md }]}>{errors.photoFile}</Text> : null}
          <Text style={styles.fieldLabel}>Aadhaar card</Text>
          <Text style={styles.documentHint}>Both sides are required. Make sure all text is clear and readable.</Text>
          <View style={styles.documentRow}>
            <View style={styles.documentSide}>
              <Text style={styles.documentSideLabel}>Front</Text>
              <Pressable
                onPress={() => promptPhoto("idProof")}
                disabled={capturingIdProof}
                style={styles.idProofTarget}
              >
                {idProofPreviewUri ? (
                  <Image source={{ uri: idProofPreviewUri }} style={styles.idProofImage} />
                ) : (
                  <View style={[styles.idProofPlaceholder, errors.idProofFile ? styles.photoError : null]}>
                    {capturingIdProof ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="card-outline" size={24} color={colors.primary} />
                        <Text style={styles.idProofPlaceholderText}>Add front</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {errors.idProofFile ? <Text style={styles.errorText}>{errors.idProofFile}</Text> : null}
            </View>

            <View style={styles.documentSide}>
              <Text style={styles.documentSideLabel}>Back</Text>
              <Pressable
                onPress={() => promptPhoto("idProofBack")}
                disabled={capturingIdProofBack}
                style={styles.idProofTarget}
              >
                {idProofBackPreviewUri ? (
                  <Image source={{ uri: idProofBackPreviewUri }} style={styles.idProofImage} />
                ) : (
                  <View style={[styles.idProofPlaceholder, errors.idProofBackFile ? styles.photoError : null]}>
                    {capturingIdProofBack ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="card-outline" size={24} color={colors.primary} />
                        <Text style={styles.idProofPlaceholderText}>Add back</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {errors.idProofBackFile ? <Text style={styles.errorText}>{errors.idProofBackFile}</Text> : null}
            </View>
          </View>

          <SectionTitle title="Rules and regulations" />
          <View style={styles.termsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.termsLabel}>Accepted the hostel rules</Text>
              <Text style={styles.termsHint}>
                {termsLocked
                  ? "Already recorded for this inmate."
                  : "Switch on once they have read and signed the rules and regulations."}
              </Text>
            </View>
            <Switch
              value={Boolean(form.termsAcceptedAt)}
              disabled={termsLocked}
              onValueChange={(on) =>
                setForm((current) => ({
                  ...current,
                  termsAcceptedAt: on ? Date.now() : null,
                  termsVersion: on ? "signed copy" : "",
                }))
              }
              trackColor={{ true: colors.success, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
          </View>
          {errors.termsAcceptedAt ? <Text style={[styles.errorText, { marginBottom: spacing.md }]}>{errors.termsAcceptedAt}</Text> : null}

          <SectionTitle title="Hostel and fees" />
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.fieldLabel}>Billing</Text>
            <SegmentedTabs
              value={form.admissionType}
              onChange={(key) => set("admissionType", key)}
              options={BILLING_OPTIONS}
            />
          </View>

          {form.admissionType === "monthly" ? (
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
                  : "What this inmate pays each month. Bills fall due on the same day of the month as \"Joined on\", below."
              }
            />
          ) : (
            <>
              <Input
                label="Rent for the stay"
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
                hint="The flat total for the whole stay, not a monthly rate."
              />
              <Input
                label="Number of days"
                value={stayDaysText}
                onChangeText={(t) => {
                  setStayDaysText(t.replace(/\D/g, "").slice(0, 3));
                  setErrors((current) => ({ ...current, stayDays: undefined }));
                }}
                placeholder="e.g. 10"
                keyboardType="number-pad"
                icon="calendar-outline"
                error={errors.stayDays}
                hint={
                  isEditing
                    ? "Changing this does not change any bill already raised for this inmate."
                    : "One bill for this exact number of days is raised automatically when you save."
                }
              />
            </>
          )}
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
              The inmate is saved to online storage and appears straight away on every device
              signed in to this hostel.
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
          ...branchRooms.map((room) => ({
            key: room.id,
            label: `Room ${roomLabelOf(room) ?? ""}`,
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
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  termsLabel: { ...type.bodyStrong, color: colors.text },
  termsHint: { ...type.support, color: colors.textMuted, marginTop: 2 },
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
  photoInitials: { fontSize: 34, fontFamily: font.extrabold, color: colors.primary },
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
  admissionLabel: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.text },
  admissionHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  admissionValue: { ...type.title, color: colors.primary },
  fieldLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs + 2,
    fontFamily: font.semibold,
  },
  documentHint: { color: colors.textFaint, fontSize: fontSize.sm, marginBottom: spacing.sm },
  documentRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  documentSide: { flex: 1 },
  documentSideLabel: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.xs },
  idProofTarget: { width: "100%", aspectRatio: 1.6 },
  idProofImage: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  idProofPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  idProofPlaceholderText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: font.semibold },
  photoError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.xs },
  hint: { color: colors.textFaint, fontSize: fontSize.sm, marginTop: spacing.xs },
});
