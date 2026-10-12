import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { getActiveBranchId } from "@/services/branches";
import {
  CATEGORY_LABELS,
  createNotice,
  getNotice,
  noticeToMessage,
  updateNotice,
} from "@/services/notices";
import { NoticeCategory } from "@/types";
import { toIsoDate } from "@/utils/format";
import { successFeedback } from "@/utils/haptics";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "NoticeForm">;

const CATEGORIES: NoticeCategory[] = ["general", "event", "maintenance", "urgent"];

export default function NoticeFormScreen({ navigation, route }: Props) {
  const noticeId = route.params?.noticeId;
  const isEditing = Boolean(noticeId);
  const { invalidate, activeBranch, access, allHostels } = useApp();
  const branchLabel = activeBranch?.shortName ?? "this branch";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<NoticeCategory>("general");
  const [pinned, setPinned] = useState(false);
  // Posted while both hostels are showing: for both, unless switched off below.
  const [allBranches, setAllBranches] = useState(allHostels);
  const [postedOn, setPostedOn] = useState(toIsoDate());
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit notice" : "New notice" });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!noticeId) return;
    (async () => {
      const notice = await getNotice(noticeId);
      if (!notice) return;
      setTitle(notice.title);
      setBody(notice.body);
      setCategory(notice.category);
      setPinned(notice.pinned);
      setAllBranches(notice.branchId === null);
      setPostedOn(notice.postedOn);
    })();
  }, [noticeId]);

  const validate = (): boolean => {
    const next: { title?: string; body?: string } = {};
    if (!title.trim()) next.title = "Give the notice a heading.";
    if (!body.trim()) next.body = "Write what the notice says.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const persist = async (): Promise<string | null> => {
    const payload = {
      // null means "every branch" -- the board shows it on both.
      branchId: allBranches ? null : (getActiveBranchId() ?? activeBranch?.id ?? null),
      title: title.trim(),
      body: body.trim(),
      category,
      pinned,
      postedOn: postedOn || toIsoDate(),
    };
    if (noticeId) {
      await updateNotice(noticeId, payload);
      return noticeId;
    }
    return createNotice(payload);
  };

  const onSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await persist();
      successFeedback();
      invalidate();
      navigation.goBack();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Saves first, then hands off to the composer.
   *
   * Sending an unsaved notice would leave the board without the very notice
   * that just went out to every inmate, so the record is always written first.
   */
  const onSaveAndSend = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const id = await persist();
      invalidate();
      if (!id) return;
      navigation.replace("Compose", {
        kind: "announcement",
        presetBody: noticeToMessage({ title: title.trim(), body: body.trim() }),
        noticeId: id,
      });
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Input
          label="Heading"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Water supply interrupted on 12 Sep"
          icon="megaphone-outline"
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

        <Input
          label="Notice"
          required
          value={body}
          onChangeText={setBody}
          placeholder="Write the full notice here…"
          multiline
          style={{ minHeight: 150 }}
          error={errors.body}
        />

        <Input
          label="Posted on"
          value={postedOn}
          onChangeText={setPostedOn}
          placeholder="YYYY-MM-DD"
          icon="calendar-outline"
        />

        {/* Only the admin posts to both hostels; a manager's notices are their branch's. */}
        <View style={[styles.switchRow, access.isOwner ? null : { display: "none" }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Applies to both branches</Text>
            <Text style={styles.switchHint}>
              {allBranches
                ? "Shows on the board at both hostels."
                : `Only ${branchLabel} will see this notice.`}
            </Text>
          </View>
          <Switch
            value={allBranches}
            onValueChange={setAllBranches}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Pin to top</Text>
            <Text style={styles.switchHint}>Keeps this notice above the rest of the board.</Text>
          </View>
          <Switch
            value={pinned}
            onValueChange={setPinned}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </View>

        <SectionTitle title="How it will read on WhatsApp" />
        <View style={styles.preview}>
          <Text style={styles.previewText}>
            {noticeToMessage({
              title: title.trim() || "Your heading",
              body: body.trim() || "Your notice text",
            })}
          </Text>
        </View>
        <Text style={styles.previewHint}>
          <Ionicons name="information-circle-outline" size={12} color={colors.textFaint} />{" "}
          {"{{name}}"} and {"{{hostel}}"} are replaced per inmate when you send.
        </Text>

        <Callout tone="info" icon="phone-portrait-outline">
          <CalloutText>
            Posting a notice does not send it. It goes on the board here; use "Save & send" to open
            the WhatsApp queue, where you choose who receives it.
          </CalloutText>
        </Callout>

        <Button
          title="Save & send on WhatsApp"
          icon="logo-whatsapp"
          onPress={onSaveAndSend}
          loading={saving}
        />
        <Button
          title={isEditing ? "Save changes" : "Save to board only"}
          variant="secondary"
          onPress={onSave}
          loading={saving}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  switchLabel: { ...type.bodyStrong, color: colors.text },
  switchHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  preview: {
    backgroundColor: "#E7FFDB",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  previewText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  previewHint: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
});
