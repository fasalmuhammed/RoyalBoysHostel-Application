import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { AuthStackParamList } from "@/navigation/types";
import { Role } from "@/types";
import { colors, fontSize, radius, spacing } from "@/constants/theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Welcome">;

const roles: { role: Role; label: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { role: "rector", label: "Rector / Admin", icon: "school", description: "Manage applications, notices & grievances" },
  { role: "warden", label: "Warden", icon: "shield-checkmark", description: "Log student check-in / check-out" },
  { role: "student", label: "Student", icon: "person", description: "Apply for hostel, notices, fees & more" },
];

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>Hostel Administration</Text>
        <Text style={styles.subtitle}>Select your role to continue</Text>

        <View style={styles.cards}>
          {roles.map((r) => (
            <Pressable
              key={r.role}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => navigation.navigate("Login", { role: r.role })}
            >
              <View style={styles.iconBadge}>
                <Ionicons name={r.icon} size={26} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{r.label}</Text>
                <Text style={styles.cardDescription}>{r.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  safe: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "center" },
  title: { color: "#fff", fontSize: fontSize.xxl, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "#DBEAFE", fontSize: fontSize.md, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  cards: { gap: spacing.md },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardPressed: { opacity: 0.85 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}1A`,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  cardDescription: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
});
