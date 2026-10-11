import { Linking } from "react-native";

import {
  MessageBatchSummary,
  MessageKind,
  MessageLogEntry,
  MessageTemplate,
} from "@/types";
import { newBatchId, newId } from "@/utils/id";
import { formatMoney, formatDate, formatPeriod } from "@/utils/format";
import { toWhatsAppNumber } from "@/utils/validate";
import { entries, find, list, logActivity, patch, put, remove } from "@/store/cloud";
import { compareRaw, compareText } from "@/store/views";

/**
 * WhatsApp messaging.
 *
 * IMPORTANT -- what this can and cannot do.
 *
 * WhatsApp offers no way for a third-party app to send a message silently from
 * the user's own number. Unattended sending is only available through the
 * WhatsApp Business Cloud API, which is a paid, internet-hosted service with
 * pre-approved message templates -- the opposite of this app's offline design.
 * The unofficial libraries that appear to work drive a logged-in web session
 * and are a documented route to getting the hostel's number banned.
 *
 * So this module does the honest, supported thing: it prepares each message,
 * opens WhatsApp with the recipient and text already filled in, and records
 * whether it went out. The admin taps send. Everything up to that tap --
 * choosing recipients, merging names and amounts, tracking who is still
 * pending -- is automated.
 */

const TEMPLATE_FIELDS = [
  "{{name}}",
  "{{first_name}}",
  "{{guardian}}",
  "{{room}}",
  "{{hostel}}",
  "{{amount}}",
  "{{balance}}",
  "{{month}}",
  "{{due_date}}",
] as const;

export const TEMPLATE_PLACEHOLDERS: readonly string[] = TEMPLATE_FIELDS;

export interface TemplateContext {
  name?: string;
  guardian?: string;
  room?: string | null;
  hostel?: string;
  amount?: number;
  balance?: number;
  period?: string;
  dueDate?: string;
  currencySymbol?: string;
}

/** Substitutes `{{placeholders}}`; unknown fields collapse to an empty string. */
export function renderTemplate(body: string, context: TemplateContext): string {
  const symbol = context.currencySymbol ?? "₹";
  const name = context.name ?? "";
  const values: Record<string, string> = {
    "{{name}}": name,
    "{{first_name}}": name.trim().split(/\s+/)[0] ?? "",
    "{{guardian}}": context.guardian ?? "",
    "{{room}}": context.room ?? "not assigned",
    "{{hostel}}": context.hostel ?? "",
    "{{amount}}": context.amount != null ? formatMoney(context.amount, symbol) : "",
    "{{balance}}": context.balance != null ? formatMoney(context.balance, symbol) : "",
    "{{month}}": context.period ? formatPeriod(context.period) : "",
    "{{due_date}}": context.dueDate ? formatDate(context.dueDate) : "",
  };

  return body.replace(/\{\{\s*\w+\s*\}\}/g, (match) => {
    const key = `{{${match.replace(/[{}\s]/g, "")}}}`;
    return values[key] ?? "";
  });
}

// --- templates --------------------------------------------------------------

const BUILT_IN: { name: string; kind: MessageKind; body: string }[] = [
  {
    name: "Fee due reminder",
    kind: "fee_reminder",
    body:
      "Dear {{name}},\n\nThis is a reminder from {{hostel}} that your hostel fee for " +
      "{{month}} is due on {{due_date}}.\n\nOutstanding amount: {{balance}}\nRoom: {{room}}\n\n" +
      "Kindly clear it at the hostel office at the earliest.\n\nThank you.",
  },
  {
    name: "Fee overdue notice",
    kind: "fee_reminder",
    body:
      "Dear {{name}},\n\nOur records show that your hostel fee for {{month}} " +
      "({{balance}}) is still pending, and the due date of {{due_date}} has passed.\n\n" +
      "Please settle it immediately to avoid further action.\n\n- {{hostel}}",
  },
  {
    name: "Payment received",
    kind: "custom",
    body:
      "Dear {{name}},\n\nWe have received your payment of {{amount}} towards the " +
      "{{month}} hostel fee. Thank you.\n\n- {{hostel}}",
  },
  {
    name: "General announcement",
    kind: "announcement",
    body: "Dear {{name}},\n\n[Write your announcement here]\n\n- {{hostel}}",
  },
  {
    name: "Maintenance notice",
    kind: "announcement",
    body:
      "Dear {{name}},\n\nPlease note that maintenance work is scheduled in the hostel. " +
      "Water/power supply may be interrupted during this period.\n\nRoom: {{room}}\n\n" +
      "We regret the inconvenience.\n\n- {{hostel}}",
  },
];


