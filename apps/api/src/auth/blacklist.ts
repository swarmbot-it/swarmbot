import type nano from "nano";
import { getDoc, insertDoc, type CouchDoc } from "../couch.js";

/** Revoked login JWT JTIs with a 25-hour TTL, persisted in CouchDB so
 * revocations survive API restarts and are shared across replicas. */

const TTL_MS = 25 * 60 * 60 * 1000;

function docId(jti: string): string {
	return `revoked-jti:${jti}`;
}

export async function revokeJti(
	db: nano.DocumentScope<CouchDoc>,
	jti: string | undefined
): Promise<void> {
	if (!jti) return;
	try {
		await insertDoc(db, { _id: docId(jti), type: "revoked-jti", exp: Date.now() + TTL_MS });
	} catch {
		/* already revoked */
	}
}

export async function isRevoked(
	db: nano.DocumentScope<CouchDoc>,
	jti: string | undefined
): Promise<boolean> {
	if (!jti) return false;
	const doc = await getDoc(db, docId(jti));
	if (!doc) return false;
	const exp = typeof doc.exp === "number" ? doc.exp : 0;
	if (exp <= Date.now()) {
		if (doc._id && doc._rev) {
			try {
				await db.destroy(doc._id, doc._rev);
			} catch {
				/* already gone */
			}
		}
		return false;
	}
	return true;
}
