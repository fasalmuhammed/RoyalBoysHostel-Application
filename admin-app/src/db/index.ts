import * as SQLite from "expo-sqlite";

import { MIGRATIONS, SCHEMA_VERSION } from "./schema";

export const DATABASE_NAME = "hostel.db";

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens (once) and migrates the local database.
 *
 * Concurrent callers share a single in-flight promise so the migration never
 * runs twice — React 18 double-invokes effects in dev, which would otherwise
 * race two `PRAGMA user_version` bumps against each other.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  if (opening) return opening;

  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
    await migrate(db);
    database = db;
    return db;
  })();

  try {
    return await opening;
  } finally {
    opening = null;
  }
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  let current = row?.user_version ?? 0;

  if (current > SCHEMA_VERSION) {
    throw new Error(
      `This database was written by a newer version of the app (schema ${current}, ` +
        `this build understands ${SCHEMA_VERSION}). Please update the app.`
    );
  }

  while (current < SCHEMA_VERSION) {
    const next = current + 1;
    const sql = MIGRATIONS[next];
    if (!sql) throw new Error(`Missing migration for schema version ${next}.`);
    await db.execAsync(sql);
    // PRAGMA does not accept bound parameters; `next` is a locally derived
    // integer, never user input.
    await db.execAsync(`PRAGMA user_version = ${next};`);
    current = next;
  }
}

/**
 * Closes the handle so the underlying file can be replaced wholesale.
 * Used by restore, which swaps the database out from under the app.
 */
export async function closeDb(): Promise<void> {
  if (!database) return;
  const db = database;
  database = null;
  await db.closeAsync();
}

/** Drops every row from every table without touching the schema. */
export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync("PRAGMA foreign_keys = OFF;");
    for (const table of [
      "payments",
      "fee_records",
      "message_log",
      "message_templates",
      "notices",
      "students",
      "rooms",
      "branches",
      "settings",
    ]) {
      await txn.execAsync(`DELETE FROM ${table};`);
    }
    await txn.execAsync("PRAGMA foreign_keys = ON;");
  });
}
