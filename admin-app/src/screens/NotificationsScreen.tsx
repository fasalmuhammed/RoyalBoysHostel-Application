import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Loading } from "@/components/Base";
import { colors, fontSize, radius, spacing, Tone, toneColor } from "@/constants/theme";
import { useAsyncData } from "@/utils/hooks";
import { Alert as FeedAlert, buildAlerts } from "@/services/overview";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

const TONE: Record<FeedAlert["tone"], Tone> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  success: "success",
};

/**
 * Everything that needs attention, in one list.
 *
 * The feed is computed from the data each time it opens rather than stored.
 * With no server to keep a notifications table in step, deriving it means an
 * item disappears the moment the underlying problem is fixed -- there is no
 * read/unread state to drift out of step with reality.
 */
export default function NotificationsScreen({ navigation }: Props) {
  const { data: alerts, loading } = useAsyncData(() => buildAlerts(), []);

  const go = (action: FeedAlert["action"]) => {
    if (action === "fees") navigation.navigate("Tabs", { screen: "Fees" });
    else if (action === "backup") navigation.navigate("Backup");
    else if (action === "inmates")
      navigation.navigate("Tabs", { screen: "Inmates", params: { filter: "unassigned" } });
    else if (action === "notices") navigation.navigate("Notices");
    else if (action === "messages") navigation.navigate("Messages");
  };

  if (loading && !alerts) return <Loading />;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {(alerts ?? []).map((alert) => {
          const tone = toneColor[TONE[alert.tone]];
          return (
            <Pressable
              key={alert.id}
              disabled={alert.action === null}
              onPress={() => go(alert.action)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                <Ionicons
                  name={alert.icon as keyof typeof Ionicons.glyphMap}
                  size={19}
                  color={tone.fg}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{alert.title}</Text>
                <Text style={styles.body}>{alert.body}</Text>
              </View>
              {alert.action ? (
                <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
              ) : null}
            </Pressable>
          );
        })}

        <Text style={styles.footer}>
          This list is worked out from your data each time you open it, so an item disappears as
          soon as it is dealt with.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  body: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  footer: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.md,
    lineHeight: 16,
    paddingHorizontal: spacing.md,
  },
});
