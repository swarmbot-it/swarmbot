import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type nano from "nano";
import { getSecret, type CouchDoc } from "../couch.js";

/**
 * Symmetric encryption for values stored at rest in CouchDB (currently:
 * registry passwords, see store/registries.ts). Derives its key from the
 * same random secret already generated for JWT signing (couch.ts `secret`
 * doc) so no extra required env var or key-management story is needed.
 */

const PREFIX = "enc:";

async function deriveKey(db: nano.DocumentScope<CouchDoc>): Promise<Buffer> {
	const doc = await getSecret(db);
	const secret = String(doc?.secret ?? "");
	if (!secret) throw new Error("no signing secret found — cannot derive encryption key");
	return scryptSync(secret, "swarmboty-secret-box", 32);
}

/** Encrypts `plain`; returns "" unchanged so optional/empty passwords don't round-trip through crypto. */
export async function encryptAtRest(
	db: nano.DocumentScope<CouchDoc>,
	plain: string
): Promise<string> {
	if (!plain) return "";
	const key = await deriveKey(db);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * Decrypts a value produced by {@link encryptAtRest}. Values written before
 * this feature existed are plain text (no `enc:` prefix) — returned as-is
 * for backward compatibility rather than treated as corrupt.
 */
export async function decryptAtRest(
	db: nano.DocumentScope<CouchDoc>,
	stored: string | undefined
): Promise<string> {
	if (!stored) return "";
	if (!stored.startsWith(PREFIX)) return stored;
	const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
	try {
		const key = await deriveKey(db);
		const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
		decipher.setAuthTag(Buffer.from(tagB64, "base64"));
		const dec = Buffer.concat([
			decipher.update(Buffer.from(dataB64, "base64")),
			decipher.final(),
		]);
		return dec.toString("utf8");
	} catch {
		return "";
	}
}
