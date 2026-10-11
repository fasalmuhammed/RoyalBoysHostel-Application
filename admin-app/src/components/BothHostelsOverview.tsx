import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import Avatar from "@/components/Avatar";
import { Badge, Callout, CalloutText, Card, EmptyState } from "@/components/Base";
import { SearchBar, SegmentedTabs } from "@/components/Controls";
import { colors, font, fontSize, radius, spacing, type, Tone } from "@/constants/theme";
import { useApp } from "@/context/AppContext";
import type { RootStackParamList } from "@/navigation/types";
import type { Branch, Complaint, Inmate, Notice } from "@/types";
import { ActivityEvent, currentUserId, list, recentActivity } from "@/store/cloud";
import {
  allBills,
  allBranches,
  allInmates,
  allRooms,
  branchById,
  compareRaw,
  compareRooms,
  compareText,
  contains,
  inmateById,
  occupancyByRoom,
  outstandingByStudent,
  roomById,
  roomLabelOf,
} from "@/store/views";
import { listBatches } from "@/services/messaging";
import { formatDate, formatDateTime, formatMoney, formatPeriod, toPeriod } from "@/utils/format";
import { capability } from "@/web/runtime";
import type { MessageBatchSummary } from "@/types";

type Tab = "activity" | "inmates" | "rooms" | "fees" | "payments" | "complaints" | "notices" | "messages";

/** Lists are capped on screen; the search narrows anything larger. */
const ROW_LIMIT = 200;

const FEE_TONE: Record<string, Tone> = { paid: "success", partial: "warning", unpaid: "danger" };
const COMPLAINT_TONE: Record<string, Tone> = { open: "danger", in_progress: "warning", resolved: "success" };
const COMPLAINT_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

const ACTION_LABEL: Record<ActivityEvent["action"], string> = {
  created: "Added",
  updated: "Updated",
  deleted: "Deleted",
  payment: "Payment recorded",
  reversed: "Payment reversed",
  imported: "Imported",
};

const ENTITY_LABEL: Record<ActivityEvent["entity"], string> = {
  inmate: "inmate",
  room: "room",
  bill: "bill",
  payment: "",
  notice: "notice",
  complaint: "complaint",
  template: "template",
  message: "messages",
  branch: "branch",
  settings: "settings",
  backup: "backup",
};

const ENTITY_ICON: Record<ActivityEvent["entity"], keyof typeof Ionicons.glyphMap> = {
  inmate: "person-outline",
  room: "bed-outline",
  bill: "receipt-outline",
  payment: "cash-outline",
  notice: "megaphone-outline",
  complaint: "construct-outline",
  template: "document-text-outline",
  message: "logo-whatsapp",
  branch: "business-outline",
  settings: "settings-outline",
  backup: "cloud-done-outline",
};

function timeAgo(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDateTime(at);
}

function feeStatus(total: number, paid: number): "paid" | "partial" | "unpaid" {
  if (paid >= total - 0.01) return "paid";
  if (paid > 0.009) return "partial";
  return "unpaid";
}

interface BranchSummary {
  branch: Branch;
  active: number;
  rooms: number;
  beds: number;
  occupied: number;
  billed: number;
  collected: number;
  outstanding: number;
  openComplaints: number;
}

/**
 * Everything across both hostels, recomputed whenever anything changes on
 * any device. Unlike the rest of the app it ignores the active branch.
 */
