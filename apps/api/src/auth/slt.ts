import { randomBytes } from "crypto";
import type nano from "nano";
import { getDoc, insertDoc, type CouchDoc } from "../couch.js";

/** Short-lived tokens for SSE (EventSource cannot set headers), persisted in
 * CouchDB so a token minted by one API replica can be consumed by another. */

const TTL_MS = 10_000;

function docId(slt: string): string {
	return `slt:${slt}`;
}

export async function createSlt(db: nano.DocumentScope<CouchDoc>, username: string): Promise<string> {
	const slt = randomToken();
	await insertDoc(db, { _id: docId(slt), type: "slt", user: username, exp: Date.now() + TTL_MS });
	return slt;
}

export async function consumeSlt(
	db: nano.DocumentScope<CouchDoc>,
	slt: string | undefined
): Promise<string | undefined> {
	if (!slt) return undefined;
	const doc = await getDoc(db, docId(slt));
	if (!doc) return undefined;
	if (doc._id && doc._rev) {
		try {
			await db.destroy(doc._id, doc._rev);
		} catch {
			/* already consumed */
		}
	}
	const exp = typeof doc.exp === "number" ? doc.exp : 0;
	if (exp < Date.now()) return undefined;
	return typeof doc.user === "string" ? doc.user : undefined;
}

function randomToken(): string {
	return randomBytes(24).toString("base64url");
}
