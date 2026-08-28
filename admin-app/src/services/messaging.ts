import { Linking } from "react-native";

import { getDb } from "@/db";
import {
  MessageBatchSummary,
  MessageKind,
  MessageLogEntry,
  MessageTemplate,
} from "@/types";
import { newBatchId, newId } from "@/utils/id";
import { formatMoney, formatDate, formatPeriod } from "@/utils/format";
import { toWhatsAppNumber } from "@/utils/validate";

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

/** Seeds the built-in templates once, on first run. */
export async function seedTemplates(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM message_templates WHERE isBuiltIn = 1;"
  );
  if ((existing?.n ?? 0) > 0) return;

  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const template of BUILT_IN) {
      await txn.runAsync(
        `INSERT INTO message_templates (id, name, kind, body, isBuiltIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 1, ?, ?);`,
        newId(), template.name, template.kind, template.body, now, now
      );
    }
  });
}

/** SQLite has no boolean type, so `isBuiltIn` arrives as 0/1. */
type TemplateRow = Omit<MessageTemplate, "isBuiltIn"> & { isBuiltIn: number };

export async function listTemplates(kind?: MessageKind): Promise<MessageTemplate[]> {
  const db = await getDb();
  const rows = kind
    ? await db.getAllAsync<TemplateRow>(
        "SELECT * FROM message_templates WHERE kind = ? ORDER BY isBuiltIn DESC, name;",
        kind
      )
    : await db.getAllAsync<TemplateRow>(
        "SELECT * FROM message_templates ORDER BY isBuiltIn DESC, name;"
      );
  return rows.map((row) => ({ ...row, isBuiltIn: Boolean(row.isBuiltIn) }));
}

export async function saveTemplate(
  id: string | null,
  name: string,
  kind: MessageKind,
  body: string
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  if (id) {
    await db.runAsync(
      "UPDATE message_templates SET name = ?, kind = ?, body = ?, updatedAt = ? WHERE id = ?;",
      name, kind, body, now, id
    );
  } else {
    await db.runAsync(
      `INSERT INTO message_templates (id, name, kind, body, isBuiltIn, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, ?, ?);`,
      newId(), name, kind, body, now, now
    );
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM message_templates WHERE id = ? AND isBuiltIn = 0;", id);
}

// --- send queue -------------------------------------------------------------

export interface QueueRecipient {
  studentId: string | null;
  name: string;
  phone: string;
  body: string;
}

/** Creates a batch of queued messages and returns its id. */
export async function queueBatch(kind: MessageKind, recipients: QueueRecipient[]): Promise<string> {
  const db = await getDb();
  const batchId = newBatchId();
  const now = Date.now();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const recipient of recipients) {
      await txn.runAsync(
        `INSERT INTO message_log (id, batchId, studentId, recipientName, phone, kind, body, status, createdAt, sentAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, NULL);`,
        newId(), batchId, recipient.studentId, recipient.name, recipient.phone, kind, recipient.body, now
      );
    }
  });

  return batchId;
}

export async function listBatchEntries(batchId: string): Promise<MessageLogEntry[]> {
  const db = await getDb();
  return db.getAllAsync<MessageLogEntry>(
    "SELECT * FROM message_log WHERE batchId = ? ORDER BY createdAt, recipientName COLLATE NOCASE;",
    batchId
  );
}

export async function markMessage(id: string, status: MessageLogEntry["status"]): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE message_log SET status = ?, sentAt = ? WHERE id = ?;",
    status, status === "sent" ? Date.now() : null, id
  );
}

export async function listBatches(limit = 30): Promise<MessageBatchSummary[]> {
  const db = await getDb();
  return db.getAllAsync<MessageBatchSummary>(
    `SELECT batchId,
            MIN(kind) AS kind,
            MIN(createdAt) AS createdAt,
            COUNT(*) AS total,
            COALESCE(SUM(status = 'sent'), 0) AS sent,
            COALESCE(SUM(status = 'queued'), 0) AS pending,
            MIN(body) AS preview
     FROM message_log
     GROUP BY batchId
     ORDER BY createdAt DESC
     LIMIT ?;`,
    limit
  );
}

export async function deleteBatch(batchId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM message_log WHERE batchId = ?;", batchId);
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
