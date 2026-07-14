import type { Kysely } from "kysely";
import type { Database } from "../db.js";

/** Revoked login JWT JTIs with a 25-hour TTL, persisted in Postgres so
 * revocations survive API restarts and are shared across replicas. */

const TTL_MS = 25 * 60 * 60 * 1000;

export async function revokeJti(db: Kysely<Database>, jti: string | undefined): Promise<void> {
	if (!jti) return;
	await db
		.insertInto("revokedJti")
		.values({ jti, expiresAt: new Date(Date.now() + TTL_MS).toISOString() })
		.onConflict((oc) => oc.column("jti").doNothing())
		.execute();
}

export async function isRevoked(db: Kysely<Database>, jti: string | undefined): Promise<boolean> {
	if (!jti) return false;
	const row = await db.selectFrom("revokedJti").select("expiresAt").where("jti", "=", jti).executeTakeFirst();
	if (!row) return false;
	if (new Date(row.expiresAt).getTime() <= Date.now()) {
		await db.deleteFrom("revokedJti").where("jti", "=", jti).execute();
		return false;
	}
	return true;
}
