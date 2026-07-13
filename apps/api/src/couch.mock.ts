import type nano from "nano";
import { randomUUID } from "crypto";
import type { CouchDoc } from "./couch.js";

type Store = Map<string, CouchDoc>;

function nextRev(doc: CouchDoc): string {
	const prev = typeof doc._rev === "string" ? doc._rev : "0-init";
	const m = /^(\d+)-/.exec(prev);
	const n = m ? Number(m[1]) + 1 : 1;
	return `${n}-${randomUUID().replace(/-/g, "")}`;
}

function matchesSelector(doc: CouchDoc, selector: Record<string, unknown>): boolean {
	for (const [k, v] of Object.entries(selector)) {
		const expected =
			v && typeof v === "object" && "$eq" in (v as Record<string, unknown>)
				? (v as { $eq: unknown }).$eq
				: v;
		if ((doc as Record<string, unknown>)[k] !== expected) return false;
	}
	return true;
}

function makeDocScope(store: Store): nano.DocumentScope<CouchDoc> {
	const scope = {
		async insert(doc: CouchDoc) {
			const id = doc._id ?? randomUUID();
			const rev = nextRev(doc);
			const stored = { ...doc, _id: id, _rev: rev };
			store.set(id, stored);
			return { id, rev, ok: true };
		},
		async get(id: string) {
			const d = store.get(id);
			if (!d) throw new Error("not_found");
			return d;
		},
		async destroy(id: string, _rev: string) {
			store.delete(id);
			return { id, rev: _rev, ok: true };
		},
		async find(query: { selector: Record<string, unknown> }) {
			const docs = [...store.values()].filter((d) => matchesSelector(d, query.selector));
			return { docs };
		},
		async list() {
			const rows = [...store.values()].map((d) => ({
				id: d._id,
				key: d._id,
				value: { rev: d._rev },
			}));
			return { rows, total_rows: rows.length, offset: 0 };
		},
	};
	return scope as unknown as nano.DocumentScope<CouchDoc>;
}

export function createMockCouch(): {
	server: nano.ServerScope;
	db: nano.DocumentScope<CouchDoc>;
} {
	const store: Store = new Map();
	const db = makeDocScope(store);
	const server = {
		async request() {
			return { couchdb: "Welcome", version: "mock" };
		},
		db: {
			async get(_name: string) {
				return { db_name: "swarmbot" };
			},
			async create(_name: string) {
				return { ok: true };
			},
		},
		use<T>(_name: string) {
			return db as unknown as nano.DocumentScope<T>;
		},
	};
	return { server: server as unknown as nano.ServerScope, db };
}
