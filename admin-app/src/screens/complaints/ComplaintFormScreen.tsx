import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

import { SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import {
  CATEGORY_LABELS,
  ComplaintInput,
  createComplaint,
  getComplaint,
  STATUS_LABELS,
  setStatus,
  updateComplaint,
} from "@/services/complaints";
import { listRooms } from "@/services/rooms";
import { listInmates } from "@/services/inmates";
import { deletePhoto, savePhoto, usePhotoUri } from "@/services/photos";
import { ComplaintCategory, ComplaintStatus } from "@/types";
import { toIsoDate } from "@/utils/format";
import { successFeedback } from "@/utils/haptics";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ComplaintForm">;

const CATEGORIES: ComplaintCategory[] = [
  "electrical",
  "plumbing",
  "furniture",
  "cleanliness",
  "internet",
  "food",
  "other",
];

const MAX_DESCRIPTION = 500;

export default function ComplaintFormScreen({ navigation, route }: Props) {
  const complaintId = route.params?.complaintId;
  const isEditing = Boolean(complaintId);
  const { invalidate } = useApp();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("other");
  const [status, setStatusValue] = useState<ComplaintStatus>("open");
  const [roomId, setRoomId] = useState<string | null>(route.params?.roomId ?? null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<string | null>(null);
  const [raisedOn, setRaisedOn] = useState(toIsoDate());

  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [inmatePickerOpen, setInmatePickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Same discipline as the inmate form: the file is written before the row, so
  // an abandoned capture is cleaned up rather than left on disk.
  const pendingPhotoRef = React.useRef<string | null>(null);
  const originalPhotoRef = React.useRef<string | null>(null);
  const committedRef = React.useRef(false);

  const { data: rooms } = useAsyncData(() => listRooms(), []);
  const { data: inmates } = useAsyncData(() => listInmates("", "active"), []);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Complaint" : "Raise complaint" });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!complaintId) return;
    (async () => {
      const complaint = await getComplaint(complaintId);
      if (!complaint) return;
      setTitle(complaint.title);
      setDescription(complaint.description);
      setCategory(complaint.category);
      setStatusValue(complaint.status);
      setRoomId(complaint.roomId);
      setStudentId(complaint.studentId);
      setPhotoFile(complaint.photoFile);
      setRaisedOn(complaint.raisedOn);
      originalPhotoRef.current = complaint.photoFile;
    })();
  }, [complaintId]);

  useEffect(
    () => () => {
      const pending = pendingPhotoRef.current;
      if (!committedRef.current && pending && pending !== originalPhotoRef.current) {
        deletePhoto(pending);
      }
    },
    []
  );

  const addPhoto = async (source: "camera" | "library") => {
    setCapturing(true);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Access needed", "Allow access in your phone's settings to attach a photo.");
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;

      const stored = await savePhoto(result.assets[0].uri);
      const superseded = pendingPhotoRef.current;
      if (superseded && superseded !== originalPhotoRef.current) deletePhoto(superseded);
      pendingPhotoRef.current = stored;
      setPhotoFile(stored);
    } catch {
      Alert.alert("Could not add photo", "Something went wrong while saving the image.");
    } finally {
      setCapturing(false);
    }
  };

  const promptPhoto = () => {
    Alert.alert("Attach a photo", "Where should it come from?", [
      { text: "Take photo", onPress: () => addPhoto("camera") },
      { text: "Choose from gallery", onPress: () => addPhoto("library") },
      ...(photoFile
        ? [
            {
              text: "Remove photo",
              style: "destructive" as const,
              onPress: () => {
                const dropped = pendingPhotoRef.current;
                if (dropped && dropped !== originalPhotoRef.current) deletePhoto(dropped);
                pendingPhotoRef.current = null;
                setPhotoFile(null);
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const onSave = async () => {
    const next: { title?: string; description?: string } = {};
    if (!title.trim()) next.title = "Say what the problem is.";
    if (description.length > MAX_DESCRIPTION) next.description = "That is too long.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const payload: ComplaintInput = {
        branchId: "",
        roomId,
        studentId,
        title: title.trim(),
        description: description.trim(),
        category,
        status,
        photoFile,
        raisedOn: raisedOn || toIsoDate(),
      };
      if (complaintId) await updateComplaint(complaintId, payload);
      else await createComplaint(payload);

      successFeedback();
      committedRef.current = true;
      invalidate();
      navigation.goBack();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const room = rooms?.find((r) => r.id === roomId);
  const inmate = inmates?.find((s) => s.id === studentId);
  const preview = usePhotoUri(photoFile);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Input
          label="What is the problem?"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Wi-Fi not working"
          icon="construct-outline"
          error={errors.title}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((option) => (
            <Pressable
              key={option}
              onPress={() => setCategory(option)}
              style={[styles.chip, category === option && styles.chipActive]}
            >
              <Text style={[styles.chipText, category === option && styles.chipTextActive]}>
                {CATEGORY_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>

        <PickerField
          label="Room"
          icon="bed-outline"
          value={room ? `Room ${room.block ? `${room.block}-` : ""}${room.roomNumber}` : null}
          placeholder="Not specific to a room"
          onPress={() => setRoomPickerOpen(true)}
        />

        <PickerField
          label="Reported by"
          icon="person-outline"
          value={inmate?.fullName ?? null}
          placeholder="Not recorded"
          onPress={() => setInmatePickerOpen(true)}
        />

        <Input
          label="Description"
          value={description}
          onChangeText={(text) => setDescription(text.slice(0, MAX_DESCRIPTION))}
          placeholder="Describe the issue…"
          multiline
          style={{ minHeight: 120 }}
          error={errors.description}
          hint={`${description.length}/${MAX_DESCRIPTION}`}
        />

        <Text style={styles.label}>Photo</Text>
        <Pressable onPress={promptPhoto} disabled={capturing} style={styles.photoBox}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.photo} resizeMode="cover" />
          ) : capturing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
              <Text style={styles.photoText}>Add Photo</Text>
            </>
          )}
        </Pressable>

        <Input
          label="Raised on"
          value={raisedOn}
          onChangeText={setRaisedOn}
          placeholder="YYYY-MM-DD"
          icon="calendar-outline"
        />

        {isEditing ? (
          <>
            <SectionTitle title="Status" />
            <View style={styles.chipRow}>
              {(["open", "in_progress", "resolved"] as ComplaintStatus[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={async () => {
                    setStatusValue(option);
                    if (complaintId) {
                      await setStatus(complaintId, option);
                      invalidate();
                    }
                  }}
                  style={[styles.chip, status === option && styles.chipActive]}
                >
                  <Text style={[styles.chipText, status === option && styles.chipTextActive]}>
                    {STATUS_LABELS[option]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Button
          title={isEditing ? "Save changes" : "Submit complaint"}
          onPress={onSave}
          loading={saving}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>

      <OptionPicker
        visible={roomPickerOpen}
        title="Which room?"
        selectedKey={roomId}
        onClose={() => setRoomPickerOpen(false)}
        onSelect={(key) => setRoomId(key === "__none__" ? null : key)}
        emptyMessage="No rooms yet."
        options={[
          { key: "__none__", label: "Not specific to a room" },
          ...(rooms ?? []).map((r) => ({
            key: r.id,
            label: `Room ${r.block ? `${r.block}-` : ""}${r.roomNumber}`,
            sublabel: `${r.occupied} of ${r.capacity} beds taken`,
          })),
        ]}
      />

      <OptionPicker
        visible={inmatePickerOpen}
        title="Who reported it?"
        selectedKey={studentId}
        onClose={() => setInmatePickerOpen(false)}
        onSelect={(key) => setStudentId(key === "__none__" ? null : key)}
        emptyMessage="No active inmates."
        options={[
          { key: "__none__", label: "Not recorded" },
          ...(inmates ?? []).map((s) => ({
            key: s.id,
            label: s.fullName,
            sublabel: s.roomLabel ? `Room ${s.roomLabel}` : "No room",
          })),
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: font.semibold,
    marginBottom: spacing.xs + 2,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.textMuted },
  chipTextActive: { color: colors.primaryOn },
  photoBox: {
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
  photoText: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.primary },
});
