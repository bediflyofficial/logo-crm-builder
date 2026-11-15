import { describe, expect, it } from "vitest";
import { decryptMetaToken, encryptMetaToken, hashMetaState, newMetaState } from "@/lib/meta-crypto.server";

describe("Meta credential protection", () => {
  const key = "test-only-key-".repeat(8);
  it("encrypts credentials with a fresh nonce and round-trips", () => {
    const first = encryptMetaToken("fixture-access-token", key);
    const second = encryptMetaToken("fixture-access-token", key);
    expect(first).not.toBe(second);
    expect(first).not.toContain("fixture-access-token");
    expect(decryptMetaToken(first, key)).toBe("fixture-access-token");
  });
  it("rejects altered ciphertext and the wrong key", () => {
    const stored = encryptMetaToken("fixture-access-token", key);
    const altered = Buffer.from(stored, "base64");
    altered[28] = (altered[28] ?? 0) ^ 1;
    expect(() => decryptMetaToken(altered.toString("base64"), key)).toThrow();
    expect(() => decryptMetaToken(stored, "other-test-key".repeat(8))).toThrow();
  });
  it("rejects short encryption keys", () => expect(() => encryptMetaToken("fixture", "short")).toThrow());
  it("creates unpredictable OAuth states stored only as hashes", () => {
    const first = newMetaState();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(newMetaState());
    expect(hashMetaState(first)).not.toBe(first);
    expect(hashMetaState(first)).toBe(hashMetaState(first));
  });
});