function buildModel() {
  const period = toPeriod();
  const branches = [...allBranches()].sort((a, b) => a.sortOrder - b.sortOrder || compareRaw(a.name, b.name));
  const inmates = allInmates();
  const rooms = allRooms();
  const bills = allBills();
  const complaints = list<Complaint>("complaints");
  const notices = list<Notice>("notices");
  const occupancy = occupancyByRoom();
  const owed = outstandingByStudent();

  const summaries: BranchSummary[] = branches.map((branch) => {
    const branchRooms = rooms.filter((room) => room.branchId === branch.id);
    const branchBills = bills.filter((bill) => inmateById(bill.studentId)?.branchId === branch.id);
    const thisMonth = branchBills.filter((bill) => bill.period === period);
    return {
      branch,
      active: inmates.filter((inmate) => inmate.branchId === branch.id && inmate.status === "active").length,
      rooms: branchRooms.length,
      beds: branchRooms.reduce((sum, room) => sum + room.capacity, 0),
      occupied: branchRooms.reduce((sum, room) => sum + (occupancy.get(room.id) ?? 0), 0),
      billed: thisMonth.reduce((sum, bill) => sum + bill.total, 0),
      collected: thisMonth.reduce((sum, bill) => sum + bill.amountPaid, 0),
      outstanding: branchBills.reduce((sum, bill) => sum + Math.max(bill.total - bill.amountPaid, 0), 0),
      openComplaints: complaints.filter((c) => c.branchId === branch.id && c.status !== "resolved").length,
    };
  });

  const inmateRows = [...inmates]
    .sort((a, b) => compareText(a.fullName, b.fullName))
    .map((inmate) => ({
      inmate,
      branch: branchById(inmate.branchId),
      roomLabel: roomLabelOf(roomById(inmate.roomId)),
      outstanding: owed.get(inmate.id) ?? 0,
    }));

  const roomRows = [...rooms]
    .sort((a, b) => compareRaw(a.branchId, b.branchId) || compareRooms(a, b))
    .map((room) => ({ room, branch: branchById(room.branchId), occupied: occupancy.get(room.id) ?? 0 }));

  const billRows = bills
    .map((bill) => ({ bill, inmate: inmateById(bill.studentId) }))
    .filter((row): row is { bill: (typeof row)["bill"]; inmate: Inmate } => row.inmate !== null)
    .sort((a, b) => compareRaw(b.bill.period, a.bill.period) || compareText(a.inmate.fullName, b.inmate.fullName))
    .map(({ bill, inmate }) => ({
      bill,
      inmate,
      branch: branchById(inmate.branchId),
      status: feeStatus(bill.total, bill.amountPaid),
    }));

  const paymentRows = billRows
    .flatMap(({ bill, inmate, branch }) => bill.payments.map((payment) => ({ payment, bill, inmate, branch })))
    .sort((a, b) => compareRaw(b.payment.paidOn, a.payment.paidOn) || b.payment.createdAt - a.payment.createdAt);

  const complaintRows = [...complaints]
    .sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || b.createdAt - a.createdAt)
    .map((complaint) => ({
      complaint,
      branch: branchById(complaint.branchId),
      roomLabel: roomLabelOf(roomById(complaint.roomId)),
    }));

  const noticeRows = [...notices]
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || compareRaw(b.postedOn, a.postedOn))
    .map((notice) => ({ notice, branch: branchById(notice.branchId) }));

  const totals = summaries.reduce(
    (sum, s) => ({
      active: sum.active + s.active,
      beds: sum.beds + s.beds,
      occupied: sum.occupied + s.occupied,
      billed: sum.billed + s.billed,
      collected: sum.collected + s.collected,
      outstanding: sum.outstanding + s.outstanding,
      openComplaints: sum.openComplaints + s.openComplaints,
    }),
    { active: 0, beds: 0, occupied: 0, billed: 0, collected: 0, outstanding: 0, openComplaints: 0 }
  );

  return {
    period,
    summaries,
    totals,
    inmateRows,
    roomRows,
    billRows,
    paymentRows,
    complaintRows,
    noticeRows,
    activity: recentActivity(),
  };
}

/**
 * Both hostels at once, for the admin: totals side by side, a live feed of
 * who changed what, and every record in one searchable place. Shown on the
 * dashboard when the hostel switch is set to "Both".
 */
