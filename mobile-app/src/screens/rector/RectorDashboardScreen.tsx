import React, { useEffect, useMemo, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart } from "react-native-chart-kit";

import { useAuth } from "@/context/AuthContext";
import { subscribeAllApplications } from "@/services/applications";
import { subscribeGrievances } from "@/services/grievances";
import { approveRector, subscribePendingRectors, subscribeStudents } from "@/services/users";
import { subscribeRooms } from "@/services/rooms";
import { HostelApplication, Grievance, UserProfile, Room } from "@/types";
import ScreenHeader from "@/components/ScreenHeader";
import StatCard from "@/components/StatCard";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { colors, fontSize, spacing } from "@/constants/theme";

const screenWidth = Dimensions.get("window").width;

export default function RectorDashboardScreen() {
  const { user, logout } = useAuth();
  const [applications, setApplications] = useState<HostelApplication[]>([]);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pendingRectors, setPendingRectors] = useState<UserProfile[]>([]);

  useEffect(() => subscribeAllApplications(setApplications), []);
  useEffect(() => subscribeGrievances(setGrievances), []);
  useEffect(() => subscribeStudents(setStudents), []);
  useEffect(() => subscribeRooms(setRooms), []);
  useEffect(() => subscribePendingRectors(setPendingRectors), []);

  const pendingApplications = applications.filter((a) => a.status === "pending").length;
  const approvedApplications = applications.filter((a) => a.status === "approved").length;
  const rejectedApplications = applications.filter((a) => a.status === "rejected").length;
  const openGrievances = grievances.filter((g) => g.status === "open").length;

  const occupancy = useMemo(() => {
    const capacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
    const occupied = rooms.reduce((sum, r) => sum + r.occupantIds.length, 0);
    return { capacity, occupied, rate: capacity ? Math.round((occupied / capacity) * 100) : 0 };
  }, [rooms]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={`Welcome, ${user?.name ?? "Rector"}`} subtitle="Hostel overview at a glance" />

      <View style={styles.statsRow}>
        <StatCard label="Pending Applications" value={pendingApplications} color={colors.warning} />
        <StatCard label="Total Students" value={students.length} color={colors.primary} />
        <StatCard label="Open Grievances" value={openGrievances} color={colors.danger} />
        <StatCard label="Room Occupancy" value={`${occupancy.rate}%`} color={colors.success} />
      </View>

      <Card>
        <Text style={styles.cardTitle}>Applications by Status</Text>
        <BarChart
          data={{
            labels: ["Pending", "Approved", "Rejected"],
            datasets: [{ data: [pendingApplications, approvedApplications, rejectedApplications] }],
          }}
          width={screenWidth - spacing.lg * 2 - spacing.md * 2}
          height={200}
          fromZero
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            backgroundGradientFrom: colors.surface,
            backgroundGradientTo: colors.surface,
            color: (opacity = 1) => `rgba(30, 58, 138, ${opacity})`,
            labelColor: () => colors.textMuted,
            barPercentage: 0.6,
            decimalPlaces: 0,
          }}
          style={{ borderRadius: 8 }}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Occupancy</Text>
        <Text style={styles.body}>
          {occupancy.occupied} / {occupancy.capacity} beds occupied across {rooms.length} rooms
        </Text>
      </Card>

      {pendingRectors.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Pending Rector Approvals ({pendingRectors.length})</Text>
          {pendingRectors.map((rector) => (
            <View key={rector.uid} style={styles.pendingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingName}>{rector.name}</Text>
                <Text style={styles.pendingEmail}>{rector.email}</Text>
              </View>
              <Button title="Approve" style={styles.approveButton} onPress={() => approveRector(rector.uid)} />
            </View>
          ))}
        </Card>
      )}

      <Button title="Logout" variant="secondary" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: fontSize.md, color: colors.textMuted },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  pendingName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  pendingEmail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  approveButton: { paddingHorizontal: spacing.md },
});
