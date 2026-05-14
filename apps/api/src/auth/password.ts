import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const PBKDF2_ITER = 200000;
const PBKDF2_KEYLEN = 64;

/** Verify Swarmpit-style passwords: legacy SHA-256 hex, or pbkdf2+sha512$iter$b64salt$b64hash */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  const shaHex = createHash("sha256").update(plain, "utf8").digest("hex");
  if (stored === shaHex) return true;

  const m = /^pbkdf2\+sha512\$(\d+)\$([0-9A-Za-z+/=]+)\$([0-9A-Za-z+/=]+)$/.exec(
    stored
  );
  if (m) {
    const iterations = Number(m[1]);
    const salt = Buffer.from(m[2], "base64");
    const expected = Buffer.from(m[3], "base64");
    const derived = pbkdf2Sync(plain, salt, iterations, expected.length, "sha512");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  // Buddy-hashers 1.x style: algorithm may be split differently — try generic pbkdf2 segments
  const parts = stored.split("$");
  const algIdx = parts.findIndex((p) => p.includes("pbkdf2") && p.includes("sha512"));
  if (algIdx >= 0 && parts.length >= algIdx + 4) {
    const iter = Number(parts[algIdx + 1]);
    const salt = Buffer.from(parts[algIdx + 2], "base64");
    const expected = Buffer.from(parts[algIdx + 3], "base64");
    if (!Number.isFinite(iter) || iter <= 0) return false;
    const derived = pbkdf2Sync(plain, salt, iter, expected.length, "sha512");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  return false;
}

export function derivePassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(plain, salt, PBKDF2_ITER, PBKDF2_KEYLEN, "sha512");
  return `pbkdf2+sha512$${PBKDF2_ITER}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Legacy: stored value equals hex sha256 of password (Swarmpit upgrade path). */
export function isLegacySha256(plain: string, stored: string): boolean {
  return stored === createHash("sha256").update(plain, "utf8").digest("hex");
}
