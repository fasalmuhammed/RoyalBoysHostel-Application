import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Badge, Card, EmptyState, Loading } from "@/components/Base";
import Button from "@/components/Button";
import { SegmentedTabs } from "@/components/Controls";
import Avatar from "@/components/Avatar";
import { colors, spacing, type } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import { useAsyncData } from "@/utils/hooks";
import { Application, groupByRoom, listApplications } from "@/services/admissions";
import { formatDateTime } from "@/utils/format";
import type { RootStackParamList } from "@/navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Admissions">;
type View_ = "all" | "room";

/**
 * Registration forms waiting for approval, as one list or grouped under the
 * room each student chose -- the quick way to check a room's students against
 * who actually lives there.
 */
export default function AdmissionsScreen({ navigation }: Props) {
  const { dataVersion } = useApp();
  const [view, setView] = useState<View_>("all");

  const { data, loading } = useAsyncData(async () => {
    const applications = listApplications();
    return { applications, groups: await groupByRoom(applications) };
  }, [dataVersion]);

  const open = (application: Application) =>
    navigation.navigate("AdmissionReview", { applicationId: application.id });

  const row = (application: Application, showRoom: boolean, roomLabel?: string) => (
    <Card key={application.id} onPress={() => open(application)} style={styles.row}>
      <Avatar name={application.fullName} photoFile={application.photoFile} size={46} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>{application.fullName}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {application.phone}
          {showRoom && roomLabel ? ` · ${roomLabel}` : ""}
        </Text>
        <Text style={styles.when} numberOfLines={1}>Sent {formatDateTime(application.createdAt)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
    </Card>
  );

  const total = data?.applications.length ?? 0;
  const labelOf = (application: Application) =>
    data?.groups.find((g) => g.applications.includes(application))?.label;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SegmentedTabs<View_>
          options={[
            { key: "all", label: "All", count: total },
            { key: "room", label: "By room" },
          ]}
          value={view}
          onChange={setView}
        />
        <View style={{ height: spacing.md }} />

        {loading && !data ? (
          <Loading />
        ) : total === 0 ? (
          <EmptyState
            icon="qr-code-outline"
            title="No applications pending"
            message="When a student scans the hostel's QR code and sends their details, the form appears here for you to approve."
            action={<Button title="Show the QR code" icon="qr-code-outline" compact onPress={() => navigation.navigate("JoinQr")} />}
          />
        ) : view === "all" ? (
          data?.applications.map((application) => row(application, true, labelOf(application)))
        ) : (
          data?.groups.map((group) => (
            <View key={group.roomId ?? "none"} style={{ marginBottom: spacing.sm }}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{group.label}</Text>
                <Text style={styles.groupCount}>
                  {group.applications.length} waiting
                </Text>
                <View style={{ flex: 1 }} />
                {group.free === null ? null : group.free >= group.applications.length ? (
                  <Badge label={`${group.free} ${group.free === 1 ? "BED" : "BEDS"} FREE`} tone="success" />
                ) : (
                  <Badge label={group.free === 0 ? "ROOM FULL" : `ONLY ${group.free} FREE`} tone="danger" />
                )}
              </View>
              {group.applications.map((application) => row(application, false))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.support, color: colors.textMuted },
  when: { ...type.caption, color: colors.textFaint },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  groupTitle: { ...type.section, color: colors.text },
  groupCount: { ...type.support, color: colors.textMuted },
});
