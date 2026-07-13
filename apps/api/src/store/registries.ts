import type nano from "nano";
import { randomUUID } from "crypto";
import { findDocs, insertDoc, updateDoc, type CouchDoc } from "../couch.js";

/**
 * CouchDB-backed store for SwarmBoty registry credentials.
 * Each document carries type="registry" and is keyed by display name.
 */

export type StoredRegistry = {
	id: string;
	name: string;
	url: string;
	type: string;
	user: string;
	default: boolean;
};

type RegistryDoc = CouchDoc & {
	type: "registry";
	name: string;
	url: string;
	registryType: string;
	user: string;
	password?: string;
	default: boolean;
};

function toView(doc: RegistryDoc): StoredRegistry {
	return {
		id: String(doc._id),
		name: doc.name,
		url: doc.url,
		type: doc.registryType,
		user: doc.user,
		default: Boolean(doc.default),
	};
}

export async function listRegistries(db: nano.DocumentScope<CouchDoc>): Promise<StoredRegistry[]> {
	const docs = (await findDocs(db, "registry", {})) as RegistryDoc[];
	return docs
		.sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0) || a.name.localeCompare(b.name))
		.map(toView);
}

export async function createRegistry(
	db: nano.DocumentScope<CouchDoc>,
	input: {
		name: string;
		url: string;
		type: string;
		user?: string;
		password?: string;
		default?: boolean;
	}
): Promise<StoredRegistry> {
	if (input.default) {
		const existing = (await findDocs(db, "registry", {})) as RegistryDoc[];
		for (const doc of existing.filter((d) => d.default)) {
			await updateDoc(db, doc, { default: false });
		}
	}
	const doc: RegistryDoc = {
		_id: `registry:${randomUUID()}`,
		type: "registry",
		name: input.name,
		url: input.url,
		registryType: input.type,
		user: input.user ?? "",
		password: input.password ?? "",
		default: Boolean(input.default),
	};
	const inserted = (await insertDoc(db, doc)) as RegistryDoc;
	return toView(inserted);
}

export async function removeRegistry(
	db: nano.DocumentScope<CouchDoc>,
	id: string
): Promise<boolean> {
	try {
		const doc = (await db.get(id)) as RegistryDoc;
		await db.destroy(doc._id!, doc._rev!);
		return true;
	} catch {
		return false;
	}
}

/** Insert built-in registries when the database is empty. Useful for the demo. */
export async function seedDefaultRegistries(db: nano.DocumentScope<CouchDoc>): Promise<void> {
	const existing = await findDocs(db, "registry", {});
	if (existing.length > 0) return;

	const seeds: Array<{
		name: string;
		url: string;
		type: string;
		user: string;
		default: boolean;
	}> = [
		{
			name: "GitHub Container Registry",
			url: "ghcr.io/sw4rmbot",
			type: "GHCR",
			user: "deploy-bot",
			default: true,
		},
		{
			name: "Docker Hub",
			url: "registry-1.docker.io",
			type: "Docker Hub",
			user: "sw4rmbot-ci",
			default: false,
		},
		{
			name: "AWS ECR (us-east-1)",
			url: "1234.dkr.ecr.us-east-1.amazonaws.com",
			type: "ECR",
			user: "ecr-token",
			default: false,
		},
		{
			name: "Internal Harbor",
			url: "harbor.internal.sw4rmbot.io",
			type: "Harbor",
			user: "harbor-svc",
			default: false,
		},
		{
			name: "Quay.io",
			url: "quay.io/sw4rmbot",
			type: "Quay",
			user: "quay-robot",
			default: false,
		},
	];
	for (const s of seeds) {
		await createRegistry(db, s);
	}
}
