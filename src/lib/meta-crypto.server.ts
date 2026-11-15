import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function hashMetaState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function newMetaState() {
  return randomBytes(32).toString("hex");
}

function encryptionKey(secret: string) {
  if (secret.length < 64) throw new Error("Meta credential encryption is not configured securely.");
  return createHash("sha256").update(secret).digest();
}

export function encryptMetaToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptMetaToken(stored: string, secret: string) {
  const value = Buffer.from(stored, "base64");
  if (value.length < 29) throw new Error("Invalid encrypted Meta credential.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
}