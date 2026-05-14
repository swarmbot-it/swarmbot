/** Revoked login JWT JTIs — TTL ~25h like Swarmpit. */

const TTL_MS = 25 * 60 * 60 * 1000;
const store = new Map<string, number>();

export function revokeJti(jti: string | undefined): void {
  if (!jti) return;
  store.set(jti, Date.now() + TTL_MS);
}

export function isRevoked(jti: string | undefined): boolean {
  if (!jti) return false;
  prune();
  const exp = store.get(jti);
  return exp !== undefined && exp > Date.now();
}

function prune(): void {
  const now = Date.now();
  for (const [k, exp] of store) {
    if (exp <= now) store.delete(k);
  }
}
