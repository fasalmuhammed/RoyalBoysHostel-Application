import React, { useEffect, useState } from "react";
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
  StudentInput,
  createStudent,
  getStudent,
  updateStudent,
} from "@/services/students";
import { listRooms } from "@/services/rooms";
import { deletePhoto, photoUri, savePhoto } from "@/services/photos";
import { initials, toIsoDate } from "@/utils/format";
import { isValidEmail, isValidPhone } from "@/utils/validate";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "StudentForm">;

const EMPTY: StudentInput = {
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
  status: "active",
  joinedOn: toIsoDate(),
  leftOn: null,
  notes: "",
};

export default function StudentFormScreen({ navigation, route }: Props) {
  const studentId = route.params?.studentId;
  const isEditing = Boolean(studentId);
  const { invalidate } = useApp();

  const [form, setForm] = useState<StudentInput>({
    ...EMPTY,
    roomId: route.params?.presetRoomId ?? null,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof StudentInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(!isEditing);

  /** Photo captured in this session but not yet committed to a saved student. */
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null);

  const { data: rooms } = useAsyncData(() => listRooms(), []);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const student = await getStudent(studentId);
      if (!student) return;
      setForm({
        admissionNo: student.admissionNo,
        fullName: student.fullName,
        phone: student.phone,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        email: student.email,
        course: student.course,
        year: student.year,
        address: student.address,
        idProof: student.idProof,
        photoFile: student.photoFile,
        roomId: student.roomId,
        status: student.status,
        joinedOn: student.joinedOn,
        leftOn: student.leftOn,
        notes: student.notes,
      });
      setOriginalPhoto(student.photoFile);
      setLoaded(true);
    })();
  }, [studentId]);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit student" : "Add student" });
  }, [navigation, isEditing]);

  const set = <K extends keyof StudentInput>(key: K, value: StudentInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /**
   * Captures or picks a photo, compresses it, and stores it immediately.
   *
   * The file is written before the student row is saved, so `pendingPhoto`
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
          "Allow access in your phone's settings to add a student photo."
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
      if (pendingPhoto) deletePhoto(pendingPhoto);
      setPendingPhoto(stored);
      set("photoFile", stored);
    } catch {
      Alert.alert("Could not add photo", "Something went wrong while saving the image.");
    } finally {
      setCapturing(false);
    }
  };

  const promptPhoto = () => {
    Alert.alert("Student photo", "Where should the photo come from?", [
      { text: "Take photo", onPress: () => choosePhoto("camera") },
      { text: "Choose from gallery", onPress: () => choosePhoto("library") },
      ...(form.photoFile
        ? [
            {
              text: "Remove photo",
              style: "destructive" as const,
              onPress: () => {
                if (pendingPhoto) deletePhoto(pendingPhoto);
                setPendingPhoto(null);
                set("photoFile", null);
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof StudentInput, string>> = {};
    if (!form.fullName.trim()) next.fullName = "A name is required.";
    if (form.phone.trim() && !isValidPhone(form.phone)) next.phone = "That phone number looks wrong.";
    if (form.guardianPhone.trim() && !isValidPhone(form.guardianPhone)) {
      next.guardianPhone = "That phone number looks wrong.";
    }
    if (!isValidEmail(form.email)) next.email = "That email address looks wrong.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: StudentInput = { ...form, fullName: form.fullName.trim() };
      if (studentId) {
        await updateStudent(studentId, payload);
      } else {
        await createStudent(payload);
      }
      // Committed: the photo now belongs to a row, so it must not be cleaned up.
      setPendingPhoto(null);
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

  // Remove a photo captured but never saved, so it does not linger on disk.
  useEffect(
    () => () => {
      if (pendingPhoto && pendingPhoto !== originalPhoto) deletePhoto(pendingPhoto);
    },
    [pendingPhoto, originalPhoto]
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

          <SectionTitle title="Student" />
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
          <Input
            label="Admission number"
            value={form.admissionNo}
            onChangeText={(t) => set("admissionNo", t)}
            placeholder="e.g. ADM2026001"
            icon="pricetag-outline"
            autoCapitalize="characters"
          />
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
              This student is saved only on this phone. Export a backup from Settings so a lost
              phone does not mean lost records.
            </CalloutText>
          </Callout>

          <Button
            title={isEditing ? "Save changes" : "Save student"}
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
            // fields does not force the admin to move the student out.
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
});
