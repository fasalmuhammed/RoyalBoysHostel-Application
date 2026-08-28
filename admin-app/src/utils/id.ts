import * as Crypto from "expo-crypto";

/**
 * RFC 4122 v4 UUID from the platform CSPRNG.
 *
 * Ids must be globally unique without a server: two phones that each start
 * fresh and later merge exports must not collide.
 */
export function newId(): string {
  return Crypto.randomUUID();
}

/** Short, human-quotable id for grouping a send batch. */
export function newBatchId(): string {
  return Crypto.randomUUID().slice(0, 8);
}
