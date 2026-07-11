import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Field-level encryption for SSNs and other high-sensitivity ApplicationProfile
// values. AES-256-GCM, random 12-byte IV per value; encoded as
// `${iv}:${authTag}:${ciphertext}` base64.
//
// Duplicated verbatim from src/lib/apply/crypto.ts in the main Next.js app —
// this worker is a separately deployed DO App Platform component (see
// ../../.do/app.yaml) and can't import from the app's src/ tree, so this
// ~30-line module is kept identical in both places rather than pulled into
// a shared package for one function. APPLY_ENCRYPTION_KEY must be the same
// value in both services' env vars, or ciphertext written by one is
// undecryptable by the other.

function deriveKey(): Buffer {
  const secret = process.env.APPLY_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "APPLY_ENCRYPTION_KEY is not set — required to decrypt sensitive application fields (SSNs, account numbers).",
    );
  }
  return scryptSync(secret, "benefy-apply-encryption", 32);
}

export function encryptSensitive(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSensitive(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted value");
  }
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
