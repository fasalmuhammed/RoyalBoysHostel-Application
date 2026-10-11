/**
 * Creates (or resets) a login from the command line.
 *
 * Needed once, for the first admin: managers are created by the admin from
 * inside the app. Also the way back in if the admin password is ever lost.
 *
 *   node scripts/create-login.mjs --username admin --name "Admin" --role admin
 *   node scripts/create-login.mjs --username thammanam --name "Thammanam manager" \
 *        --role manager --branch branch-thammanam
 *
 * The password is asked for (not shown), or taken from LOGIN_PASSWORD.
 *
 * Which project, and as whom:
 *  - by default, the Google account signed in to the Firebase tools on this
 *    computer (`npx firebase login`), which must own the project -- no key
 *    file needed; name the project with --project;
 *  - or a service-account key file named in GOOGLE_APPLICATION_CREDENTIALS;
 *  - or the local emulators, when FIREBASE_AUTH_EMULATOR_HOST and
 *    FIRESTORE_EMULATOR_HOST are set.
 */
import { createRequire } from "node:module";
import readline from "node:readline";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const LOGIN_DOMAIN = "staff.royalhostel.app";
const BRANCHES = ["branch-thammanam", "branch-Kalamassery"];

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Reads a password, showing a * for each character typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const input = process.stdin;
    process.stdout.write(question);
    if (!input.isTTY) {
      // Piped input (tests): take the first line as it is.
      const rl = readline.createInterface({ input });
      rl.once("line", (line) => {
        rl.close();
        resolve(line);
      });
      return;
    }
    let typed = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(typed);
          return;
        }
        if (ch === "\u0003") process.exit(1); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") {
          if (typed.length > 0) {
            typed = typed.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (ch >= " ") {
          typed += ch;
          process.stdout.write("*");
        }
      }
    };
    input.on("data", onData);
  });
}

/** Asks twice, so a slip of the finger is caught now rather than at the login screen. */
async function askPassword(who) {
  for (;;) {
    const first = await askHidden(`Password for "${who}": `);
    if (first.length < 8) {
      console.log("Use at least 8 characters. Try again.");
      continue;
    }
    const second = await askHidden("Type it again to confirm: ");
    if (first === second) return first;
    console.log("Those two did not match. Try again.");
  }
}

const username = (option("username") ?? "").trim().toLowerCase();
const name = option("name") ?? username;
const role = option("role");
const branchId = option("branch") ?? null;

if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
  console.error("Give --username: 3-30 letters, digits, dot, dash or underscore.");
  process.exit(1);
}
if (role !== "admin" && role !== "manager") {
  console.error('Give --role admin or --role manager.');
  process.exit(1);
}
if (role === "manager" && !BRANCHES.includes(branchId)) {
  console.error(`A manager needs --branch, one of: ${BRANCHES.join(", ")}`);
  process.exit(1);
}

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = option("project") ?? process.env.GCLOUD_PROJECT ?? (usingEmulator ? "demo-hostel" : undefined);
/** Acts as the account signed in to the Firebase tools, through its own token refresh. */
function cliCredential() {
  const tools = createRequire(import.meta.url)("firebase-tools/lib/auth");
  const account = tools.getGlobalDefaultAccount();
  if (!account) {
    console.error('Not signed in. Run "npx firebase login" first.');
    process.exit(1);
  }
  console.log(`Acting as ${account.user.email} on project ${projectId}.`);
  return {
    getAccessToken: async () => {
      const token = await tools.getAccessToken(account.tokens.refresh_token, []);
      return { access_token: token.access_token, expires_in: 3000 };
    },
  };
}

if (!usingEmulator && !projectId) {
  console.error("Give --project, e.g. --project royal-hostel-staging.");
  process.exit(1);
}
const credential = usingEmulator
  ? undefined
  : process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? applicationDefault()
    : cliCredential();
initializeApp(usingEmulator ? { projectId } : { credential, projectId });

const password = process.env.LOGIN_PASSWORD ?? (await askPassword(username));
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}

const email = `${username}@${LOGIN_DOMAIN}`;
const auth = getAuth();
let uid;
try {
  uid = (await auth.getUserByEmail(email)).uid;
  await auth.updateUser(uid, { password, disabled: false });
  console.log(`Login "${username}" already existed; its password was reset.`);
} catch {
  uid = (await auth.createUser({ email, password, displayName: name })).uid;
  console.log(`Login "${username}" created.`);
}

const now = Date.now();
const staff = { uid, username, name, role, branchId: role === "admin" ? null : branchId, disabled: false, updatedAt: now, createdAt: now };

if (credential && typeof credential.getAccessToken === "function" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Signed in through the Firebase tools: the database client wants a key
  // file, so the record is written through the database's web API instead.
  const { access_token: token } = await credential.getAccessToken();
  const toValue = (value) =>
    value === null ? { nullValue: null }
      : typeof value === "boolean" ? { booleanValue: value }
      : typeof value === "number" ? { integerValue: String(value) }
      : { stringValue: String(value) };
  const fields = Object.fromEntries(Object.entries(staff).map(([key, value]) => [key, toValue(value)]));
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/staff/${uid}`,
    { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ fields }) }
  );
  if (!response.ok) {
    console.error(`The login was created but its access record could not be saved: ${(await response.text()).slice(0, 300)}`);
    process.exit(1);
  }
} else {
  await getFirestore().collection("staff").doc(uid).set(staff, { merge: true });
}
console.log(`${role === "admin" ? "Admin" : `Manager of ${branchId}`} access set for "${username}".`);
process.exit(0);
