/**
 * Server-side work the app itself must not be able to do.
 *
 * Logins: only the admin creates, changes, switches off and removes them, and
 * the app cannot write staff/<uid> at all (see firestore.rules) -- every such
 * change comes through `staff` below, which checks who is asking first.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
// Mumbai, next to the database.
setGlobalOptions({ region: "asia-south1", maxInstances: 5 });

const LOGIN_DOMAIN = "staff.royalhostel.app";
const USERNAME = /^[a-z0-9._-]{3,30}$/;

const emailOf = (username) => `${username}@${LOGIN_DOMAIN}`;

/** The caller's own record; refuses anyone who is not an active admin. */
async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Log in first.");
  const snap = await getFirestore().collection("staff").doc(request.auth.uid).get();
  const me = snap.data();
  if (!me || me.disabled || me.role !== "admin") {
    throw new HttpsError("permission-denied", "Only the admin can manage logins.");
  }
  return { uid: request.auth.uid, ...me };
}

function cleanName(value) {
  const name = String(value ?? "").trim();
  if (name.length < 2 || name.length > 60) throw new HttpsError("invalid-argument", "Enter the person's name.");
  return name;
}

function cleanPassword(value) {
  const password = String(value ?? "");
  if (password.length < 8) throw new HttpsError("invalid-argument", "Use a password of at least 8 characters.");
  if (password.length > 100) throw new HttpsError("invalid-argument", "That password is too long.");
  return password;
}

async function cleanBranch(value) {
  const branchId = String(value ?? "");
  const snap = branchId ? await getFirestore().collection("branches").doc(branchId).get() : null;
  if (!snap || !snap.exists) throw new HttpsError("invalid-argument", "Choose which hostel this manager runs.");
  return branchId;
}

/** A manager's record, or a refusal: the admin login is not managed from here. */
async function managerRecord(uid) {
  const ref = getFirestore().collection("staff").doc(String(uid ?? ""));
  const snap = await ref.get();
  const staff = snap.data();
  if (!staff) throw new HttpsError("not-found", "That login no longer exists.");
  if (staff.role !== "manager") {
    throw new HttpsError("failed-precondition", "The admin login cannot be changed from here.");
  }
  return { ref, staff };
}

const actions = {
  /** A new manager login for one hostel. */
  async create(data) {
    const username = String(data.username ?? "").trim().toLowerCase();
    if (!USERNAME.test(username)) {
      throw new HttpsError("invalid-argument", "User ID: 3 to 30 small letters, digits, dot, dash or underscore.");
    }
    const name = cleanName(data.name);
    const password = cleanPassword(data.password);
    const branchId = await cleanBranch(data.branchId);

    let user;
    try {
      user = await getAuth().createUser({ email: emailOf(username), password, displayName: name });
    } catch (error) {
      if (error.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", `The user ID "${username}" is already taken.`);
      }
      throw error;
    }
    const now = Date.now();
    await getFirestore().collection("staff").doc(user.uid).set({
      uid: user.uid,
      username,
      name,
      role: "manager",
      branchId,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    });
    return { uid: user.uid };
  },

  /** Renames a manager or moves them to the other hostel. */
  async update(data) {
    const { ref, staff } = await managerRecord(data.uid);
    const patch = { updatedAt: Date.now() };
    if (data.name !== undefined) patch.name = cleanName(data.name);
    if (data.branchId !== undefined) patch.branchId = await cleanBranch(data.branchId);
    await ref.update(patch);
    if (patch.name) await getAuth().updateUser(staff.uid, { displayName: patch.name });
    // Moved hostels: their open app is sent back to log in again.
    if (patch.branchId && patch.branchId !== staff.branchId) await getAuth().revokeRefreshTokens(staff.uid);
    return { uid: staff.uid };
  },

  /** A new password, and every phone signed in with the old one is signed out. */
  async resetPassword(data) {
    const { ref, staff } = await managerRecord(data.uid);
    await getAuth().updateUser(staff.uid, { password: cleanPassword(data.password) });
    await getAuth().revokeRefreshTokens(staff.uid);
    await ref.update({ updatedAt: Date.now() });
    return { uid: staff.uid };
  },

  /** Switches a login off (or back on) without losing it. */
  async setDisabled(data) {
    const { ref, staff } = await managerRecord(data.uid);
    const disabled = data.disabled === true;
    await getAuth().updateUser(staff.uid, { disabled });
    if (disabled) await getAuth().revokeRefreshTokens(staff.uid);
    await ref.update({ disabled, updatedAt: Date.now() });
    return { uid: staff.uid };
  },

  /** Removes a login for good. Records they entered stay. */
  async remove(data) {
    const { ref, staff } = await managerRecord(data.uid);
    await ref.delete();
    await getAuth().deleteUser(staff.uid).catch((error) => {
      if (error.code !== "auth/user-not-found") throw error;
    });
    return { uid: staff.uid };
  },
};

exports.staff = onCall(async (request) => {
  await requireAdmin(request);
  const data = request.data ?? {};
  const action = actions[data.action];
  if (!action) throw new HttpsError("invalid-argument", "Unknown request.");
  return action(data);
});
