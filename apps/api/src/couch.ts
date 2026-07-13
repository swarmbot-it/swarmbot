import nano from "nano";
import type { Sw4rmBotConfig } from "./config.js";
import { createMockCouch } from "./couch.mock.js";

export type CouchDoc = {
	_id?: string;
	_rev?: string;
	type?: string;
	[k: string]: unknown;
};

const DB = "sw4rmbot";

export function createCouch(cfg: Sw4rmBotConfig): nano.ServerScope {
	if (cfg.mock) {
		return createMockCouch().server;
	}
	return nano(cfg.dbUrl);
}

export async function couchVersion(server: nano.ServerScope): Promise<unknown> {
	return server.request({});
}

export async function databaseExists(server: nano.ServerScope): Promise<boolean> {
	try {
		await server.db.get(DB);
		return true;
	} catch {
		return false;
	}
}

export async function createDatabase(server: nano.ServerScope): Promise<void> {
	await server.db.create(DB);
}

export function db(server: nano.ServerScope): nano.DocumentScope<CouchDoc> {
	return server.use<CouchDoc>(DB);
}

export async function getDoc(
	d: nano.DocumentScope<CouchDoc>,
	id: string
): Promise<CouchDoc | undefined> {
	try {
		return await d.get(id);
	} catch {
		return undefined;
	}
}

export async function findDocs(
	d: nano.DocumentScope<CouchDoc>,
	type: string,
	selector: Record<string, unknown> = {}
): Promise<CouchDoc[]> {
	const res = await d.find({
		selector: { ...selector, type: { $eq: type } },
	});
	return res.docs;
}

export async function findOne(
	d: nano.DocumentScope<CouchDoc>,
	type: string,
	selector: Record<string, unknown>
): Promise<CouchDoc | undefined> {
	const docs = await findDocs(d, type, selector);
	return docs[0];
}

export async function insertDoc(d: nano.DocumentScope<CouchDoc>, doc: CouchDoc): Promise<CouchDoc> {
	const res = await d.insert(doc);
	return { ...doc, _id: res.id, _rev: res.rev };
}

export async function updateDoc(
	d: nano.DocumentScope<CouchDoc>,
	doc: CouchDoc,
	patch: Partial<CouchDoc>
): Promise<void> {
	const merged = { ...doc, ...patch, _id: doc._id, _rev: doc._rev };
	await d.insert(merged);
}

export async function migrationsDone(d: nano.DocumentScope<CouchDoc>): Promise<Set<string>> {
	const docs = await findDocs(d, "migration", {});
	return new Set(docs.map((x) => String(x.name)));
}

export async function recordMigration(
	d: nano.DocumentScope<CouchDoc>,
	name: string,
	result: unknown
): Promise<void> {
	await insertDoc(d, { type: "migration", name, result });
}

export async function getSecret(d: nano.DocumentScope<CouchDoc>): Promise<CouchDoc | undefined> {
	return findOne(d, "secret", {});
}

export async function createSecret(d: nano.DocumentScope<CouchDoc>, secret: string): Promise<void> {
	await insertDoc(d, { type: "secret", secret });
}

export async function userByUsername(
	d: nano.DocumentScope<CouchDoc>,
	username: string
): Promise<CouchDoc | undefined> {
	return findOne(d, "user", { username: { $eq: username } });
}

export async function users(d: nano.DocumentScope<CouchDoc>): Promise<CouchDoc[]> {
	return findDocs(d, "user", {});
}

export async function snsUsers(server: nano.ServerScope): Promise<void> {
	try {
		await server.db.create("_users");
	} catch {
		/* exists */
	}
}

export async function snsReplicator(server: nano.ServerScope): Promise<void> {
	try {
		await server.db.create("_replicator");
	} catch {
		/* exists */
	}
}

export async function snsGlobalChanges(server: nano.ServerScope): Promise<void> {
	try {
		await server.db.create("_global_changes");
	} catch {
		/* exists */
	}
}
