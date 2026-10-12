/**
 * Lets the browser version of the app download a photo's bytes ("Save photo").
 *
 * Showing a photo needs nothing extra, but saving one reads the file from a
 * page on another address, which the storage bucket must allow (CORS). This
 * allows reading only; who may read is still decided by storage.rules and the
 * photo's own private link. Safe to run twice.
 *
 *   set GOOGLE_APPLICATION_CREDENTIALS=keys\<key file>.json
 *   node scripts/allow-photo-downloads.mjs royal-hostel-staging.firebasestorage.app
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const bucketName = process.argv[2];
if (!bucketName) {
  console.error("Give the bucket, e.g. royal-hostel-staging.firebasestorage.app");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), storageBucket: bucketName });
const bucket = getStorage().bucket();
await bucket.setCorsConfiguration([{ origin: ["*"], method: ["GET", "HEAD"], responseHeader: ["Content-Type"], maxAgeSeconds: 3600 }]);
const [metadata] = await bucket.getMetadata();
console.log(`Browser downloads allowed on ${bucketName}:`, JSON.stringify(metadata.cors));
process.exit(0);
