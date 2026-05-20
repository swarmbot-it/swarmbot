import type nano from "nano";
import { randomUUID } from "crypto";
import { derivePassword } from "../auth/password.js";
import { findDocs, findOne, insertDoc, type CouchDoc } from "../couch.js";

/**
 * Application user store. Distinct from the legacy "user" CouchDB type
 * already used by auth bootstrapping — these documents carry richer
 * profile fields needed by the admin UI (display name, phone, last login).
 *
 * The login flow (server.ts/login mutation) still queries CouchDB by
 * username so this store extends the same documents.
 */

export type StoredUser = {
	id: string;
	username: string;
	name: string;
	email: string;
	phone: string | null;
	role: string;
	created: string;
	lastLogin: string | null;
};

type UserDoc = CouchDoc & {
	type: "user";
	username: string;
	name?: string;
	email?: string;
	phone?: string;
	role?: string;
	password: string;
	createdAt?: string;
	lastLoginAt?: string;
};

function toView(doc: UserDoc): StoredUser {
	return {
		id: String(doc._id),
		username: doc.username,
		name: doc.name ?? doc.username,
		email: doc.email ?? "",
		phone: doc.phone && doc.phone.length ? doc.phone : null,
		role: doc.role ?? "user",
		created: doc.createdAt ?? new Date().toISOString(),
		lastLogin: doc.lastLoginAt ?? null,
	};
}

export async function listUsers(db: nano.DocumentScope<CouchDoc>): Promise<StoredUser[]> {
	const docs = (await findDocs(db, "user", {})) as UserDoc[];
	return docs.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")).map(toView);
}

export async function createUser(
	db: nano.DocumentScope<CouchDoc>,
	input: {
		username: string;
		password: string;
		name?: string;
		email: string;
		phone?: string;
		role: string;
	}
): Promise<StoredUser> {
	const dup = await findOne(db, "user", { username: { $eq: input.username } });
	if (dup) {
		throw new Error("username_taken");
	}
	const doc: UserDoc = {
		_id: `user:${randomUUID()}`,
		type: "user",
		username: input.username,
		name: input.name ?? input.username,
		email: input.email,
		phone: input.phone ?? "",
		role: input.role,
		password: derivePassword(input.password),
		createdAt: new Date().toISOString(),
	};
	const inserted = (await insertDoc(db, doc)) as UserDoc;
	return toView(inserted);
}

export async function removeUser(db: nano.DocumentScope<CouchDoc>, id: string): Promise<boolean> {
	try {
		const doc = (await db.get(id)) as UserDoc;
		await db.destroy(doc._id!, doc._rev!);
		return true;
	} catch {
		return false;
	}
}

/**
 * Add a handful of demo users when running in mock mode so the Users
 * page is not blank. The bootstrap admin still gets created separately.
 */
export async function seedDemoUsers(db: nano.DocumentScope<CouchDoc>): Promise<void> {
	const existing = (await findDocs(db, "user", {})) as UserDoc[];
	if (existing.length > 2) return;

	const seeds: Array<{
		username: string;
		name: string;
		email: string;
		phone: string | null;
		role: string;
	}> = [
		{
			username: "m.kowalski",
			name: "Marcin Kowalski",
			email: "m.kowalski@swarmboty.io",
			phone: "+48 602 345 678",
			role: "Editor",
		},
		{
			username: "j.wisniewska",
			name: "Julia Wiśniewska",
			email: "j.wisniewska@swarmboty.io",
			phone: "+48 603 456 789",
			role: "Editor",
		},
		{
			username: "t.lewandowski",
			name: "Tomasz Lewandowski",
			email: "t.lewandowski@swarmboty.io",
			phone: "+48 604 567 890",
			role: "Read-only",
		},
		{
			username: "k.wojcik",
			name: "Karolina Wójcik",
			email: "k.wojcik@swarmboty.io",
			phone: "+48 605 678 901",
			role: "Administrator",
		},
		{
			username: "p.kaminski",
			name: "Piotr Kamiński",
			email: "p.kaminski@swarmboty.io",
			phone: "+48 606 789 012",
			role: "Editor",
		},
		{
			username: "m.zielinska",
			name: "Magdalena Zielińska",
			email: "m.zielinska@swarmboty.io",
			phone: null,
			role: "Read-only",
		},
	];
	for (const s of seeds) {
		const dup = existing.find((u) => u.username === s.username);
		if (dup) continue;
		await insertDoc(db, {
			_id: `user:${randomUUID()}`,
			type: "user",
			username: s.username,
			name: s.name,
			email: s.email,
			phone: s.phone ?? "",
			role: s.role,
			password: derivePassword("demo-password"),
			createdAt: new Date(Date.now() - Math.random() * 1e10).toISOString(),
			lastLoginAt:
				Math.random() > 0.2
					? new Date(Date.now() - Math.random() * 1e9).toISOString()
					: undefined,
		});
	}
}
