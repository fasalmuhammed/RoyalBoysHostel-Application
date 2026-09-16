import React, { useEffect, useState } from "react";
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
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
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
import { inmateCounts } from "@/services/inmates";
import { formatDateTime } from "@/utils/format";
import {
  CloudBackup,
  CloudUser,
  createCloudAccount,
  deleteCloudBackup,
  downloadCloudBackup,
  listCloudBackups,
  resetCloudPassword,
  signInToCloud,
  signOutOfCloud,
  subscribeCloudUser,
  uploadCloudBackup,
} from "@/services/cloudBackup";
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

  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudPassphrase, setCloudPassphrase] = useState("");
  const [cloudPassphraseConfirm, setCloudPassphraseConfirm] = useState("");
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const { data, reload } = useAsyncData(async () => {
    const [counts, locals] = await Promise.all([inmateCounts(), Promise.resolve(listLocalBackups())]);
    return { counts, locals, photoBytes: photosDiskUsage() };
  }, []);

  const lastBackup = settings.lastBackupAt;
  const ageDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 86_400_000) : null;
  const overdue = ageDays === null || ageDays >= settings.backupReminderDays;

  const reloadCloud = async () => {
    if (!cloudUser) {
      setCloudBackups([]);
      return;
    }
    try {
      setCloudBackups(await listCloudBackups());
      setCloudError(null);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not load cloud backups.");
    }
  };

  useEffect(() => {
    return subscribeCloudUser((user) => {
      setCloudUser(user);
      setCloudReady(true);
      if (user) {
        listCloudBackups()
          .then(setCloudBackups)
          .catch((error) => setCloudError(error instanceof Error ? error.message : "Could not load cloud backups."));
      } else {
        setCloudBackups([]);
      }
    });
  }, []);

  const runCloudAuth = async (mode: "signin" | "create") => {
    if (!cloudEmail.trim() || cloudPassword.length < 6) {
      setCloudError("Enter your email and a password of at least 6 characters.");
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    try {
      if (mode === "signin") await signInToCloud(cloudEmail, cloudPassword);
      else await createCloudAccount(cloudEmail, cloudPassword);
      setCloudPassword("");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Cloud sign-in failed.");
    } finally {
      setCloudBusy(false);
    }
  };

  const runPasswordReset = async () => {
    if (!cloudEmail.trim()) {
      setCloudError("Enter your cloud account email first.");
      return;
    }
    try {
      await resetCloudPassword(cloudEmail);
      Alert.alert("Reset email sent", "Check your inbox for the password reset link.");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not send the reset email.");
    }
  };

  const runCloudUpload = async () => {
    if (cloudPassphrase.length < MIN_PASSPHRASE) {
      setCloudError(`Use a backup passphrase of at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (cloudPassphrase !== cloudPassphraseConfirm) {
      setCloudError("The two backup passphrases do not match.");
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    setProgress({ phase: "reading", fraction: 0, detail: "Preparing encrypted backup" });
    try {
      await uploadCloudBackup(cloudPassphrase, setProgress);
      await refreshSettings();
      await reloadCloud();
      setCloudPassphrase("");
      setCloudPassphraseConfirm("");
      Alert.alert("Cloud backup complete", "The encrypted backup is safely stored in your cloud account.");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Cloud backup failed.");
    } finally {
      setCloudBusy(false);
      setProgress(null);
    }
  };

  const selectCloudRestore = async (backup: CloudBackup) => {
    setCloudBusy(true);
    setCloudError(null);
    setProgress({ phase: "downloading", fraction: null, detail: "Downloading encrypted backup" });
    try {
      const file = await downloadCloudBackup(backup, setProgress);
      const header = readBackupHeader(file.uri);
      setRestoreFile(file);
      setRestoreHeader(header);
      setRestorePassphrase("");
      Alert.alert("Backup downloaded", "Enter its passphrase in the Import section below to restore it.");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not download that backup.");
    } finally {
      setCloudBusy(false);
      setProgress(null);
    }
  };

  const confirmCloudDelete = (backup: CloudBackup) => {
    Alert.alert("Delete cloud backup?", `${backup.name} will be permanently removed from cloud storage.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setCloudBusy(true);
          try {
            await deleteCloudBackup(backup.fullPath);
            await reloadCloud();
          } catch (error) {
            setCloudError(error instanceof Error ? error.message : "Could not delete that backup.");
          } finally {
            setCloudBusy(false);
          }
        },
      },
    ]);
  };

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
      "Add data from this backup?",
      `Up to ${restoreHeader.counts.students} inmates from this backup will be added to the ` +
        `${data?.counts.total ?? 0} already on this phone. Anything already here is kept as-is — ` +
        "nothing is deleted or overwritten. A safety copy of your current data is saved first.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add data", onPress: runRestore },
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

      const studentsAdded = result.inserted.students ?? 0;
      const studentsSkipped = result.skipped.students ?? 0;
      const roomsAdded = result.inserted.rooms ?? 0;

      Alert.alert(
        "Import complete",
        `${studentsAdded} inmate${studentsAdded === 1 ? "" : "s"} and ${roomsAdded} room${
          roomsAdded === 1 ? "" : "s"
        } added, plus ${result.photosRestored} photo${result.photosRestored === 1 ? "" : "s"}.` +
          (studentsSkipped > 0
            ? ` ${studentsSkipped} inmate${studentsSkipped === 1 ? "" : "s"} from the backup ${
                studentsSkipped === 1 ? "was" : "were"
              } already on this phone and ${studentsSkipped === 1 ? "was" : "were"} left unchanged.`
            : "")
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
          <CalloutText style={{ fontFamily: font.bold }}>
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
          <DetailRow label="Inmates" value={data?.counts.total ?? 0} />
          <Divider />
          <DetailRow label="Photos on disk" value={formatBytes(data?.photoBytes ?? 0)} />
          <Divider />
          <DetailRow label="Snapshots kept in app" value={data?.locals.length ?? 0} />
        </Card>

        <SectionTitle title="Encrypted cloud backup" />
        <Card>
          {!cloudReady ? (
            <Text style={styles.paragraph}>Checking your cloud account…</Text>
          ) : !cloudUser ? (
            <>
              <Text style={styles.paragraph}>
                Sign in with an administrator email. Backups are encrypted on this phone before
                upload, and this account is the only one allowed to access its cloud folder.
              </Text>
              <Input
                label="Cloud account email"
                value={cloudEmail}
                onChangeText={setCloudEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="admin@example.com"
                icon="mail-outline"
              />
              <Input
                label="Cloud account password"
                value={cloudPassword}
                onChangeText={setCloudPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="At least 6 characters"
                icon="lock-closed-outline"
              />
              <Button title="Sign in" icon="cloud-outline" onPress={() => runCloudAuth("signin")} loading={cloudBusy} />
              <Button
                title="Create cloud account"
                variant="secondary"
                onPress={() => runCloudAuth("create")}
                disabled={cloudBusy}
                style={{ marginTop: spacing.sm }}
              />
              <Button title="Forgot password" variant="ghost" onPress={runPasswordReset} disabled={cloudBusy} />
            </>
          ) : (
            <>
              <View style={styles.cloudAccountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.localName}>Cloud account</Text>
                  <Text style={styles.localMeta}>{cloudUser.email ?? "Signed in"}</Text>
                </View>
                <Button title="Sign out" variant="ghost" compact onPress={() => signOutOfCloud()} />
              </View>

              <Input
                label="Backup passphrase"
                value={cloudPassphrase}
                onChangeText={setCloudPassphrase}
                secureTextEntry
                autoCapitalize="none"
                placeholder={`At least ${MIN_PASSPHRASE} characters`}
                icon="key-outline"
              />
              <Input
                label="Confirm backup passphrase"
                value={cloudPassphraseConfirm}
                onChangeText={setCloudPassphraseConfirm}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Enter it again"
              />
              <Button
                title="Upload encrypted cloud backup"
                icon="cloud-upload-outline"
                onPress={runCloudUpload}
                loading={cloudBusy}
              />
              <View style={{ marginTop: spacing.md }}>
                <Callout tone="warning" icon="key-outline">
                  <CalloutText>
                    Your account password can be reset; the backup passphrase cannot. Keep it in a
                    password manager because every cloud backup needs it for recovery.
                  </CalloutText>
                </Callout>
              </View>
            </>
          )}

          {cloudError ? <Text style={styles.error}>{cloudError}</Text> : null}
        </Card>

        {cloudUser && cloudBackups.length > 0 ? (
          <>
            <SectionTitle title={`Cloud backups (${cloudBackups.length})`} />
            {cloudBackups.map((backup) => (
              <Card key={backup.fullPath} style={styles.localRow}>
                <Ionicons name="cloud-done-outline" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.localName} numberOfLines={1}>{backup.name}</Text>
                  <Text style={styles.localMeta}>
                    {formatBytes(backup.sizeBytes)} · {formatDateTime(backup.createdAt)}
                  </Text>
                </View>
                <Pressable onPress={() => selectCloudRestore(backup)} disabled={cloudBusy} hitSlop={8}>
                  <Ionicons name="download-outline" size={20} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => confirmCloudDelete(backup)} disabled={cloudBusy} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle title="Export a backup" />
        <Card>
          <Text style={styles.paragraph}>
            Creates one encrypted <Text style={styles.bold}>.hostelbak</Text> file containing every
            inmate, room, bill, payment and photo. Send it to yourself on WhatsApp, email it, or
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

        <SectionTitle title="Import from a backup" />
        <Card>
          <Text style={styles.paragraph}>
            Adds the inmates, rooms, bills, payments and photos from a backup file to what is
            already on this phone. Anything already here is kept as-is — nothing is deleted or
            overwritten. Your current data is snapshotted first regardless, so this can always be
            undone.
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
                {restoreHeader.hostelName} · {restoreHeader.counts.students} inmates ·{" "}
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
                title="Add to this phone"
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
            The file will contain inmate photos, phone numbers and fee records. Choose a
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
            ? "Importing"
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
  bold: { fontFamily: font.bold, color: colors.text },
  restoreBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  restoreName: { ...type.bodyStrong, color: colors.text },
  restoreMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 3 },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.sm },
  localRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  localName: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.text },
  localMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  cloudAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
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
  sheetTitle: { ...type.section, color: colors.text },
  sheetText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
});
