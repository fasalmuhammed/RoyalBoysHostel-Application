import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import FormScroll from "@/components/FormScroll";
import { Alert } from "@/web/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, Loading } from "@/components/Base";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { Fab } from "@/components/Controls";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
import { useAsyncData } from "@/utils/hooks";
import { deleteTemplate, listTemplates, saveTemplate, TEMPLATE_PLACEHOLDERS } from "@/services/messaging";
import { MessageKind, MessageTemplate } from "@/types";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Templates">;

export default function TemplatesScreen({}: Props) {
  const { data: templates, loading, reload } = useAsyncData(() => listTemplates(), []);

  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<MessageKind>("announcement");
  const [saving, setSaving] = useState(false);

  const openEditor = (template: MessageTemplate | null) => {
    setEditing(template);
    setCreating(template === null);
    setName(template?.name ?? "");
    setBody(template?.body ?? "");
    setKind(template?.kind ?? "announcement");
  };

  const closeEditor = () => {
    setEditing(null);
    setCreating(false);
  };

  const onSave = async () => {
    if (!name.trim() || !body.trim()) {
      Alert.alert("Incomplete", "Give the template a name and some text.");
      return;
    }
    setSaving(true);
    try {
      await saveTemplate(editing?.id ?? null, name.trim(), kind, body);
      closeEditor();
      reload();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (template: MessageTemplate) => {
    Alert.alert("Delete template?", `"${template.name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTemplate(template.id);
          reload();
        },
      },
    ]);
  };

  if (loading && !templates) return <Loading />;

  const isOpen = editing !== null || creating;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <FormScroll contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>
          Templates save you retyping. Placeholders like {"{{name}}"} are filled in per inmate when
          you send.
        </Text>

        {(templates ?? []).map((template) => (
          <Card key={template.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{template.name}</Text>
              {template.isBuiltIn ? <Badge label="BUILT-IN" tone="neutral" /> : null}
            </View>
            <Text style={styles.cardBody} numberOfLines={4}>
              {template.body}
            </Text>
            <View style={styles.cardActions}>
              <Pressable onPress={() => openEditor(template)} style={styles.cardAction}>
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.cardActionText}>Edit</Text>
              </Pressable>
              {!template.isBuiltIn ? (
                <Pressable onPress={() => onDelete(template)} style={styles.cardAction}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.cardActionText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))}
      </FormScroll>

      <Fab label="New" onPress={() => openEditor(null)} />

      <Modal visible={isOpen} animationType="slide" onRequestClose={closeEditor}>
        <SafeAreaView style={styles.screen}>
          <FormScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {creating ? "New template" : "Edit template"}
              </Text>
              <Pressable onPress={closeEditor} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <Input
              label="Template name"
              required
              value={name}
              onChangeText={setName}
              placeholder="e.g. Fee overdue notice"
            />

            <Text style={styles.kindLabel}>Used for</Text>
            <View style={styles.kindRow}>
              {(["announcement", "fee_reminder", "custom"] as MessageKind[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setKind(option)}
                  style={[styles.kindChip, kind === option && styles.kindChipActive]}
                >
                  <Text style={[styles.kindText, kind === option && styles.kindTextActive]}>
                    {option === "fee_reminder"
                      ? "Fee reminder"
                      : option === "announcement"
                        ? "Announcement"
                        : "Other"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Input
              label="Message text"
              required
              value={body}
              onChangeText={setBody}
              multiline
              placeholder="Write the message…"
              style={{ minHeight: 160 }}
            />

            <View style={styles.chips}>
              {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                <Pressable
                  key={placeholder}
                  onPress={() => setBody((current) => `${current}${placeholder}`)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{placeholder}</Text>
                </Pressable>
              ))}
            </View>

            <Button title="Save template" onPress={onSave} loading={saving} />
          </FormScroll>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 110 },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  card: { padding: spacing.md },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardTitle: { ...type.bodyStrong, color: colors.text, flex: 1 },
  cardBody: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 19 },
  cardActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  cardAction: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardActionText: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.primary },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  modalTitle: { ...type.title, color: colors.text },
  kindLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: font.semibold,
    marginBottom: spacing.xs + 2,
  },
  kindRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  kindChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindText: { ...type.bodyStrong, fontSize: fontSize.sm, color: colors.textMuted },
  kindTextActive: { color: colors.primaryOn },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  chipText: { ...type.label, color: colors.primary },
});
