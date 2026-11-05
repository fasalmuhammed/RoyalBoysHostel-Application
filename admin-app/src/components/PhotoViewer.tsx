import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/web/dialog";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { HIT_TARGET, colors, radius, spacing, type } from "@/constants/theme";
import { savePhotoToDevice, usePhotoUri } from "@/services/photos";

export interface ViewedPhoto {
  file: string;
  /** Shown as the title, e.g. "Aadhaar front". */
  label: string;
  /** Name for the saved file, without the extension. */
  saveAs: string;
}

/**
 * A photo opened full screen, with a button to save it to the device.
 * Used for profile photos and both sides of the Aadhaar card.
 */
export default function PhotoViewer({ photo, onClose }: { photo: ViewedPhoto | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const uri = usePhotoUri(photo?.file);
  const [saving, setSaving] = useState(false);

  if (!photo) return null;

  const onSave = async () => {
    setSaving(true);
    try {
      await savePhotoToDevice(photo.file, photo.saveAs);
    } catch (error) {
      Alert.alert("Could not download", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={onClose} style={styles.barButton} accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={22} color={colors.onDark} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{photo.label}</Text>
          <View style={styles.barButton} />
        </View>

        <Pressable style={styles.stage} onPress={onClose}>
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel={photo.label} />
          ) : (
            <ActivityIndicator color={colors.onDark} size="large" />
          )}
        </Pressable>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            onPress={onSave}
            disabled={!uri || saving}
            style={[styles.download, (!uri || saving) && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryDark} size="small" />
            ) : (
              <Ionicons name="download-outline" size={19} color={colors.primaryDark} />
            )}
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(7, 12, 30, 0.96)" },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm },
  barButton: { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center", justifyContent: "center" },
  title: { ...type.bodyStrong, color: colors.onDark, flex: 1, textAlign: "center" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  image: { width: "100%", height: "100%" },
  footer: { alignItems: "center", paddingTop: spacing.md },
  download: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: HIT_TARGET + 4,
  },
  downloadText: { ...type.bodyStrong, color: colors.primaryDark },
});
