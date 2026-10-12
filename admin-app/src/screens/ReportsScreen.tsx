import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Callout, CalloutText, SectionTitle } from "@/components/Base";
import { OptionPicker } from "@/components/Controls";
import { colors, font, fontSize, radius, spacing, type } from "@/constants/theme";
import { exportReport, ReportKind } from "@/services/csv";
import { currentPeriod } from "@/services/fees";
import { formatPeriod, shiftPeriod } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Reports">;

const REPORTS: {
  kind: ReportKind;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  needsPeriod?: boolean;
}[] = [
  {
    kind: "inmates",
    title: "Inmate register",
    description: "Every inmate with room, contact and guardian details.",
    icon: "people-outline",
  },
  {
    kind: "rooms",
    title: "Room occupancy",
    description: "Rooms with capacity, occupancy and rent.",
    icon: "bed-outline",
  },
  {
    kind: "fees",
    title: "Fee statement",
    description: "Bills with totals, paid amounts and balances.",
    icon: "receipt-outline",
    needsPeriod: true,
  },
  {
    kind: "payments",
    title: "Collection log",
    description: "Every payment received, by date.",
    icon: "cash-outline",
  },
];

export default function ReportsScreen({}: Props) {
  const [busy, setBusy] = useState<ReportKind | null>(null);
  const [periodPickerFor, setPeriodPickerFor] = useState<ReportKind | null>(null);

  const run = async (kind: ReportKind, period: string | null) => {
    setBusy(kind);
    try {
      const result = await exportReport(kind, period);
      if (result.rowCount === 0) {
        Alert.alert("Nothing to export", "There are no records for this report yet.");
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: result.fileName,
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      } else {
        Alert.alert("Report saved", `${result.rowCount} rows written to:\n${result.uri}`);
      }
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Excel reports" />
        {REPORTS.map((report) => (
          <Pressable
            key={report.kind}
            disabled={busy !== null}
            onPress={() =>
              report.needsPeriod ? setPeriodPickerFor(report.kind) : run(report.kind, null)
            }
            style={({ pressed }) => [
              styles.card,
              pressed && { opacity: 0.85 },
              busy === report.kind && { opacity: 0.6 },
            ]}
          >
            <View style={styles.icon}>
              <Ionicons name={report.icon} size={21} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{report.title}</Text>
              <Text style={styles.description}>{report.description}</Text>
            </View>
            <Ionicons
              name={busy === report.kind ? "hourglass-outline" : "download-outline"}
              size={19}
              color={colors.primary}
            />
          </Pressable>
        ))}
      </ScrollView>

      <OptionPicker
        visible={periodPickerFor !== null}
        title="Which month?"
        selectedKey={null}
        onClose={() => setPeriodPickerFor(null)}
        onSelect={(key) => {
          const kind = periodPickerFor;
          if (kind) run(kind, key === "__all__" ? null : key);
        }}
        options={[
          { key: "__all__", label: "All months" },
          ...Array.from({ length: 14 }, (_, index) => {
            const value = shiftPeriod(currentPeriod(), 1 - index);
            return { key: value, label: formatPeriod(value) };
          }),
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.bodyStrong, color: colors.text },
  description: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
