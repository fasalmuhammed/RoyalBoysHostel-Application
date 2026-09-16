import { Directory, File, Paths } from "expo-file-system";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  deleteObject,
  getBytes,
  getMetadata,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";

import { auth, storage } from "@/firebase/config";
import {
  BackupError,
  type BackupProgress,
  exportForSharing,
  readBackupHeader,
} from "@/services/backup";

const CLOUD_ROOT = "admin-backups";

export type CloudUser = User;

export interface CloudBackup {
  name: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: number;
}

export function subscribeCloudUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function createCloudAccount(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInToCloud(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export function signOutOfCloud(): Promise<void> {
  return signOut(auth);
}

export function resetCloudPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email.trim());
}

function requireUser(): User {
  const user = auth.currentUser;
  if (!user) throw new BackupError("Sign in to your cloud account first.");
  return user;
}

function userRoot(uid: string) {
  return ref(storage, `${CLOUD_ROOT}/${uid}`);
}

export async function listCloudBackups(): Promise<CloudBackup[]> {
  const user = requireUser();
  const result = await listAll(userRoot(user.uid));
  const items = await Promise.all(
    result.items.map(async (item) => {
      const metadata = await getMetadata(item);
      return {
        name: item.name,
        fullPath: item.fullPath,
        sizeBytes: metadata.size,
        createdAt: Date.parse(metadata.timeCreated) || 0,
      };
    })
  );
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function uploadCloudBackup(
  passphrase: string,
  onProgress?: (progress: BackupProgress) => void
): Promise<CloudBackup> {
  const user = requireUser();
  const local = await exportForSharing(passphrase, onProgress);
  const file = new File(local.uri);
  const bytes = await file.bytes();

  onProgress?.({ phase: "uploading", fraction: null, detail: "Uploading encrypted backup" });
  const object = ref(storage, `${CLOUD_ROOT}/${user.uid}/${local.fileName}`);
  const uploaded = await uploadBytes(object, bytes, {
    contentType: "application/octet-stream",
    customMetadata: {
      format: "hostel-backup",
      encrypted: "true",
      createdAt: String(Date.now()),
    },
  });
  const metadata = await getMetadata(uploaded.ref);
  onProgress?.({ phase: "done", fraction: 1, detail: "Cloud backup complete" });

  return {
    name: uploaded.ref.name,
    fullPath: uploaded.ref.fullPath,
    sizeBytes: metadata.size,
    createdAt: Date.parse(metadata.timeCreated) || Date.now(),
  };
}

function downloadsDirectory(): Directory {
  const directory = new Directory(Paths.cache, "cloud-backups");
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export async function downloadCloudBackup(
  backup: CloudBackup,
  onProgress?: (progress: BackupProgress) => void
): Promise<{ uri: string; name: string }> {
  requireUser();
  onProgress?.({ phase: "downloading", fraction: null, detail: "Downloading encrypted backup" });
  const bytes = await getBytes(ref(storage, backup.fullPath));
  const safeName = backup.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const file = new File(downloadsDirectory(), safeName);
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(bytes));

  // Validate immediately so a failed or partial download never reaches the
  // destructive portion of the restore flow.
  readBackupHeader(file.uri);
  onProgress?.({ phase: "done", fraction: 1, detail: "Download complete" });
  return { uri: file.uri, name: backup.name };
}

export async function deleteCloudBackup(fullPath: string): Promise<void> {
  const user = requireUser();
  const expectedPrefix = `${CLOUD_ROOT}/${user.uid}/`;
  if (!fullPath.startsWith(expectedPrefix)) {
    throw new BackupError("That backup does not belong to this cloud account.");
  }
  await deleteObject(ref(storage, fullPath));
}
