import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Field-level encryption for SSNs and other high-sensitivity values stored
// in ApplicationProfile (see src/lib/types.ts). AES-256-GCM with a random
// 12-byte IV per value; output is `${iv}:${authTag}:${ciphertext}` base64.
// Duplicated verbatim in worker/src/lib/crypto.ts — the worker is a
// separately deployed process (see worker/README.md) and can't import from
// this Next.js app's src/ tree, so this ~30-line module is kept identical
// in both places rather than pulled into a shared package for one function.

function deriveKey(): Buffer {
  const secret = process.env.APPLY_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "APPLY_ENCRYPTION_KEY is not set — required to encrypt/decrypt sensitive application fields (SSNs, account numbers).",
    );
  }
  // scrypt over the raw secret rather than requiring the operator to
  // generate/paste a hex-exact 32-byte key — any sufficiently long random
  // string works as APPLY_ENCRYPTION_KEY.
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

// For display in the app (e.g. "SSN on file: ...1234") without ever
// decrypting or transmitting the full value to the browser.
export function last4(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  return digits.slice(-4);
}
