# Hostel Manager — offline admin app

A single-admin hostel register that runs entirely on one phone. No accounts, no
server, no cloud, no internet. The hostel manager adds students (with a photo
taken on the spot), allocates rooms, raises and collects fees, and sends
WhatsApp reminders — and moves the whole dataset to a new phone with one file.

Built with Expo (React Native) + TypeScript + SQLite.

---

## Why it is built this way

| Decision | Reason |
| --- | --- |
| **SQLite**, not AsyncStorage | AsyncStorage on Android caps out around 6 MB and has no queries. Hundreds of students with fee history need real indexes and joins. |
| **Photos on the filesystem**, paths in the DB | Keeps the database small and fast. The DB stores a bare filename, never an absolute URI — sandbox paths change between installs, so absolute URIs would all dangle after a restore. |
| **One `.hostelbak` file**, not CSV | The data is relational and includes photos. A CSV cannot carry either. CSV is still offered, as a *report* format — see below. |
| **Encrypt-then-MAC backups** | The file leaves the phone (WhatsApp, email, Drive) carrying student photos, phone numbers and fee records. |
| **Streaming chunks** | A backup is written and read in 256 KB pieces, so a hostel with 500 photos never has to fit the whole dataset in memory at once. |
| **Derived fee status** | `paid` / `partial` / `unpaid` is computed in SQL from `total` vs `amountPaid`, so it can never drift from the payments actually recorded. |
| **Rent lives on the student** | Rent follows the bed a student is given and is often negotiated per person, so a single hostel-wide default was the wrong home for it. It is captured when adding a student, pre-filled from their room. |
| **Per-student billing cycle** | A bill falls due a set number of days into its period — 30 by default — rather than on one hostel-wide day of the month, so a student on different terms is not forced onto everyone else's deadline. |
| **Admission numbers are issued, not typed** | The number is the student's id, so it is generated as a sequence (1, 2, 3...) from a stored counter combined with the highest number in use. A departed student's number is never reissued — two people sharing an id would make old receipts and exports ambiguous. |
| **Derived room occupancy** | Counted from `students.roomId` rather than stored on the room, so it cannot go stale when a student is deleted or a backup is restored. |

---

## The backup file

One file — `MyHostel_2026-08-29_1430.hostelbak` — holds **everything**: students,
rooms, invoices, payments, notices, message templates and history, settings,
and every student photo.

```
line 1      header JSON        ← plaintext, so the file is always identifiable
lines 2..N  base64 chunks      ← AES-256-CBC, one random IV each
last line   trailer JSON       ← HMAC-SHA256 over the header + every chunk
```

- **Key derivation** — PBKDF2-SHA256, 30 000 rounds, 16-byte random salt,
  producing 64 bytes: 32 for AES, 32 for the MAC. The two keys are independent.
- **Authentication** — the MAC is verified over the *entire* file before a
  single chunk is decrypted, and before any existing data is touched. A wrong
  passphrase, a truncated transfer or a tampered file all fail with the current
  data still intact.
- **Iteration count lives in the header**, so it can be raised later without
  invalidating files written today.

### Restoring

Restore is **replace**, not merge, and it happens in this order:

1. Verify the MAC over the whole file.
2. Write a safety snapshot of the data currently on the phone.
3. Only then wipe and load.

So picking the wrong file costs nothing — the snapshot is listed on the Backup
screen and can be restored straight back.

---

## What the app deliberately does *not* do

Being straight about the limits is part of the design.

**It is not multi-device.** One phone is the source of truth. Two phones both
editing and swapping files would silently lose whichever edits were made on the
copy restored second. If you ever need two people editing at once, that needs
real sync, not file swapping.

**Uninstalling the app deletes everything.** So do a factory reset, a lost
phone, and a broken screen. The in-app snapshots live inside the app sandbox and
die with it — they protect against *mistakes*, not against losing the phone.
Only an exported file kept somewhere else protects against that. The dashboard
nags when the last export is over a week old, and a repeating notification does
the same.

**A forgotten PIN cannot be reset.** There is no account and no email recovery.
The same is true of a lost backup passphrase — the file becomes unreadable.

**CSV export will not restore your app.** It cannot carry photos or the links
between records. It is for printing a register, totalling a month's collection,
and handing a list to management.

### WhatsApp: what "automation" can honestly mean

WhatsApp gives no third-party app a way to send a message silently from your own
number. Unattended sending exists only through the **WhatsApp Business Cloud
API** — a paid, internet-hosted service with pre-approved message templates,
which is the opposite of this app's offline design. The unofficial libraries
that appear to work drive a logged-in web session and are a well-documented way
to get a number banned.

So the app automates everything up to the send:

