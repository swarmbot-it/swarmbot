import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { Kysely } from "kysely";
import { getAppSecret, type Database } from "../db.js";

/**
 * Symmetric encryption for values stored at rest in Postgres (currently:
 * registry passwords, see store/registries.ts). Derives its key from the
 * same random secret already generated for JWT signing (the `app_secrets`
 * table) so no extra required env var or key-management story is needed.
 */

const PREFIX = "enc:";

async function deriveKey(db: Kysely<Database>): Promise<Buffer> {
	const secret = await getAppSecret(db);
	return scryptSync(secret, "swarmbot-secret-box", 32);
}

/** Encrypts `plain`; returns "" unchanged so optional/empty passwords don't round-trip through crypto. */
export async function encryptAtRest(db: Kysely<Database>, plain: string): Promise<string> {
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
export async function decryptAtRest(db: Kysely<Database>, stored: string | undefined): Promise<string> {
	if (!stored) return "";
	if (!stored.startsWith(PREFIX)) return stored;
	const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
	try {
		const key = await deriveKey(db);
		const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
		decipher.setAuthTag(Buffer.from(tagB64, "base64"));
		const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
		return dec.toString("utf8");
	} catch {
		return "";
	}
}
