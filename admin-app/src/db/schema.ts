/**
 * Schema definition and forward-only migrations.
 *
 * `SCHEMA_VERSION` is written into SQLite's `user_version` pragma and is also
 * stamped into every backup file. Restoring a backup created by a *newer* app
 * version is refused rather than half-applied — see services/backup.ts.
 */
export const SCHEMA_VERSION = 3;

/** Ordered DDL for a fresh database. */
const V1 = `
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY NOT NULL,
  admissionNo   TEXT NOT NULL DEFAULT '',
  fullName      TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  guardianName  TEXT NOT NULL DEFAULT '',
  guardianPhone TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  course        TEXT NOT NULL DEFAULT '',
  year          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  idProof       TEXT NOT NULL DEFAULT '',
  photoFile     TEXT,
  roomId        TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  joinedOn      TEXT NOT NULL DEFAULT '',
  leftOn        TEXT,
  notes         TEXT NOT NULL DEFAULT '',
  createdAt     INTEGER NOT NULL,
  updatedAt     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY NOT NULL,
  block       TEXT NOT NULL DEFAULT '',
  roomNumber  TEXT NOT NULL,
  floor       TEXT NOT NULL DEFAULT '',
  capacity    INTEGER NOT NULL DEFAULT 1,
  rent        REAL NOT NULL DEFAULT 0,
  deposit     REAL NOT NULL DEFAULT 0,
  amenities   TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_records (
  id          TEXT PRIMARY KEY NOT NULL,
  studentId   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period      TEXT NOT NULL,
  rent        REAL NOT NULL DEFAULT 0,
  electricity REAL NOT NULL DEFAULT 0,
  water       REAL NOT NULL DEFAULT 0,
  other       REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,
  total       REAL NOT NULL DEFAULT 0,
  amountPaid  REAL NOT NULL DEFAULT 0,
  dueDate     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  UNIQUE (studentId, period)
);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY NOT NULL,
  feeRecordId  TEXT NOT NULL REFERENCES fee_records(id) ON DELETE CASCADE,
  studentId    TEXT NOT NULL,
  amount       REAL NOT NULL DEFAULT 0,
  method       TEXT NOT NULL DEFAULT 'cash',
  paidOn       TEXT NOT NULL DEFAULT '',
  reference    TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  createdAt    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_templates (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'custom',
  body       TEXT NOT NULL DEFAULT '',
  isBuiltIn  INTEGER NOT NULL DEFAULT 0,
  createdAt  INTEGER NOT NULL,
  updatedAt  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_log (
  id            TEXT PRIMARY KEY NOT NULL,
  batchId       TEXT NOT NULL,
  studentId     TEXT,
  recipientName TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'custom',
  body          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'queued',
  createdAt     INTEGER NOT NULL,
  sentAt        INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_students_room    ON students (roomId);
CREATE INDEX IF NOT EXISTS idx_students_status  ON students (status);
CREATE INDEX IF NOT EXISTS idx_students_name    ON students (fullName);
CREATE INDEX IF NOT EXISTS idx_fees_student     ON fee_records (studentId);
CREATE INDEX IF NOT EXISTS idx_fees_period      ON fee_records (period);
CREATE INDEX IF NOT EXISTS idx_payments_fee     ON payments (feeRecordId);
CREATE INDEX IF NOT EXISTS idx_msglog_batch     ON message_log (batchId);
`;

/** Adds the notice board. Applied on top of V1, never merged into it. */
const V2 = `
CREATE TABLE IF NOT EXISTS notices (
  id         TEXT PRIMARY KEY NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'general',
  pinned     INTEGER NOT NULL DEFAULT 0,
  postedOn   TEXT NOT NULL DEFAULT '',
  lastSentAt INTEGER,
  createdAt  INTEGER NOT NULL,
  updatedAt  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notices_category ON notices (category);
CREATE INDEX IF NOT EXISTS idx_notices_posted   ON notices (postedOn);
`;

/**
 * Moves the rent and the payment cycle onto the student.
 *
 * Rent follows the bed a student is given and can be negotiated per student,
 * so a single hostel-wide "default rent" was the wrong home for it. Existing
 * students are backfilled from the room they currently occupy, so no one loses
 * their price during the upgrade.
 */
const V3 = `
ALTER TABLE students ADD COLUMN monthlyRent REAL NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN billingCycleDays INTEGER NOT NULL DEFAULT 30;

UPDATE students
SET monthlyRent = COALESCE((SELECT rent FROM rooms WHERE rooms.id = students.roomId), 0);
`;

/**
 * Migrations indexed by the version they upgrade *to*. To add a change, bump
 * SCHEMA_VERSION and add the matching entry — never edit an existing one in
 * place, or existing installs and old backups will diverge from new ones.
 */
export const MIGRATIONS: Record<number, string> = {
  1: V1,
  2: V2,
  3: V3,
};

/** Tables included in a backup, in dependency order (parents first). */
export const BACKUP_TABLES = [
  "rooms",
  "students",
  "fee_records",
  "payments",
  "message_templates",
  "message_log",
  "notices",
  "settings",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
