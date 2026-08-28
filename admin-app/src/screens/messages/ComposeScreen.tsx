import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, Card, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import Input, { PickerField } from "@/components/Input";
import { OptionPicker } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import {
  listTemplates,
  queueBatch,
  QueueRecipient,
  renderTemplate,
  TEMPLATE_PLACEHOLDERS,
} from "@/services/messaging";
import { markNoticeSent } from "@/services/notices";
import { listStudents } from "@/services/students";
import { listFees } from "@/services/fees";
import { toWhatsAppNumber } from "@/utils/validate";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Compose">;

interface Candidate {
  studentId: string;
  name: string;
  phone: string;
  photoFile: string | null;
  roomLabel: string | null;
  /** Fee context, present only when composing a reminder. */
  feeId?: string;
  period?: string;
  dueDate?: string;
  balance?: number;
}

export default function ComposeScreen({ navigation, route }: Props) {
  const kind = route.params?.kind ?? "announcement";
  const presetStudentIds = route.params?.studentIds;
  const presetFeeIds = route.params?.feeIds;
  const presetBody = route.params?.presetBody;
  const noticeId = route.params?.noticeId;

  const { settings } = useApp();

  const [body, setBody] = useState(presetBody ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);

  const { data: templates } = useAsyncData(() => listTemplates(), []);

  const { data: candidates, loading } = useAsyncData(async (): Promise<Candidate[]> => {
    if (kind === "fee_reminder") {
      const fees = await listFees("all", null, "");
      const wanted = presetFeeIds ? new Set(presetFeeIds) : null;
      return fees
        .filter((fee) => (wanted ? wanted.has(fee.id) : fee.balance > 0.01))
        .map((fee) => ({
          studentId: fee.studentId,
          name: fee.studentName,
          phone: fee.studentPhone,
          photoFile: fee.photoFile,
          roomLabel: fee.roomLabel,
          feeId: fee.id,
          period: fee.period,
          dueDate: fee.dueDate,
          balance: fee.balance,
        }));
    }

    const students = await listStudents("", "active");
    const wanted = presetStudentIds ? new Set(presetStudentIds) : null;
    return students
      .filter((student) => (wanted ? wanted.has(student.id) : true))
      .map((student) => ({
        studentId: student.id,
        name: student.fullName,
        phone: student.phone,
        photoFile: student.photoFile,
        roomLabel: student.roomLabel,
      }));
  }, [kind]);

  useEffect(() => {
    navigation.setOptions({
      title: noticeId
        ? "Send notice"
        : kind === "fee_reminder"
          ? "Fee reminders"
          : kind === "announcement"
            ? "Announcement"
            : "Message",
    });
  }, [navigation, kind, noticeId]);

  // Everyone with a usable number starts ticked; the admin unticks exceptions.
  useEffect(() => {
    if (!candidates) return;
    setSelected(
      new Set(
        candidates
          .filter((c) => toWhatsAppNumber(c.phone, settings.countryCode) !== null)
          .map((c) => c.studentId)
      )
    );
  }, [candidates, settings.countryCode]);

  // Load a sensible starting template for this kind of message. A body handed
  // in by the caller (a notice being circulated) always wins over the default.
  useEffect(() => {
    if (!templates || body || presetBody) return;
    const match = templates.find((t) => t.kind === kind) ?? templates[0];
    if (match) {
      setBody(match.body);
      setTemplateName(match.name);
    }
  }, [templates, kind, body, presetBody]);

  const reachable = useMemo(
    () => (candidates ?? []).filter((c) => toWhatsAppNumber(c.phone, settings.countryCode) !== null),
    [candidates, settings.countryCode]
  );
  const unreachable = (candidates?.length ?? 0) - reachable.length;

  const preview = useMemo(() => {
    const sample = reachable.find((c) => selected.has(c.studentId)) ?? reachable[0];
    if (!sample) return body;
    return renderTemplate(body, {
      name: sample.name,
      room: sample.roomLabel,
      hostel: settings.hostelName,
      balance: sample.balance,
      amount: sample.balance,
      period: sample.period,
      dueDate: sample.dueDate,
      currencySymbol: settings.currencySymbol,
    });
  }, [body, reachable, selected, settings]);

  const toggle = (studentId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const onQueue = async () => {
    const chosen = reachable.filter((c) => selected.has(c.studentId));
    if (chosen.length === 0) {
      Alert.alert("Nobody selected", "Pick at least one student with a valid phone number.");
      return;
    }
    if (!body.trim()) {
      Alert.alert("Nothing to send", "Write the message first.");
      return;
    }

    setQueueing(true);
    try {
      const recipients: QueueRecipient[] = chosen.map((candidate) => ({
        studentId: candidate.studentId,
        name: candidate.name,
        phone: candidate.phone,
        body: renderTemplate(body, {
          name: candidate.name,
          room: candidate.roomLabel,
          hostel: settings.hostelName,
          balance: candidate.balance,
          amount: candidate.balance,
          period: candidate.period,
          dueDate: candidate.dueDate,
          currencySymbol: settings.currencySymbol,
        }),
      }));

      const batchId = await queueBatch(kind, recipients);
      // Best-effort: the batch is already saved, so a failure to stamp the
      // board must not lose it.
      if (noticeId) await markNoticeSent(noticeId).catch(() => {});
      navigation.replace("SendQueue", { batchId });
    } catch (e) {
      Alert.alert("Could not prepare messages", e instanceof Error ? e.message : "Try again.");
    } finally {
      setQueueing(false);
    }
  };

  if (loading && !candidates) return <Loading />;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title="Message" />
        <PickerField
          label="Start from a template"
          icon="document-text-outline"
          value={templateName}
          placeholder="Choose a template"
          onPress={() => setTemplatePickerOpen(true)}
        />

        <Input
          label="Message text"
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="Write your message…"
          style={{ minHeight: 140 }}
        />

        <View style={styles.chips}>
          {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
            <Pressable
              key={placeholder}
              onPress={() => setBody((current) => `${current}${placeholder}`)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.chipText}>{placeholder}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.chipHint}>
          Tap to insert. Each is replaced with that student's own details when sending.
        </Text>

        <SectionTitle title="Preview" />
        <Card style={styles.previewCard}>
          <Text style={styles.previewText}>{preview || "Your message will appear here."}</Text>
        </Card>

        <SectionTitle
          title={`Recipients (${selected.size}/${reachable.length})`}
          action={
            <Pressable
              onPress={() =>
                setSelected(
                  selected.size === reachable.length
                    ? new Set()
                    : new Set(reachable.map((c) => c.studentId))
                )
              }
            >
              <Text style={styles.link}>
                {selected.size === reachable.length ? "Clear all" : "Select all"}
              </Text>
            </Pressable>
          }
        />

        {unreachable > 0 ? (
          <Callout tone="warning" icon="alert-circle-outline">
            <CalloutText>
              {unreachable} student(s) have no usable phone number and are not listed. Add their
              mobile number to include them.
            </CalloutText>
          </Callout>
        ) : null}

        {reachable.map((candidate) => {
          const isSelected = selected.has(candidate.studentId);
          return (
            <Pressable
              key={candidate.studentId}
              onPress={() => toggle(candidate.studentId)}
              style={({ pressed }) => [styles.recipient, pressed && { opacity: 0.85 }]}
            >
              <View
                style={[styles.checkbox, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                {isSelected ? <Ionicons name="checkmark" size={14} color={colors.primaryOn} /> : null}
              </View>
              <Avatar name={candidate.name} photoFile={candidate.photoFile} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recipientName} numberOfLines={1}>
                  {candidate.name}
                </Text>
                <Text style={styles.recipientMeta} numberOfLines={1}>
                  {candidate.phone}
                  {candidate.roomLabel ? ` · Room ${candidate.roomLabel}` : ""}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <Button
          title={`Prepare ${selected.size} message${selected.size === 1 ? "" : "s"}`}
          icon="logo-whatsapp"
          onPress={onQueue}
          loading={queueing}
          disabled={selected.size === 0}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>

      <OptionPicker
        visible={templatePickerOpen}
        title="Choose a template"
        selectedKey={null}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={(key) => {
          const template = templates?.find((t) => t.id === key);
          if (template) {
            setBody(template.body);
            setTemplateName(template.name);
          }
        }}
        options={(templates ?? []).map((template) => ({
          key: template.id,
          label: template.name,
          sublabel: template.body.replace(/\n+/g, " ").slice(0, 60) + "…",
        }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: -4 },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: "700", color: colors.primary },
  chipHint: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  previewCard: { backgroundColor: "#E7FFDB" },
  previewText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  link: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
  recipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  recipientName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  recipientMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
});