/**
 * Seeds the built-in templates once, on first run.
 *
 * Their ids are fixed, so two people opening a brand-new store at the same
 * moment write the same five templates rather than ten.
 */
export async function seedTemplates(): Promise<void> {
  if (list<MessageTemplate>("templates").some((template) => Boolean(template.isBuiltIn))) return;

  const now = Date.now();
  for (const [index, template] of BUILT_IN.entries()) {
    const id = `builtin-${index + 1}`;
    await put("templates", id, {
      id,
      name: template.name,
      kind: template.kind,
      body: template.body,
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** Older records (and restored phone backups) may carry `isBuiltIn` as 0/1. */
function hydrateTemplate(template: MessageTemplate): MessageTemplate {
  return { ...template, isBuiltIn: Boolean(template.isBuiltIn) };
}

export async function listTemplates(kind?: MessageKind): Promise<MessageTemplate[]> {
  return list<MessageTemplate>("templates")
    .map(hydrateTemplate)
    .filter((template) => !kind || template.kind === kind)
    .sort((a, b) => Number(b.isBuiltIn) - Number(a.isBuiltIn) || compareRaw(a.name, b.name));
}

export async function saveTemplate(
  id: string | null,
  name: string,
  kind: MessageKind,
  body: string
): Promise<void> {
  const now = Date.now();
  if (id) {
    if (!find("templates", id)) return;
    await patch("templates", id, { name, kind, body, updatedAt: now });
    logActivity({ action: "updated", entity: "template", entityId: id, label: name, branchId: null });
  } else {
    const newTemplateId = newId();
    await put("templates", newTemplateId, {
      id: newTemplateId,
      name,
      kind,
      body,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    });
    logActivity({ action: "created", entity: "template", entityId: newTemplateId, label: name, branchId: null });
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = find<MessageTemplate>("templates", id);
  // Built-in templates are part of the app and cannot be deleted.
  if (!template || template.isBuiltIn) return;
  await remove("templates", id);
  logActivity({ action: "deleted", entity: "template", entityId: id, label: template.name, branchId: null });
}

// --- send queue -------------------------------------------------------------

/**
 * A batch is stored in chunks of up to `CHUNK` recipients, one document each
 * (`messages/<batchId>-<n>`), with the entries kept as a map by id. A whole
 * hostel's fee run fits comfortably inside the store's per-document limit,
 * and marking one message sent touches only its own entry.
 */
const CHUNK = 100;

type EntryDoc = Omit<MessageLogEntry, "batchId">;

interface BatchChunkDoc {
  batchId: string;
  chunk: number;
  kind: MessageKind;
  createdAt: number;
  entries?: Record<string, EntryDoc>;
}

function chunksOf(batchId: string): [string, BatchChunkDoc][] {
  return entries<BatchChunkDoc>("messages").filter(([, doc]) => doc.batchId === batchId);
}

export interface QueueRecipient {
  studentId: string | null;
  name: string;
  phone: string;
  body: string;
}

/** Creates a batch of queued messages and returns its id. */
export async function queueBatch(kind: MessageKind, recipients: QueueRecipient[]): Promise<string> {
  const batchId = newBatchId();
  const now = Date.now();

  for (let start = 0, chunk = 0; start < recipients.length; start += CHUNK, chunk += 1) {
    const part: Record<string, EntryDoc> = {};
    for (const recipient of recipients.slice(start, start + CHUNK)) {
      const id = newId();
      part[id] = {
        id,
        studentId: recipient.studentId,
        recipientName: recipient.name,
        phone: recipient.phone,
        kind,
        body: recipient.body,
        status: "queued",
        createdAt: now,
        sentAt: null,
      };
    }
    await put("messages", `${batchId}-${chunk}`, { batchId, chunk, kind, createdAt: now, entries: part });
  }

  logActivity({
    action: "created",
    entity: "message",
    entityId: batchId,
    label: `${recipients.length} WhatsApp message${recipients.length === 1 ? "" : "s"} queued`,
    branchId: null,
  });
  return batchId;
}

export async function listBatchEntries(batchId: string): Promise<MessageLogEntry[]> {
  return chunksOf(batchId)
    .flatMap(([, doc]) => Object.values(doc.entries ?? {}).map((entry) => ({ ...entry, batchId })))
    .sort((a, b) => a.createdAt - b.createdAt || compareText(a.recipientName, b.recipientName));
}

export async function markMessage(id: string, status: MessageLogEntry["status"]): Promise<void> {
  const holder = entries<BatchChunkDoc>("messages").find(([, doc]) => doc.entries?.[id]);
  if (!holder) return;
  await patch("messages", holder[0], {
    entries: { [id]: { status, sentAt: status === "sent" ? Date.now() : null } },
  });
}

export async function listBatches(limit = 30): Promise<MessageBatchSummary[]> {
  const batches = new Map<string, MessageBatchSummary>();
  for (const [, doc] of entries<BatchChunkDoc>("messages")) {
    for (const entry of Object.values(doc.entries ?? {})) {
      const summary = batches.get(doc.batchId);
      if (!summary) {
        batches.set(doc.batchId, {
          batchId: doc.batchId,
          kind: entry.kind,
          createdAt: entry.createdAt,
          total: 1,
          sent: entry.status === "sent" ? 1 : 0,
          pending: entry.status === "queued" ? 1 : 0,
          preview: entry.body,
        });
        continue;
      }
      // Matches the old MIN() aggregates, so the list reads exactly as before.
      if (compareRaw(entry.kind, summary.kind) < 0) summary.kind = entry.kind;
      if (entry.createdAt < summary.createdAt) summary.createdAt = entry.createdAt;
      if (compareRaw(entry.body, summary.preview) < 0) summary.preview = entry.body;
      summary.total += 1;
      if (entry.status === "sent") summary.sent += 1;
      if (entry.status === "queued") summary.pending += 1;
    }
  }
  return [...batches.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deleteBatch(batchId: string): Promise<void> {
  for (const [docId] of chunksOf(batchId)) await remove("messages", docId);
}

/** Every message still waiting to be sent, across all batches. */
export function pendingMessageCount(): number {
  return list<BatchChunkDoc>("messages").reduce(
    (sum, doc) => sum + Object.values(doc.entries ?? {}).filter((entry) => entry.status === "queued").length,
    0
  );
}

// --- opening WhatsApp -------------------------------------------------------

export class WhatsAppError extends Error {}

/**
 * Opens a WhatsApp chat with the message pre-filled.
 *
 * Tries the `whatsapp://` scheme first because it goes straight to the app;
 * `https://wa.me/` is the fallback and also covers WhatsApp Business.
 */
export async function openWhatsApp(
  phone: string,
  message: string,
  countryCode: string
): Promise<void> {
  const number = toWhatsAppNumber(phone, countryCode);
  if (!number) {
    throw new WhatsAppError("This student has no usable phone number saved.");
  }

  const text = encodeURIComponent(message);
  const appUrl = `whatsapp://send?phone=${number}&text=${text}`;
  const webUrl = `https://wa.me/${number}?text=${text}`;

  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {
    // Fall through to the web link.
  }

  try {
    await Linking.openURL(webUrl);
  } catch {
    throw new WhatsAppError(
      "WhatsApp could not be opened. Make sure it is installed and signed in on this phone."
    );
  }
}

/** True when WhatsApp appears to be installed. Used to warn before a big batch. */
export async function isWhatsAppAvailable(): Promise<boolean> {
  try {
    return await Linking.canOpenURL("whatsapp://send?phone=910000000000");
  } catch {
    return false;
  }
}
