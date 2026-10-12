/**
 * Turns off self sign-up for a Firebase project, so the only logins are the
 * ones the admin creates. Uses the account signed in to the Firebase tools.
 *
 *   node scripts/lock-signup.mjs royal-hostel-staging
 */
import { createRequire } from "node:module";

const projectId = process.argv[2];
if (!projectId) {
  console.error("Give the project, e.g. node scripts/lock-signup.mjs royal-hostel-staging");
  process.exit(1);
}
const tools = createRequire(import.meta.url)("firebase-tools/lib/auth");
const account = tools.getGlobalDefaultAccount();
if (!account) {
  console.error('Not signed in. Run "npx firebase login" first.');
  process.exit(1);
}
const { access_token: token } = await tools.getAccessToken(account.tokens.refresh_token, []);
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=client.permissions`;
const response = await fetch(url, {
  method: "PATCH",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-goog-user-project": projectId },
  body: JSON.stringify({ client: { permissions: { disabledUserSignup: true, disabledUserDeletion: true } } }),
});
const body = await response.json();
if (!response.ok) {
  console.error(`Could not change the setting: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  process.exit(1);
}
console.log(`Sign-up from outside is now off for ${projectId}:`, JSON.stringify(body.client?.permissions));
