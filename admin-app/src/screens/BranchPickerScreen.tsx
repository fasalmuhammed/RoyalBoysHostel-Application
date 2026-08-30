import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Loading } from "@/components/Base";
import { colors, fontSize, radius, shadow, spacing } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { BranchSummary, listBranchSummaries } from "@/services/branches";
import { pluralize } from "@/utils/format";

/**
 * Asks which hostel is being operated, every time the app is opened.
 *
 * Deliberately not remembered silently. Both branches look identical once you
 * are inside, and admitting an inmate or collecting a fee against the wrong one
 * is expensive to unpick -- so the choice is made explicitly. The branch used
 * last time is highlighted to keep it to a single tap.
 */
export default function BranchPickerScreen() {
  const { settings, chooseBranch } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: branches, loading } = useAsyncData(() => listBranchSummaries(), []);

  const onPick = async (branch: BranchSummary) => {
    setBusyId(branch.id);
    try {
      await chooseBranch(branch.id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image
            source={require("../../assets/adaptive-icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Which hostel?</Text>
          <Text style={styles.subtitle}>
            Everything you add or collect goes to the branch you pick here.
          </Text>
        </View>

        {loading && !branches ? (
          <Loading />
        ) : (
          (branches ?? []).map((branch) => {
            const isLast = branch.id === settings.activeBranchId;
            const busy = busyId === branch.id;

            return (
              <Pressable
                key={branch.id}
                onPress={() => onPick(branch)}
                disabled={busyId !== null}
                style={({ pressed }) => [
                  styles.card,
                  isLast && styles.cardLast,
                  pressed && { opacity: 0.85 },
                  busy && { opacity: 0.6 },
                ]}
              >
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{branch.code}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{branch.shortName}</Text>
                  <Text style={styles.full} numberOfLines={1}>
                    {branch.name}
                  </Text>
                  <Text style={styles.stats}>
                    {pluralize(branch.inmates, "inmate")} · {pluralize(branch.rooms, "room")}
                  </Text>
                </View>

                {isLast ? (
                  <View style={styles.lastUsed}>
                    <Text style={styles.lastUsedText}>LAST USED</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                )}
              </Pressable>
            );
          })
        )}

        <View style={styles.note}>
          <Ionicons name="swap-horizontal" size={15} color={colors.textMuted} />
          <Text style={styles.noteText}>
            You can switch branch any time from the More tab.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.xl, flexGrow: 1, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: spacing.xl },
  logo: { width: 96, height: 96, marginBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.text },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 21,
    paddingHorizontal: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: "transparent",
    ...shadow.card,
  },
  cardLast: { borderColor: colors.primary },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.goldLight, fontSize: fontSize.xl, fontWeight: "800" },
  name: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  full: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  stats: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  lastUsed: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  lastUsedText: { fontSize: 10, fontWeight: "800", color: colors.primary, letterSpacing: 0.4 },
  note: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  noteText: { fontSize: fontSize.sm, color: colors.textMuted },
});