- picks the recipients (everyone, or exactly the students whose fees are overdue),
- merges each student's name, room, balance, month and due date into the template,
- opens WhatsApp with that student's chat and message already filled in,
- tracks who has been contacted and who is still pending.

You tap send. For a 40-student fee run that is 40 taps instead of 40 messages
typed by hand — and no ban risk.

### The notice board

Notices are records first, messages second. You post one to the board — heading,
category (general / event / maintenance / urgent), and optionally pinned — and it
stays there as the hostel's record of what was announced and when.

"Send on WhatsApp" hands that notice to the same composer everything else uses,
with the text already formatted (`*heading*`, then the body). `{{name}}` and
`{{hostel}}` are deliberately left unresolved at that point so each student still
gets their own greeting. Once a batch is prepared the notice is stamped with the
time it went out, so the board shows at a glance what has been circulated.

Posting and sending are separate on purpose: plenty of notices belong on the
board without going to every student's phone.

---

## Screens

**Setup (first run)** — Start fresh · Restore from a backup · Hostel details · Create PIN
**Main** — Dashboard · Students · Rooms · Fees · More
**Students** — list & search · add/edit with camera capture, rent and billing cycle · detail with fee history
**Rooms** — list with occupancy · add/edit · detail with bed map, move-in/move-out, and moving an existing student in from another room
**Fees** — list by month & status · bill detail · collect payment · bulk-raise monthly bills · PDF receipt
**Notices** — notice board by category, pinning, and one-tap send to students
**WhatsApp** — announcements · fee reminders · templates · send queue
**Other** — Backup & restore · CSV reports · Settings · Change PIN · Lock screen

---

## Running it

```bash
cd admin-app
npm install

npm start          # Expo dev server
npm run android    # build & run on a connected device
npm test           # 226 tests, no device needed
npm run typecheck  # tsc --noEmit
```

### Building an installable APK

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform android
```

`preview` produces a plain APK you can sideload. Expo Go is fine for trying the
UI, but **build a real APK before using it for actual hostel data** — Expo Go
sandboxes storage and its database can be cleared when the Expo Go app updates.

---

## Tests

`npm test` runs 226 assertions against the real service code, using an
in-memory filesystem and a real SQLite engine (`node:sqlite`). No device or
emulator needed.

**`tests/backup.test.js` (68)** — the parts where a bug means data loss:
encrypted round trip, ciphertext contains no plaintext names or phone numbers,
wrong passphrase rejected, tampered chunk caught by the MAC, truncated file
rejected, data left untouched after every failed restore, exact row-for-row
fidelity, Unicode and multi-line fields preserved, photo bytes identical,
relationships still resolve afterwards, and a 63-student dataset spanning many
chunks, and a backup claiming a newer schema refused outright.

**`tests/logic.test.js` (158)** — every migration applied to an existing install
(including the v3 rent backfill from the occupied room), room capacity enforced on create/edit/assign,
beds freed on move-out, deleting a room detaches students instead of deleting
them, payment arithmetic, overpayment rejected rather than clamped, reversal
restores the exact balance, duplicate invoices blocked, bulk invoice generation
safe to re-run, Indian-format money, phone normalisation for `wa.me`, and CSV
escaping including formula-injection guards, notice filtering, pinning and
placeholder rendering, per-student rent and billing-cycle handling, the
admission-number sequence, and the photo lifecycle from capture through
replacement to deletion.

---

## Layout

```
admin-app/
  App.tsx
  src/
    db/            schema + migrations (user_version), connection
    services/      students, rooms, fees, messaging, photos,
                   backup, crypto, security, csv, reminders, settings
    screens/       setup/ · students/ · rooms/ · fees/ · messages/ · top level
    components/    Base, Button, Input, Avatar, Controls
    context/       AppContext — settings, lock state, refresh signal
    utils/         format, validate, receipt, hooks, id
    navigation/    RootNavigator + route types
  tests/           harness + two suites
```

### Fees

There is no hostel-wide rent or due day. Each student carries a `monthlyRent`
and a `billingCycleDays` (default 30), captured on the Add Student form and
pre-filled from whichever room they are allocated — editable, because two
students in the same room can be on different terms. Raising monthly bills
prices each one from its own student and sets its due date to the period start
plus that student's cycle.

Setup therefore asks only for the hostel name, country code and currency
symbol.

---

Adding a schema change: bump `SCHEMA_VERSION` in `src/db/schema.ts`, add the
matching entry to `MIGRATIONS`, and add the table to `BACKUP_TABLES` and to
`wipeAllData` in `src/db/index.ts`. Never edit an existing migration in place —
existing installs and old backup files would diverge from new ones. The notices
table (`V2`) is the worked example; a test applies `V1`, seeds a row, then
migrates and checks the data survived.
