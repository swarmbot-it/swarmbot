/**
 * Minimal in-memory fixed-window rate limiter — no new dependency needed
 * for a single-process dev/small-deployment API. Not shared across
 * replicas (same caveat as the JWT blacklist in auth/blacklist.ts).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 10;

/**
 * @param key Identifies the bucket (e.g. IP or username) being rate-limited.
 * @param max Maximum attempts allowed within `windowMs`.
 * @param windowMs Fixed window size in milliseconds.
 * @returns True if another attempt under `key` is allowed within the current window.
 */
export function allowAttempt(
	key: string,
	max = DEFAULT_MAX_ATTEMPTS,
	windowMs = DEFAULT_WINDOW_MS
): boolean {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (bucket.count >= max) return false;
	bucket.count += 1;
	return true;
}
