import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import FormScroll from "@/components/FormScroll";
import { Alert } from "@/web/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Callout, CalloutText, EmptyState, Loading } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { Fab } from "@/components/Controls";
import { colors, fontSize, radius, shadow, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import {
  MIN_PASSWORD,
  StaffRecord,
  USERNAME_PATTERN,
  changeOwnPassword,
  createManager,
  removeManager,
  resetManagerPassword,
  setManagerDisabled,
  updateManager,
  watchStaff,
} from "@/services/staff";
import { initials } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Staff">;

/** Which form the bottom sheet is showing. */
type Sheet =
  | { kind: "create" }
  | { kind: "reset"; staff: StaffRecord }
  | { kind: "edit"; staff: StaffRecord }
  | { kind: "own" };

/**
 * Logins, for the admin only: who can open the app, which hostel each manager
 * runs, and the ways back in when someone forgets a password or leaves.
 */
export default function StaffScreen(_: Props) {
  const { branches, user } = useApp();
  const [staff, setStaff] = useState<StaffRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => watchStaff(setStaff, setLoadError), []);

  const branchName = (branchId: string | null) =>
    branches.find((b) => b.id === branchId)?.shortName ||
    branches.find((b) => b.id === branchId)?.name ||
    "No hostel";

  /** Runs one change, showing the server's own wording if it refuses. */
  const run = async (uid: string, work: () => Promise<unknown>) => {
    setBusyUid(uid);
    try {
      await work();
    } catch (error) {
      Alert.alert("Could not do that", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusyUid(null);
    }
  };

  const confirmDisable = (person: StaffRecord) => {
    if (person.disabled) {
      void run(person.uid, () => setManagerDisabled(person.uid, false));
      return;
    }
    Alert.alert(
      `Switch off ${person.name}?`,
      "They are signed out straight away and cannot log in until you switch the login back on.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Switch off", style: "destructive", onPress: () => void run(person.uid, () => setManagerDisabled(person.uid, true)) },
      ]
    );
  };

  const confirmRemove = (person: StaffRecord) => {
    Alert.alert(
      `Remove ${person.name}?`,
      "This login is deleted for good. Everything they entered stays in the records.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove login", style: "destructive", onPress: () => void run(person.uid, () => removeManager(person.uid)) },
      ]
    );
  };

  const managers = (staff ?? []).filter((s) => s.role === "manager");
  const admins = (staff ?? []).filter((s) => s.role === "admin");

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <FormScroll contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loadError ? (
          <Callout tone="danger" icon="cloud-offline-outline">
            <CalloutText>{loadError}</CalloutText>
          </Callout>
        ) : null}

        {!staff ? (
          <Loading label="Loading logins…" />
        ) : (
          <>
            <Text style={styles.groupLabel}>ADMIN</Text>
            {admins.map((person) => (
              <View key={person.uid} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, styles.avatarAdmin]}>
                    <Ionicons name="shield-checkmark" size={20} color={colors.goldLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{person.name || person.username}</Text>
                    <Text style={styles.meta} numberOfLines={1}>User ID: {person.username} · both hostels</Text>
                  </View>
                </View>
                {person.username === user?.username ? (
                  <View style={styles.actions}>
                    <ActionChip icon="key-outline" label="Change password" onPress={() => setSheet({ kind: "own" })} />
                  </View>
                ) : null}
              </View>
            ))}

            <Text style={styles.groupLabel}>MANAGERS</Text>
            {managers.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No managers yet"
                message="Add a login for each hostel's manager. They see and change only their own hostel."
              />
            ) : (
              managers.map((person) => (
                <View key={person.uid} style={[styles.card, busyUid === person.uid && { opacity: 0.6 }]}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(person.name || person.username)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>{person.name || person.username}</Text>
                        {person.disabled ? <Badge label="OFF" tone="danger" /> : <Badge label="ACTIVE" tone="success" />}
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>User ID: {person.username}</Text>
                      <Text style={styles.meta} numberOfLines={1}>{branchName(person.branchId)} hostel</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <ActionChip icon="key-outline" label="Reset password" onPress={() => setSheet({ kind: "reset", staff: person })} />
                    <ActionChip icon="create-outline" label="Edit" onPress={() => setSheet({ kind: "edit", staff: person })} />
                    <ActionChip
                      icon={person.disabled ? "play-outline" : "pause-outline"}
                      label={person.disabled ? "Switch on" : "Switch off"}
                      onPress={() => confirmDisable(person)}
                    />
                    <ActionChip icon="trash-outline" label="Remove" danger onPress={() => confirmRemove(person)} />
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </FormScroll>

      <Fab icon="person-add" label="Add manager" onPress={() => setSheet({ kind: "create" })} />

      <StaffSheet sheet={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surfaceAlt }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={[styles.chipText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

/** The add / edit / password forms, sliding up from the bottom. */
function StaffSheet({ sheet, onClose }: { sheet: Sheet | null; onClose: () => void }) {
  const { branches } = useApp();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A fresh form each time the sheet opens.
  useEffect(() => {
    if (!sheet) return;
    setName(sheet.kind === "edit" ? sheet.staff.name : "");
    setUsername("");
    setBranchId(sheet.kind === "edit" ? sheet.staff.branchId : null);
    setCurrent("");
    setPassword("");
    setConfirm("");
    setError(null);
    setSaving(false);
  }, [sheet]);

  if (!sheet) return null;

  const needsPassword = sheet.kind !== "edit";
  const needsDetails = sheet.kind === "create" || sheet.kind === "edit";

  const title =
    sheet.kind === "create"
      ? "Add a manager"
      : sheet.kind === "edit"
        ? `Edit ${sheet.staff.name}`
        : sheet.kind === "reset"
          ? `New password for ${sheet.staff.name}`
          : "Change the admin password";

  const check = (): string | null => {
    if (needsDetails && name.trim().length < 2) return "Enter the manager's name.";
    if (sheet.kind === "create" && !USERNAME_PATTERN.test(username.trim().toLowerCase())) {
      return "User ID: 3 to 30 small letters, digits, dot, dash or underscore. No spaces.";
    }
    if (needsDetails && !branchId) return "Choose which hostel this manager runs.";
    if (sheet.kind === "own" && !current) return "Enter the current password.";
    if (needsPassword && password.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
    if (needsPassword && password !== confirm) return "The two passwords do not match.";
    return null;
  };

  const onSave = async () => {
    const problem = check();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (sheet.kind === "create") {
        await createManager({ username, name, password, branchId: branchId as string });
      } else if (sheet.kind === "edit") {
        await updateManager(sheet.staff.uid, { name: name.trim(), branchId: branchId as string });
      } else if (sheet.kind === "reset") {
        await resetManagerPassword(sheet.staff.uid, password);
      } else {
        await changeOwnPassword(current, password);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved. Try again.");
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetStage}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        <FormScroll keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {needsDetails ? (
            <Input label="Name" required value={name} onChangeText={setName} icon="person-outline" placeholder="e.g. Rahul K" />
          ) : null}
          {sheet.kind === "create" ? (
            <Input
              label="User ID"
              required
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              icon="at-outline"
              placeholder="e.g. thammanam"
              hint="What they type to log in. It cannot be changed later."
            />
          ) : null}
          {needsDetails ? (
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.fieldLabel}>Hostel *</Text>
              <View style={styles.branchChoices}>
                {branches.map((branch) => {
                  const active = branch.id === branchId;
                  return (
                    <Pressable
                      key={branch.id}
                      onPress={() => setBranchId(branch.id)}
                      style={[styles.branchChoice, active && styles.branchChoiceActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons
                        name={active ? "radio-button-on" : "radio-button-off"}
                        size={18}
                        color={active ? colors.primary : colors.textFaint}
                      />
                      <Text style={[styles.branchChoiceText, active && { color: colors.primary }]} numberOfLines={1}>
                        {branch.shortName || branch.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {sheet.kind === "own" ? (
            <Input label="Current password" required value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" icon="lock-closed-outline" />
          ) : null}
          {needsPassword ? (
            <>
              <Input
                label={sheet.kind === "create" ? "Password" : "New password"}
                required
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                icon="key-outline"
                hint={`At least ${MIN_PASSWORD} characters.`}
              />
              <Input label="Type it again" required value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" icon="key-outline" />
            </>
          ) : null}

          {sheet.kind === "reset" ? (
            <Callout tone="info">
              <CalloutText>Every phone signed in with the old password is signed out. Tell them the new one.</CalloutText>
            </Callout>
          ) : null}
          {error ? (
            <Callout tone="danger" icon="alert-circle-outline">
              <CalloutText>{error}</CalloutText>
            </Callout>
          ) : null}

          <Button
            title={sheet.kind === "create" ? "Create login" : sheet.kind === "edit" ? "Save changes" : "Save password"}
            onPress={onSave}
            loading={saving}
          />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </FormScroll>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 4 },
  groupLabel: {
    ...type.label,
    color: colors.textFaint,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadow.subtle,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarAdmin: { backgroundColor: colors.primaryDark },
  avatarText: { ...type.bodyStrong, color: colors.primary },
  name: { ...type.bodyStrong, color: colors.text },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meta: { ...type.support, color: colors.textMuted, marginTop: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    minHeight: 36,
    backgroundColor: colors.surface,
  },
  chipText: { ...type.bodyStrong, fontSize: fontSize.xs + 1 },

  sheetStage: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  // An iOS form sheet: floats clear of the edges, and no wider than the app.
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    margin: spacing.sm + 2,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { ...type.section, color: colors.text, marginBottom: spacing.md },
  fieldLabel: { ...type.support, fontFamily: type.bodyStrong.fontFamily, color: colors.text, marginBottom: spacing.xs + 2 },
  branchChoices: { flexDirection: "row", gap: spacing.sm },
  branchChoice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  branchChoiceActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  branchChoiceText: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
});
