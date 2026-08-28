import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Callout, CalloutText, Card, Loading, SectionTitle } from "@/components/Base";
import Button from "@/components/Button";
import { colors, fontSize, radius, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import {
  deleteBatch,
  listBatchEntries,
  markMessage,
  openWhatsApp,
  WhatsAppError,
} from "@/services/messaging";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SendQueue">;

/**
 * Walks the admin through a prepared batch one recipient at a time.
 *
 * Each tap opens WhatsApp with that student's message filled in. Because the
 * app cannot observe whether the message was actually sent, the row is marked
 * optimistically and can be corrected — an honest "we think this went out"
 * beats a status that silently lies.
 */
export default function SendQueueScreen({ navigation, route }: Props) {
  const { batchId } = route.params;
  const { settings } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: entries, loading, reload } = useAsyncData(
    () => listBatchEntries(batchId),
    [batchId]
  );

  if (loading && !entries) return <Loading />;

  const list = entries ?? [];
  const pending = list.filter((entry) => entry.status === "queued");
  const sent = list.filter((entry) => entry.status === "sent");
  const nextUp = pending[0];

  const send = async (id: string, phone: string, body: string) => {
    setBusyId(id);
    try {
      await openWhatsApp(phone, body, settings.countryCode);
      await markMessage(id, "sent");
      reload();
    } catch (e) {
      Alert.alert(
        "Could not open WhatsApp",
        e instanceof WhatsAppError ? e.message : "Please try again."
      );
    } finally {
      setBusyId(null);
    }
  };

  const skip = async (id: string) => {
    await markMessage(id, "skipped");
    reload();
  };

  const undo = async (id: string) => {
    await markMessage(id, "queued");
    reload();
  };

  const onDeleteBatch = () => {
    Alert.alert("Delete this batch?", "The record of these messages will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteBatch(batchId);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressCount}>
              {sent.length} of {list.length} sent
            </Text>
            <Badge
              label={pending.length === 0 ? "COMPLETE" : `${pending.length} LEFT`}
              tone={pending.length === 0 ? "success" : "warning"}
            />
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${list.length ? (sent.length / list.length) * 100 : 0}%` },
              ]}
            />
          </View>
        </Card>

        {pending.length > 0 ? (
          <Callout tone="info" icon="hand-left-outline">
            <CalloutText>
              Tap "Send" to open WhatsApp with the message ready. Press send there, then come back
              here for the next one.
            </CalloutText>
          </Callout>
        ) : null}

        {nextUp ? (
          <>
            <SectionTitle title="Up next" />
            <Card style={styles.nextCard}>
              <Text style={styles.nextName}>{nextUp.recipientName}</Text>
              <Text style={styles.nextPhone}>{nextUp.phone}</Text>
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{nextUp.body}</Text>
              </View>
              <View style={styles.nextActions}>
                <Button
                  title="Send on WhatsApp"
                  icon="logo-whatsapp"
                  onPress={() => send(nextUp.id, nextUp.phone, nextUp.body)}
                  loading={busyId === nextUp.id}
                  style={{ flex: 1 }}
                />
                <Button title="Skip" variant="secondary" compact onPress={() => skip(nextUp.id)} />
              </View>
            </Card>
          </>
        ) : (
          <Callout tone="success" icon="checkmark-circle-outline">
            <CalloutText>
              Every message in this batch has been handled. Nothing left to send.
            </CalloutText>
          </Callout>
        )}

        <SectionTitle title={`All recipients (${list.length})`} />
        {list.map((entry) => (
          <Card key={entry.id} style={styles.row}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    entry.status === "sent"
                      ? colors.success
                      : entry.status === "skipped"
                        ? colors.textFaint
                        : colors.warning,
                },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>
                {entry.recipientName}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {entry.phone} · {entry.status}
              </Text>
            </View>

            {entry.status === "queued" ? (
              <Pressable
                onPress={() => send(entry.id, entry.phone, entry.body)}
                style={styles.smallButton}
                hitSlop={6}
              >
                <Ionicons name="logo-whatsapp" size={17} color={colors.success} />
              </Pressable>
            ) : (
              <Pressable onPress={() => undo(entry.id)} style={styles.smallButton} hitSlop={6}>
                <Ionicons name="refresh-outline" size={17} color={colors.textMuted} />
              </Pressable>
            )}
          </Card>
        ))}

        <Button
          title="Delete this batch"
          variant="ghost"
          icon="trash-outline"
          onPress={onDeleteBatch}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  progressCard: { marginBottom: spacing.md },
  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  progressCount: { fontSize: fontSize.md, fontWeight: "800", color: colors.text },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  nextCard: { padding: spacing.md },
  nextName: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  nextPhone: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  bubble: {
    backgroundColor: "#E7FFDB",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  bubbleText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  nextActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  rowName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  smallButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
