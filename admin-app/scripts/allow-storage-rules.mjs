/**
 * Lets the file-storage rules look up who is signed in.
 *
 * storage.rules decides who may open a photo by reading the login's
 * staff/<uid> record from the database. Firebase only allows that once its
 * own storage service has been given the "Firebase Rules Firestore Service
 * Agent" role on the project (the console offers this as a one-click prompt).
 * Without it every photo is refused. Uses the account signed in to the
 * Firebase tools. Safe to run twice.
 *
 *   node scripts/allow-storage-rules.mjs royal-hostel-staging           (check only)
 *   node scripts/allow-storage-rules.mjs royal-hostel-staging --grant
 */
import { createRequire } from "node:module";

const projectId = process.argv[2];
const grant = process.argv.includes("--grant");
if (!projectId) {
  console.error("Give the project, e.g. node scripts/allow-storage-rules.mjs royal-hostel-staging");
  process.exit(1);
}
const tools = createRequire(import.meta.url)("firebase-tools/lib/auth");
const account = tools.getGlobalDefaultAccount();
if (!account) {
  console.error('Not signed in. Run "npx firebase login" first.');
  process.exit(1);
}
const { access_token: token } = await tools.getAccessToken(account.tokens.refresh_token, []);
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const api = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`;

async function call(url, body) {
  const response = await fetch(url, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  if (!response.ok) {
    console.error(`Request failed: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
    process.exit(1);
  }
  return json;
}

const { projectNumber } = await call(api);
const member = `serviceAccount:service-${projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
const role = "roles/firebaserules.firestoreServiceAgent";

const policy = await call(`${api}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } });
const binding = (policy.bindings ?? []).find((b) => b.role === role);
if (binding?.members?.includes(member)) {
  console.log("Already allowed: the storage rules can read the login records.");
  process.exit(0);
}
if (!grant) {
  console.log("NOT allowed yet: the storage rules cannot read the login records, so photos are refused.");
  console.log("Run again with --grant to fix it.");
  process.exit(2);
}
if (binding) binding.members.push(member);
else (policy.bindings ??= []).push({ role, members: [member] });
await call(`${api}:setIamPolicy`, { policy });
console.log(`Allowed: ${member} now has ${role}.`);
