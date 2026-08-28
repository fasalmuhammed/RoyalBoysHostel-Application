import React, { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, DetailRow, Divider, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ProgressOverlay } from "@/components/Controls";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import {
  BackupError,
  BackupHeader,
  BackupProgress,
  exportForSharing,
  listLocalBackups,
  readBackupHeader,
  restoreBackup,
  writeAutoBackup,
} from "@/services/backup";
import { photosDiskUsage } from "@/services/photos";
import { studentCounts } from "@/services/students";
import { formatDateTime } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Backup">;

const MIN_PASSPHRASE = 8;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupScreen({}: Props) {
  const { settings, updateSettings, refreshSettings, invalidate } = useApp();

  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<{ uri: string; name: string } | null>(null);
  const [restoreHeader, setRestoreHeader] = useState<BackupHeader | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const { data, reload } = useAsyncData(async () => {
    const [counts, locals] = await Promise.all([studentCounts(), Promise.resolve(listLocalBackups())]);
    return { counts, locals, photoBytes: photosDiskUsage() };
  }, []);

  const lastBackup = settings.lastBackupAt;
  const ageDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 86_400_000) : null;
  const overdue = ageDays === null || ageDays >= settings.backupReminderDays;

  // --- export ---------------------------------------------------------------

  const runExport = async () => {
    if (passphrase.length < MIN_PASSPHRASE) {
      setExportError(`Use at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setExportError("The two passphrases do not match.");
      return;
    }

    setExportError(null);
    setExportOpen(false);
    setProgress({ phase: "reading", fraction: 0, detail: "Preparing" });

    try {
      const result = await exportForSharing(passphrase, setProgress);
      await refreshSettings();
      reload();
      setPassphrase("");
      setConfirmPassphrase("");

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/octet-stream",
          dialogTitle: "Save your hostel backup",
        });
      } else {
        Alert.alert("Backup created", `Saved to:\n${result.uri}`);
      }
    } catch (e) {
      Alert.alert("Backup failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setProgress(null);
    }
  };

  const shareExisting = async (uri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/octet-stream" });
      }
    } catch {
      Alert.alert("Could not share that file");
    }
  };

  const runAutoBackup = async () => {
    setProgress({ phase: "reading", fraction: null, detail: "Saving a snapshot" });
    try {
      await writeAutoBackup();
      reload();
      Alert.alert(
        "Snapshot saved",
        "A copy was saved inside the app. Remember this still lives on this phone only — " +
          "export and share a backup to keep it somewhere safe."
      );
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setProgress(null);
    }
  };

  // --- restore --------------------------------------------------------------

  const pickRestoreFile = async () => {
    setRestoreError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: "*/*",
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const header = readBackupHeader(asset.uri);
      setRestoreFile({ uri: asset.uri, name: asset.name ?? "backup" });
      setRestoreHeader(header);
    } catch (e) {
      setRestoreFile(null);
      setRestoreHeader(null);
      setRestoreError(e instanceof BackupError ? e.message : "That file could not be read.");
    }
  };

  const confirmRestore = () => {
    if (!restoreFile || !restoreHeader) return;
    if (restoreHeader.encryption && !restorePassphrase.trim()) {
      setRestoreError("Enter the passphrase for this backup.");
      return;
    }

    Alert.alert(
      "Replace everything?",
      `All ${data?.counts.total ?? 0} student records on this phone will be replaced by the ` +
        `${restoreHeader.counts.students} in this backup. A safety copy of your current data is ` +
        "saved first.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Replace", style: "destructive", onPress: runRestore },
      ]
    );
  };

  const runRestore = async () => {
    if (!restoreFile || !restoreHeader) return;
    setRestoreError(null);
    setProgress({ phase: "verifying", fraction: null, detail: "Checking the file" });

    try {
      const result = await restoreBackup(
        restoreFile.uri,
        restoreHeader.encryption ? restorePassphrase : null,
        setProgress
      );
      await refreshSettings();
      invalidate();
      reload();
      setRestoreFile(null);
      setRestoreHeader(null);
      setRestorePassphrase("");

      Alert.alert(
        "Restore complete",
        `${result.counts.students} students, ${result.counts.rooms} rooms and ` +
          `${result.photosRestored} photos are now on this phone.`
      );
    } catch (e) {
      setRestoreError(
        e instanceof BackupError ? e.message : "The restore failed. Your data was not changed."
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Callout tone={overdue ? "warning" : "success"}
          icon={overdue ? "warning-outline" : "shield-checkmark-outline"}>
          <CalloutText style={{ fontWeight: "700" }}>
            {lastBackup ? `Last backup ${formatDateTime(lastBackup)}` : "You have never backed up"}
          </CalloutText>
          <CalloutText style={{ marginTop: 3 }}>
            {overdue
              ? "This phone is the only copy of your hostel's records. If it is lost, stolen or broken, everything goes with it."
              : "Keep exporting regularly, and store the file somewhere other than this phone."}
          </CalloutText>
        </Callout>

        <SectionTitle title="What is on this phone" />
        <Card>
          <DetailRow label="Students" value={data?.counts.total ?? 0} />
          <Divider />
          <DetailRow label="Photos on disk" value={formatBytes(data?.photoBytes ?? 0)} />
          <Divider />
          <DetailRow label="Snapshots kept in app" value={data?.locals.length ?? 0} />
        </Card>

        <SectionTitle title="Export a backup" />
        <Card>
          <Text style={styles.paragraph}>
            Creates one encrypted <Text style={styles.bold}>.hostelbak</Text> file containing every
            student, room, bill, payment and photo. Send it to yourself on WhatsApp, email it, or
            copy it to a laptop or pen drive.
          </Text>
          <Button
            title="Export & share backup"
            icon="cloud-upload-outline"
            onPress={() => {
              setExportError(null);
              setExportOpen(true);
            }}
          />
          <Button
            title="Save a snapshot inside the app"
            variant="secondary"
            icon="save-outline"
            onPress={runAutoBackup}
            style={{ marginTop: spacing.sm }}
          />
        </Card>

        <SectionTitle title="Restore from a backup" />
        <Card>
          <Text style={styles.paragraph}>
            Replaces everything currently on this phone with the contents of a backup file. Your
            current data is snapshotted first, so a wrong file can be undone.
          </Text>

          <Button
            title={restoreFile ? "Choose a different file" : "Choose backup file"}
            variant="secondary"
            icon="folder-open-outline"
            onPress={pickRestoreFile}
          />

          {restoreHeader && restoreFile ? (
            <View style={styles.restoreBox}>
              <Text style={styles.restoreName} numberOfLines={1}>
                {restoreFile.name}
              </Text>
              <Text style={styles.restoreMeta}>
                {restoreHeader.hostelName} · {restoreHeader.counts.students} students ·{" "}
                {formatDateTime(restoreHeader.createdAt)}
              </Text>
              <Text style={styles.restoreMeta}>
                {restoreHeader.encryption ? "🔒 Encrypted" : "⚠️ Not encrypted"}
              </Text>

              {restoreHeader.encryption ? (
                <Input
                  label="Backup passphrase"
                  value={restorePassphrase}
                  onChangeText={setRestorePassphrase}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="Enter the passphrase"
                  containerStyle={{ marginTop: spacing.md, marginBottom: spacing.sm }}
                />
              ) : null}

              <Button
                title="Restore and replace"
                variant="danger"
                icon="download-outline"
                onPress={confirmRestore}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : null}

          {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
        </Card>

        {data && data.locals.length > 0 ? (
          <>
            <SectionTitle title="Snapshots on this phone" />
            <Callout tone="warning" icon="information-circle-outline">
              <CalloutText>
                These live inside the app. Uninstalling the app deletes them — they are a safety
                net against mistakes, not against losing the phone.
              </CalloutText>
            </Callout>
            {data.locals.map((backup) => (
              <Card key={backup.uri} style={styles.localRow}>
                <Ionicons name="archive-outline" size={20} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.localName} numberOfLines={1}>
                    {backup.name}
                  </Text>
                  <Text style={styles.localMeta}>
                    {formatBytes(backup.sizeBytes)} · {formatDateTime(backup.createdAt)}
                  </Text>
                </View>
                <Pressable onPress={() => shareExisting(backup.uri)} hitSlop={8}>
                  <Ionicons name="share-outline" size={19} color={colors.primary} />
                </Pressable>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Passphrase prompt for a new export */}
      <Modal visible={exportOpen} transparent animationType="slide" onRequestClose={() => setExportOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setExportOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Protect this backup</Text>
          <Text style={styles.sheetText}>
            The file will contain student photos, phone numbers and fee records. Choose a
            passphrase — you will need exactly this passphrase to restore it.
          </Text>

          <Input
            label="Passphrase"
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            placeholder={`At least ${MIN_PASSPHRASE} characters`}
            icon="key-outline"
          />
          <Input
            label="Confirm passphrase"
            value={confirmPassphrase}
            onChangeText={setConfirmPassphrase}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter it again"
            error={exportError ?? undefined}
          />

          <Callout tone="danger" icon="alert-circle-outline">
            <CalloutText>
              There is no recovery. Lose this passphrase and the backup is unreadable — write it
              down somewhere safe.
            </CalloutText>
          </Callout>

          <Button title="Create backup" onPress={runExport} />
          <Button title="Cancel" variant="ghost" onPress={() => setExportOpen(false)} />
        </View>
      </Modal>

      <ProgressOverlay
        visible={progress !== null}
        title={
          progress?.phase === "decrypting" || progress?.phase === "restoring"
            ? "Restoring"
            : "Backing up"
        }
        detail={progress?.detail}
        fraction={progress?.fraction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  paragraph: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  bold: { fontWeight: "700", color: colors.text },
  restoreBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  restoreName: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  restoreMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 3 },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.sm },
  localRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  localName: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  localMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  sheetText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
});