export default function BothHostelsOverview() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { dataVersion, settings, chooseBranch, syncProblem } = useApp();
  const [tab, setTab] = useState<Tab>("activity");
  const [query, setQuery] = useState("");
  const [batches, setBatches] = useState<MessageBatchSummary[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [updatedAt, setUpdatedAt] = useState(Date.now());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(buildModel, [dataVersion]);

  useEffect(() => {
    setUpdatedAt(Date.now());
    listBatches(500).then(setBatches).catch(() => undefined);
  }, [dataVersion]);

  // Who made each change, as the viewer knows them. Ids are stored; names are
  // looked up each time, so a renamed account shows its current name.
  useEffect(() => {
    const ids = [...new Set(model.activity.map((event) => event.by).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return;
    let cancelled = false;
    capability("user").then(async (user) => {
      if (!user || cancelled) return;
      const profiles = await user.profiles(ids);
      if (cancelled) return;
      setNames(Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, profile.name])));
    });
    return () => {
      cancelled = true;
    };
  }, [model.activity]);

  const symbol = settings.currencySymbol;
  const money = (amount: number) => formatMoney(amount, symbol);
  const term = query.trim().toLowerCase();
  const me = currentUserId();

  /** Opens a record in its usual screen, switching to its hostel first. */
  const open = async (branchId: string | null | undefined, go: () => void) => {
    if (branchId) await chooseBranch(branchId);
    go();
  };

  const who = (id: string | null) => (id && id === me ? "You" : (id && names[id]) || "Someone");

  const filtered = {
    activity: model.activity.filter(
      (event) => !term || contains(event.label, term) || contains(who(event.by), term)
    ),
    inmates: model.inmateRows.filter(
      ({ inmate, roomLabel }) =>
        !term ||
        contains(inmate.fullName, term) ||
        contains(inmate.phone, term) ||
        contains(inmate.admissionNo, term) ||
        contains(roomLabel, term)
    ),
    rooms: model.roomRows.filter(({ room }) => !term || contains(`${room.block}-${room.roomNumber}`, term)),
    fees: model.billRows.filter(
      ({ bill, inmate, status }) =>
        !term || contains(inmate.fullName, term) || contains(bill.period, term) || contains(status, term)
    ),
    payments: model.paymentRows.filter(
      ({ payment, inmate }) =>
        !term || contains(inmate.fullName, term) || contains(payment.reference, term) || contains(payment.method, term)
    ),
    complaints: model.complaintRows.filter(
      ({ complaint }) => !term || contains(complaint.title, term) || contains(complaint.description, term)
    ),
    notices: model.noticeRows.filter(({ notice }) => !term || contains(notice.title, term) || contains(notice.body, term)),
    messages: batches.filter((batch) => !term || contains(batch.preview, term)),
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "activity", label: "Activity" },
    { key: "inmates", label: "Inmates", count: model.inmateRows.length },
    { key: "rooms", label: "Rooms", count: model.roomRows.length },
    { key: "fees", label: "Bills", count: model.billRows.length },
    { key: "payments", label: "Payments", count: model.paymentRows.length },
    { key: "complaints", label: "Complaints", count: model.complaintRows.length },
    { key: "notices", label: "Notices", count: model.noticeRows.length },
    { key: "messages", label: "WhatsApp", count: batches.length },
  ];

  const shown = filtered[tab].length;

  return (
    <View>
      <View>
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, syncProblem ? styles.liveDotOff : null]} />
          <Text style={styles.liveText}>
            {syncProblem ? "Reconnecting…" : "Live"} · updated {formatDateTime(updatedAt)}
          </Text>
        </View>

        {syncProblem ? (
          <Callout tone="warning" icon="cloud-offline-outline">
            <CalloutText>{syncProblem}</CalloutText>
          </Callout>
        ) : null}

        <View style={styles.summaryGrid}>
          <SummaryCard
            title="Both hostels"
            lines={[
              ["Active inmates", String(model.totals.active)],
              ["Beds taken", `${model.totals.occupied} of ${model.totals.beds}`],
              [`Billed ${formatPeriod(model.period)}`, money(model.totals.billed)],
              ["Collected", money(model.totals.collected)],
              ["Outstanding (all bills)", money(model.totals.outstanding)],
              ["Open complaints", String(model.totals.openComplaints)],
            ]}
            highlight
          />
          {model.summaries.map((summary) => (
            <SummaryCard
              key={summary.branch.id}
              title={summary.branch.shortName || summary.branch.name}
              lines={[
                ["Active inmates", String(summary.active)],
                ["Beds taken", `${summary.occupied} of ${summary.beds}`],
                [`Billed ${formatPeriod(model.period)}`, money(summary.billed)],
                ["Collected", money(summary.collected)],
                ["Outstanding (all bills)", money(summary.outstanding)],
                ["Open complaints", String(summary.openComplaints)],
              ]}
            />
          ))}
        </View>

        <SegmentedTabs options={tabs} value={tab} onChange={(next) => setTab(next)} />
        <View style={{ marginTop: spacing.md }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search this list…" />
        </View>

        {shown === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title={term ? "Nothing matches" : "Nothing here yet"}
            message={term ? "Try a different search." : "Records appear here as soon as anyone adds them."}
          />
        ) : null}

        <View style={styles.rows}>
          {tab === "activity"
            ? filtered.activity.slice(0, ROW_LIMIT).map((event) => (
                <Card key={event.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={ENTITY_ICON[event.entity] ?? "ellipse-outline"} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {ACTION_LABEL[event.action]}
                      {ENTITY_LABEL[event.entity] ? ` ${ENTITY_LABEL[event.entity]}` : ""} · {event.label}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {who(event.by)} · {timeAgo(event.at)}
                    </Text>
                  </View>
                  {event.branchId ? <Badge label={branchById(event.branchId)?.code ?? "?"} tone="info" /> : null}
                </Card>
              ))
            : null}

          {tab === "inmates"
            ? filtered.inmates.slice(0, ROW_LIMIT).map(({ inmate, branch, roomLabel, outstanding }) => (
                <Card
                  key={inmate.id}
                  style={styles.row}
                  onPress={() => open(inmate.branchId, () => navigation.navigate("InmateDetail", { studentId: inmate.id }))}
                >
                  <Avatar name={inmate.fullName} photoFile={inmate.photoFile} size={40} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{inmate.fullName}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[
                        branch?.code ? `${branch.code}-${inmate.admissionNo}` : inmate.admissionNo,
                        roomLabel ? `Room ${roomLabel}` : "No room",
                        inmate.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  {outstanding > 0.01 ? <Text style={styles.owed}>{money(outstanding)}</Text> : null}
                  <Badge label={inmate.status === "active" ? "Active" : "Left"} tone={inmate.status === "active" ? "success" : "neutral"} />
                </Card>
              ))
            : null}

          {tab === "rooms"
            ? filtered.rooms.slice(0, ROW_LIMIT).map(({ room, branch, occupied }) => (
                <Card
                  key={room.id}
                  style={styles.row}
                  onPress={() => open(room.branchId, () => navigation.navigate("RoomDetail", { roomId: room.id }))}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="bed-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>Room {roomLabelOf(room)}</Text>
                    <Text style={styles.rowMeta}>
                      {occupied} of {room.capacity} beds taken · {money(room.rent)} a bed
                    </Text>
                  </View>
                  <Badge label={branch?.code ?? "?"} tone="info" />
                  <Badge
                    label={occupied >= room.capacity ? "Full" : `${room.capacity - occupied} free`}
                    tone={occupied >= room.capacity ? "neutral" : "success"}
                  />
                </Card>
              ))
            : null}

          {tab === "fees"
            ? filtered.fees.slice(0, ROW_LIMIT).map(({ bill, inmate, branch, status }) => (
                <Card
                  key={bill.id}
                  style={styles.row}
                  onPress={() => open(inmate.branchId, () => navigation.navigate("FeeDetail", { feeId: bill.id }))}
                >
                  <Avatar name={inmate.fullName} photoFile={inmate.photoFile} size={40} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{inmate.fullName}</Text>
                    <Text style={styles.rowMeta}>
                      {formatPeriod(bill.period)} · {money(bill.amountPaid)} of {money(bill.total)} · due{" "}
                      {formatDate(bill.dueDate)}
                    </Text>
                  </View>
                  <Badge label={branch?.code ?? "?"} tone="info" />
                  <Badge label={status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid"} tone={FEE_TONE[status]} />
                </Card>
              ))
            : null}

          {tab === "payments"
            ? filtered.payments.slice(0, ROW_LIMIT).map(({ payment, bill, inmate, branch }) => (
                <Card
                  key={payment.id}
                  style={styles.row}
                  onPress={() => open(inmate.branchId, () => navigation.navigate("FeeDetail", { feeId: bill.id }))}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="cash-outline" size={18} color={colors.success} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {money(payment.amount)} · {inmate.fullName}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {formatDate(payment.paidOn)} · {payment.method.toUpperCase()} · for {formatPeriod(bill.period)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </Text>
                  </View>
                  <Badge label={branch?.code ?? "?"} tone="info" />
                </Card>
              ))
            : null}

          {tab === "complaints"
            ? filtered.complaints.slice(0, ROW_LIMIT).map(({ complaint, branch, roomLabel }) => (
                <Card
                  key={complaint.id}
                  style={styles.row}
                  onPress={() =>
                    open(complaint.branchId, () => navigation.navigate("ComplaintForm", { complaintId: complaint.id }))
                  }
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="construct-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{complaint.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[roomLabel ? `Room ${roomLabel}` : null, formatDate(complaint.raisedOn)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Badge label={branch?.code ?? "?"} tone="info" />
                  <Badge label={COMPLAINT_LABEL[complaint.status] ?? complaint.status} tone={COMPLAINT_TONE[complaint.status] ?? "neutral"} />
                </Card>
              ))
            : null}

          {tab === "notices"
            ? filtered.notices.slice(0, ROW_LIMIT).map(({ notice, branch }) => (
                <Card
                  key={notice.id}
                  style={styles.row}
                  onPress={() => open(notice.branchId, () => navigation.navigate("NoticeForm", { noticeId: notice.id }))}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={notice.pinned ? "pin" : "megaphone-outline"} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{notice.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {formatDate(notice.postedOn)}
                      {notice.lastSentAt ? ` · sent ${formatDateTime(notice.lastSentAt)}` : ""}
                    </Text>
                  </View>
                  <Badge label={branch?.code ?? "Both"} tone="info" />
                </Card>
              ))
            : null}

          {tab === "messages"
            ? filtered.messages.slice(0, ROW_LIMIT).map((batch) => (
                <Card
                  key={batch.batchId}
                  style={styles.row}
                  onPress={() => navigation.navigate("SendQueue", { batchId: batch.batchId })}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{batch.preview.replace(/\s+/g, " ")}</Text>
                    <Text style={styles.rowMeta}>
                      {formatDateTime(batch.createdAt)} · {batch.sent} of {batch.total} sent
                    </Text>
                  </View>
                  <Badge label={batch.pending > 0 ? `${batch.pending} pending` : "Done"} tone={batch.pending > 0 ? "warning" : "success"} />
                </Card>
              ))
            : null}
        </View>

        {shown > ROW_LIMIT ? (
          <Text style={styles.more}>
            Showing the first {ROW_LIMIT} of {shown}. Search to narrow the list.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function SummaryCard({
  title,
  lines,
  highlight = false,
}: {
  title: string;
  lines: [string, string][];
  highlight?: boolean;
}) {
  return (
    <Card style={[styles.summary, highlight ? styles.summaryHighlight : null]}>
      <Text style={[styles.summaryTitle, highlight ? { color: colors.primaryOn } : null]}>{title}</Text>
      {lines.map(([label, value]) => (
        <View key={label} style={styles.summaryLine}>
          <Text style={[styles.summaryLabel, highlight ? { color: colors.primaryLight } : null]}>{label}</Text>
          <Text style={[styles.summaryValue, highlight ? { color: colors.primaryOn } : null]}>{value}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  liveRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveDotOff: { backgroundColor: colors.warning },
  liveText: { ...type.support, color: colors.textMuted },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.lg },
  summary: { flexGrow: 1, flexBasis: 260, minWidth: 0 },
  summaryHighlight: { backgroundColor: colors.primaryDark },
  summaryTitle: { ...type.section, color: colors.text, marginBottom: spacing.sm },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 3,
  },
  summaryLabel: { ...type.support, color: colors.textMuted, flexShrink: 1 },
  summaryValue: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.text },
  rows: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowMeta: { ...type.support, color: colors.textMuted, marginTop: 2 },
  owed: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.danger },
  more: { ...type.support, color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
});
