import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Screen } from "@/components/Base";
import { colors, fontSize, radius, shadow, spacing, type } from "@/constants/theme";
import type { SetupStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<SetupStackParamList, "StartChoice">;

/**
 * The fork every fresh install lands on: begin an empty register, or adopt the
 * data from a previous phone. Presented before anything else is configured,
 * because restoring overwrites whatever the admin would otherwise set up here.
 */
export default function StartChoiceScreen({ navigation }: Props) {
  return (
    <Screen scroll>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="business" size={32} color={colors.primaryOn} />
        </View>
        <Text style={styles.title}>Set up your hostel</Text>
        <Text style={styles.subtitle}>
          Records are kept in Claude storage, so they open on any device you sign in from.
        </Text>
      </View>

      <ChoiceCard
        icon="sparkles-outline"
        title="Start fresh"
        description="Begin with an empty register and add rooms and inmates yourself."
        onPress={() => navigation.navigate("CreatePin")}
      />

      <ChoiceCard
        icon="cloud-download-outline"
        title="Restore from a backup file"
        description="Moving from the phone app? Load its .hostelbak file and every inmate, room, fee and photo comes across exactly as it was."
        onPress={() => navigation.navigate("RestoreExisting")}
      />

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
        <Text style={styles.noteText}>
          You can restore a backup later too — this choice is not permanent.
        </Text>
      </View>
    </Screen>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.choiceIcon}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginBottom: spacing.xl, marginTop: spacing.lg },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.raised,
  },
  title: { ...type.title, color: colors.text },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTitle: { ...type.bodyStrong, color: colors.text },
  choiceDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 18,
  },
  note: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  noteText: { fontSize: fontSize.sm, color: colors.textMuted },
});
