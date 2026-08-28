import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Callout, CalloutText, Card, Loading, SectionTitle } from "@/components/Base";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useAsyncData } from "@/utils/hooks";
import { listBatches } from "@/services/messaging";
import { listDueForReminder } from "@/services/fees";
import { formatDateTime, toIsoDate } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Messages">;

export default function MessagesScreen({ navigation }: Props) {
  const { data, loading } = useAsyncData(async () => {
    const [batches, due] = await Promise.all([listBatches(), listDueForReminder(toIsoDate())]);
    return { batches, due };
  }, []);

  if (loading && !data) return <Loading />;

  const due = data?.due ?? [];
  const batches = data?.batches ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Callout tone="info" icon="information-circle-outline">
          <CalloutText style={{ fontWeight: "700" }}>How sending works</CalloutText>
          <CalloutText style={{ marginTop: 3 }}>
            The app writes each message and opens WhatsApp with it ready to go — you tap send. No
            third-party app is allowed to send from your number silently, and tools that claim
            otherwise risk getting your number banned.
          </CalloutText>
        </Callout>

        <SectionTitle title="Send something" />

        <ActionCard
          icon="megaphone-outline"
          tone={colors.primary}
          title="Announcement"
          description="Send a notice to every student, or pick who receives it."
          onPress={() => navigation.navigate("Compose", { kind: "announcement" })}
        />

        <ActionCard
          icon="alarm-outline"
          tone={due.length > 0 ? colors.danger : colors.textMuted}
          title="Fee reminders"
          description={
            due.length > 0
              ? `${due.length} student(s) have fees past their due date.`
              : "Nobody is overdue right now."
          }
          badge={due.length > 0 ? String(due.length) : undefined}
          onPress={() =>
            navigation.navigate("Compose", {
              kind: "fee_reminder",
              feeIds: due.map((fee) => fee.id),
            })
          }
        />

        <ActionCard
          icon="megaphone-outline"
          tone={colors.warning}
          title="Notice board"
          description="Post a notice once, then send it out to students."
          onPress={() => navigation.navigate("Notices")}
        />

        <ActionCard
          icon="document-text-outline"
          tone={colors.info}
          title="Message templates"
          description="Edit the wording used for reminders and announcements."
          onPress={() => navigation.navigate("Templates")}
        />

        <SectionTitle title="Recent batches" />
        {batches.length === 0 ? (
          <Card>
            <Text style={styles.empty}>You have not sent anything yet.</Text>
          </Card>
        ) : (
          batches.map((batch) => (
            <Card
              key={batch.batchId}
              style={styles.batchRow}
              onPress={() => navigation.navigate("SendQueue", { batchId: batch.batchId })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.batchTitle}>{kindLabel(batch.kind)}</Text>
                <Text style={styles.batchMeta} numberOfLines={1}>
                  {formatDateTime(batch.createdAt)} · {batch.total} recipient
                  {batch.total === 1 ? "" : "s"}
                </Text>
              </View>
              <Badge
                label={batch.pending > 0 ? `${batch.pending} LEFT` : "DONE"}
                tone={batch.pending > 0 ? "warning" : "success"}
              />
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function kindLabel(kind: string): string {
  if (kind === "fee_reminder") return "Fee reminder";
  if (kind === "announcement") return "Announcement";
  return "Message";
}

function ActionCard({
  icon,
  title,
  description,
  onPress,
  tone,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  tone: string;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${tone}1A` }]}>
        <Ionicons name={icon} size={22} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      {badge ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  actionDescription: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  countBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countText: { color: colors.primaryOn, fontSize: fontSize.xs, fontWeight: "800" },
  empty: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  batchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  batchTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  batchMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
