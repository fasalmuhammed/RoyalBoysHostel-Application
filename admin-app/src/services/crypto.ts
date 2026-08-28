import CryptoJS from "crypto-js";
import * as Crypto from "expo-crypto";

/**
 * Backup encryption primitives.
 *
 * Construction: PBKDF2-SHA256 -> AES-256-CBC -> HMAC-SHA256 over the
 * ciphertext (encrypt-then-MAC). The MAC is verified in full *before* any
 * chunk is decrypted, so a corrupted or tampered file is rejected rather than
 * partially imported.
 *
 * Why AES-CBC rather than GCM: the only pure-JS crypto that runs without a
 * custom native build is CryptoJS, which has no authenticated mode. CBC plus a
 * separate HMAC over the ciphertext is the standard, safe way to build the same
 * guarantee, provided the MAC key is independent of the encryption key -- which
 * is why the KDF derives 64 bytes and splits them.
 */

/**
 * PBKDF2 rounds. CryptoJS runs the KDF on the JS thread, so this is a direct
 * trade of unlock time against brute-force cost; 30k lands near a second on a
 * mid-range Android. It is recorded in each file's header, so raising it later
 * will not break backups written today.
 */
export const KDF_ITERATIONS = 30_000;

/** Plaintext bytes buffered before a chunk is sealed and flushed to disk. */
export const CHUNK_SIZE = 256 * 1024;

const IV_BYTES = 16;
const SALT_BYTES = 16;

type WordArray = CryptoJS.lib.WordArray;

export interface BackupKeys {
  encKey: WordArray;
  macKey: WordArray;
}

// --- encoding helpers -------------------------------------------------------

export function wordArrayToBytes(wordArray: WordArray): Uint8Array {
  const { words, sigBytes } = wordArray;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i += 1) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

export function bytesToWordArray(bytes: Uint8Array): WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

/** UTF-8 encode via CryptoJS so multi-byte names survive the round trip. */
export function textToBytes(text: string): Uint8Array {
  return wordArrayToBytes(CryptoJS.enc.Utf8.parse(text));
}

export function bytesToText(bytes: Uint8Array): string {
  return CryptoJS.enc.Utf8.stringify(bytesToWordArray(bytes));
}

function randomWordArray(byteLength: number): WordArray {
  return bytesToWordArray(Crypto.getRandomBytes(byteLength));
}

export function newSaltBase64(): string {
  return CryptoJS.enc.Base64.stringify(randomWordArray(SALT_BYTES));
}

// --- key derivation ---------------------------------------------------------

/**
 * Stretches the passphrase into independent encryption and MAC keys.
 *
 * Runs on the JS thread and blocks for roughly a second; callers should show a
 * progress state around it.
 */
export function deriveKeys(passphrase: string, saltBase64: string, iterations: number): BackupKeys {
  const salt = CryptoJS.enc.Base64.parse(saltBase64);
  const derived = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: 512 / 32, // 64 bytes: 32 for AES, 32 for HMAC
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });

  const words = derived.words;
  return {
    encKey: CryptoJS.lib.WordArray.create(words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(words.slice(8, 16), 32),
  };
}

// --- chunk sealing ----------------------------------------------------------

/**
 * Encrypts one chunk under a fresh random IV and returns `base64(iv || ct)`.
 * A per-chunk IV is required: reusing one across chunks would leak whether two
 * chunks share a prefix.
 */
export function sealChunk(plaintext: string, encKey: WordArray): string {
  const iv = randomWordArray(IV_BYTES);
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plaintext), encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const combined = iv.clone().concat(encrypted.ciphertext);
  return CryptoJS.enc.Base64.stringify(combined);
}

export function openChunk(sealedBase64: string, encKey: WordArray): string {
  const combined = CryptoJS.enc.Base64.parse(sealedBase64);
  const words = combined.words;

  const iv = CryptoJS.lib.WordArray.create(words.slice(0, IV_BYTES / 4), IV_BYTES);
  const ciphertext = CryptoJS.lib.WordArray.create(
    words.slice(IV_BYTES / 4),
    combined.sigBytes - IV_BYTES
  );

  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext }),
    encKey,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  );

  return CryptoJS.enc.Utf8.stringify(decrypted);
}

// --- authentication ---------------------------------------------------------

/**
 * Incremental HMAC so the tag can be computed while streaming, without ever
 * holding the whole ciphertext in memory.
 */
export function createMac(macKey: WordArray) {
  const hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, macKey);
  return {
    update(text: string) {
      hmac.update(text);
    },
    finalize(): string {
      return hmac.finalize().toString(CryptoJS.enc.Hex);
    },
  };
}

/** Length-independent comparison, to avoid leaking the tag byte by byte. */
export function macMatches(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

// --- passphrase hashing (for the app PIN) -----------------------------------

/** Salted PBKDF2 hash of a PIN, stored in SecureStore. */
export function hashPin(pin: string, saltBase64: string): string {
  const salt = CryptoJS.enc.Base64.parse(saltBase64);
  return CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations: 20_000,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Hex);
}
