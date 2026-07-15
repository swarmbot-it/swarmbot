import { randomBytes } from "crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db.js";

/** Short-lived tokens for SSE (EventSource cannot set headers), persisted in
 * Postgres so a token minted by one API replica can be consumed by another. */

const TTL_MS = 10_000;

export async function createSlt(db: Kysely<Database>, username: string): Promise<string> {
	const token = randomToken();
	await db
		.insertInto("slt")
		.values({ token, username, expiresAt: new Date(Date.now() + TTL_MS).toISOString() })
		.execute();
	return token;
}

export async function consumeSlt(
	db: Kysely<Database>,
	token: string | undefined
): Promise<string | undefined> {
	if (!token) return undefined;
	const row = await db.selectFrom("slt").selectAll().where("token", "=", token).executeTakeFirst();
	if (!row) return undefined;
	await db.deleteFrom("slt").where("token", "=", token).execute();
	if (new Date(row.expiresAt).getTime() < Date.now()) return undefined;
	return row.username;
}

function randomToken(): string {
	return randomBytes(24).toString("base64url");
}
