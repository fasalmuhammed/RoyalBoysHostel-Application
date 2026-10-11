/**
 * The form students open by scanning a hostel's QR code.
 *
 * GET  ?b=<branchId>  the hostel's name and rooms, to fill the form's choices.
 * POST {...}          one filled form, which waits for staff to approve it.
 *
 * Students have no login, so the database and file storage stay closed to
 * them: everything they send is checked here and written by the server.
 */
const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const MAX_PHOTO_BYTES = 1200 * 1024;
/** One phone or Wi-Fi network may send this many forms an hour. */
const MAX_PER_HOUR = 8;
/** A hostel never has this many forms waiting; beyond it, something is wrong. */
const MAX_PENDING = 150;
const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

class FormError extends Error {}

function text(value, label, { max, required = false }) {
  const out = String(value ?? "").replace(/\s+/g, " ").trim();
  if (required && !out) throw new FormError(`${label} is needed.`);
  if (out.length > max) throw new FormError(`${label} is too long.`);
  return out;
}

function phone(value, label, required) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  if (!digits && !required) return "";
  if (!/^[6-9]\d{9}$/.test(digits)) throw new FormError(`${label}: enter a 10-digit mobile number.`);
  return digits;
}

/** A JPEG sent as base64, checked by its first bytes rather than its label. */
function jpeg(value, label) {
  const raw = String(value ?? "").replace(/^data:image\/jpeg;base64,/, "");
  if (!raw) throw new FormError(`${label} is needed.`);
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new FormError(`${label} could not be read. Take the photo again.`);
  }
  if (bytes.length > MAX_PHOTO_BYTES) throw new FormError(`${label} is too large. Take the photo again.`);
  return bytes;
}

/** The hostel a form is for, with its rooms and how many beds each has free. */
async function hostelInfo(branchId) {
  const db = getFirestore();
  const id = String(branchId ?? "");
  if (!id || id.includes("/")) return null;
  const branch = await db.collection("branches").doc(id).get();
  if (!branch.exists) return null;
  const [rooms, inmates] = await Promise.all([
    db.collection("rooms").where("branchId", "==", branch.id).get(),
    db.collection("inmates").where("branchId", "==", branch.id).get(),
  ]);
  const taken = new Map();
  inmates.forEach((doc) => {
    const inmate = doc.data();
    if (inmate.status === "active" && inmate.roomId) taken.set(inmate.roomId, (taken.get(inmate.roomId) ?? 0) + 1);
  });
  const list = rooms.docs
    .map((doc) => {
      const room = doc.data();
      const label = [room.block, room.roomNumber].filter(Boolean).join("-");
      return { id: doc.id, label, free: Math.max(0, (Number(room.capacity) || 0) - (taken.get(doc.id) ?? 0)) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return { branch: { id: branch.id, name: branch.data().name }, rooms: list };
}

/** Refuses a flood from one place without keeping the address itself. */
async function throttle(ip) {
  const key = crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 32);
  const ref = getFirestore().collection("joinThrottle").doc(key);
  const now = Date.now();
  await getFirestore().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const fresh = !data || now - data.windowStart > 60 * 60 * 1000;
    const count = fresh ? 1 : data.count + 1;
    if (count > MAX_PER_HOUR) throw new FormError("Too many forms were sent from here. Try again in an hour.");
    tx.set(ref, { windowStart: fresh ? now : data.windowStart, count });
  });
}

async function saveApplication(body) {
  const info = await hostelInfo(body.branchId);
  if (!info) throw new FormError("This registration link is not valid. Scan the QR code again.");

  const roomId = String(body.roomId ?? "");
  if (roomId && !info.rooms.some((room) => room.id === roomId)) throw new FormError("Choose your room again.");
  const bloodGroup = String(body.bloodGroup ?? "").toUpperCase().trim();
  if (!BLOOD_GROUPS.includes(bloodGroup)) throw new FormError("Choose a blood group from the list.");
  const email = text(body.email, "Email", { max: 120 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError("That email address looks wrong.");

  const application = {
    branchId: info.branch.id,
    status: "pending",
    fullName: text(body.fullName, "Your name", { max: 80, required: true }),
    phone: phone(body.phone, "Your mobile", true),
    email,
    course: text(body.course, "Course", { max: 80 }),
    year: text(body.year, "Year", { max: 20 }),
    institution: text(body.institution, "College / company", { max: 100 }),
    guardianName: text(body.guardianName, "Guardian name", { max: 80, required: true }),
    guardianPhone: phone(body.guardianPhone, "Guardian mobile", true),
    emergencyPhone: phone(body.emergencyPhone, "Emergency contact number", true),
    address: text(body.address, "Address", { max: 400, required: true }),
    bloodGroup,
    roomId: roomId || null,
  };
  const photos = {
    photoFile: ["profile", jpeg(body.photo, "Your photo")],
    idProofFile: ["aadhaar-front", jpeg(body.idFront, "Aadhaar front")],
    idProofBackFile: ["aadhaar-back", jpeg(body.idBack, "Aadhaar back")],
  };

  const db = getFirestore();
  const pending = await db.collection("applications").where("branchId", "==", info.branch.id).count().get();
  if (pending.data().count >= MAX_PENDING) {
    throw new FormError("Registration is paused for now. Please tell the hostel office.");
  }

  // Photos go where an inmate's photos live, so approving needs no copying.
  const ref = db.collection("applications").doc();
  const bucket = getStorage().bucket();
  for (const [field, [name, bytes]] of Object.entries(photos)) {
    const path = `photos/${info.branch.id}/app-${ref.id}-${name}.jpg`;
    await bucket.file(path).save(bytes, {
      resumable: false,
      contentType: "image/jpeg",
      metadata: { metadata: { firebaseStorageDownloadTokens: crypto.randomUUID() } },
    });
    application[field] = path.split("/").join("~");
  }
  const now = Date.now();
  await ref.set({ id: ref.id, ...application, createdAt: now, updatedAt: now });
  return ref.id;
}

exports.join = onRequest({ memory: "512MiB", timeoutSeconds: 60 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const info = await hostelInfo(req.query.b);
      if (!info) {
        return res.status(404).json({ error: "This registration link is not valid. Scan the QR code again." });
      }
      return res.json(info);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Not allowed." });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    // A field people never see; only a script fills it in.
    if (body.website) return res.json({ ok: true });
    await throttle(req.ip);
    const id = await saveApplication(body);
    return res.json({ ok: true, id });
  } catch (error) {
    if (error instanceof FormError) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});
