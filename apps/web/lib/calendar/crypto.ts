import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * App-layer encryption for stored calendar OAuth tokens (v1 feature 3).
 *
 * RLS + Supabase at-rest encryption don't protect a long-lived refresh token
 * from anything holding the connection string / service-role key (a leaked env,
 * a future RLS-bypass query). So tokens are AES-256-GCM encrypted here before
 * they ever hit the DB, and decrypted only server-side at point of use. They
 * are never sent to the browser.
 *
 * Wire format: base64(iv).base64(authTag).base64(ciphertext) — '.' is a safe
 * separator (not in the base64 alphabet).
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM recommendation

function key(): Buffer {
  const k = Buffer.from(serverEnv.calendarTokenKey(), "base64");
  if (k.length !== 32) {
    throw new Error("CALENDAR_TOKEN_KEY must decode to 32 bytes (base64).");
  }
  return k;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("malformed encrypted token");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt a value that may be null (e.g. an absent refresh token). */
export function encryptNullable(plaintext: string | null | undefined): string | null {
  return plaintext ? encryptToken(plaintext) : null;
}

/** Decrypt a value that may be null. */
export function decryptNullable(payload: string | null | undefined): string | null {
  return payload ? decryptToken(payload) : null;
}
