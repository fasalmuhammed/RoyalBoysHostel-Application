import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, Screen } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ProgressOverlay } from "@/components/Controls";
import { colors, font, fontSize, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import {
  BackupError,
  BackupHeader,
  BackupProgress,
  readBackupHeader,
  restoreBackup,
} from "@/services/backup";
import { formatDateTime } from "@/utils/format";
import type { SetupStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<SetupStackParamList, "RestoreExisting">;

/**
 * Restore during first-run setup.
 *
 * The file is inspected and its header shown *before* anything is applied, so
 * the admin can confirm they picked the right backup — the counts and the date
 * are the only way to tell two `.hostelbak` files apart on a phone.
 */
export default function RestoreExistingScreen({ navigation }: Props) {
  const { updateSettings, refreshSettings, invalidate } = useApp();

  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [header, setHeader] = useState<BackupHeader | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BackupProgress | null>(null);

  const pickFile = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: "*/*",
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const parsed = readBackupHeader(asset.uri);
      setFileUri(asset.uri);
      setFileName(asset.name ?? "backup");
      setHeader(parsed);
    } catch (e) {
      setHeader(null);
      setFileUri(null);
      setError(e instanceof BackupError ? e.message : "That file could not be read.");
    }
  };

  const runRestore = async () => {
    if (!fileUri || !header) return;
    if (header.encryption && passphrase.trim().length === 0) {
      setError("This backup is encrypted. Enter its passphrase.");
      return;
    }

    setError(null);
    setProgress({ phase: "verifying", fraction: null, detail: "Checking the file" });

    try {
      const result = await restoreBackup(
        fileUri,
        header.encryption ? passphrase : null,
        setProgress
      );
      await updateSettings({ setupComplete: true });
      await refreshSettings();
      invalidate();

      Alert.alert(
        "Restore complete",
        `${result.counts.students} inmates, ${result.counts.rooms} rooms and ` +
          `${result.photosRestored} photos were restored to this phone.`,
        [{ text: "Continue", onPress: () => navigation.navigate("CreatePin") }]
      );
    } catch (e) {
      setError(
        e instanceof BackupError ? e.message : "The restore failed. Your data has not been changed."
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Restore a backup</Text>
      <Text style={styles.subtitle}>
        Pick the <Text style={styles.mono}>.hostelbak</Text> file you exported from your previous
        phone.
      </Text>

      <Button
        title={fileUri ? "Choose a different file" : "Choose backup file"}
        icon="folder-open-outline"
        variant={fileUri ? "secondary" : "primary"}
        onPress={pickFile}
      />

      {header ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.fileRow}>
            <Ionicons name="document-lock-outline" size={20} color={colors.primary} />
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
            </Text>
          </View>

          <View style={styles.summary}>
            <Summary label="Hostel" value={header.hostelName} />
            <Summary label="Created" value={formatDateTime(header.createdAt)} />
            <Summary label="Inmates" value={String(header.counts.students)} />
            <Summary label="Rooms" value={String(header.counts.rooms)} />
            <Summary label="Invoices" value={String(header.counts.feeRecords)} />
            <Summary label="Photos" value={String(header.counts.photos)} />
          </View>

          <Callout tone={header.encryption ? "success" : "warning"}
            icon={header.encryption ? "lock-closed-outline" : "lock-open-outline"}>
            <CalloutText>
              {header.encryption
                ? "This backup is encrypted. Its passphrase is required to open it."
                : "This backup is not encrypted. Anyone with the file can read it."}
            </CalloutText>
          </Callout>

          {header.encryption ? (
            <Input
              label="Backup passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Enter the passphrase"
              secureTextEntry
              autoCapitalize="none"
              icon="key-outline"
            />
          ) : null}

          <Button title="Restore this backup" icon="download-outline" onPress={runRestore} />
        </Card>
      ) : null}

      {error ? (
        <Callout tone="danger" icon="alert-circle-outline">
          <CalloutText>{error}</CalloutText>
        </Callout>
      ) : null}

      <Button
        title="Skip — start fresh instead"
        variant="ghost"
        onPress={() => navigation.navigate("CreatePin")}
        style={{ marginTop: spacing.sm }}
      />

      <ProgressOverlay
        visible={progress !== null}
        title="Restoring your data"
        detail={progress?.detail}
        fraction={progress?.fraction}
      />
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  mono: { fontFamily: font.bold, color: colors.text },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fileName: { flex: 1, ...type.bodyStrong, color: colors.text },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: spacing.md,
    rowGap: spacing.md,
  },
  summaryItem: { width: "33%" },
  summaryValue: { ...type.bodyStrong, color: colors.text },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
});
