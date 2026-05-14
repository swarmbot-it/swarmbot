import { randomBytes } from "crypto";

/** Short-lived tokens for SSE (EventSource cannot set headers). */

const TTL_MS = 10_000;
const cache = new Map<string, { user: string; exp: number }>();

export function createSlt(username: string): string {
  const slt = randomToken();
  cache.set(slt, { user: username, exp: Date.now() + TTL_MS });
  prune();
  return slt;
}

export function consumeSlt(slt: string | undefined): string | undefined {
  if (!slt) return undefined;
  prune();
  const e = cache.get(slt);
  if (!e || e.exp < Date.now()) return undefined;
  cache.delete(slt);
  return e.user;
}

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.exp < now) cache.delete(k);
  }
}
