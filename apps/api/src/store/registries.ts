import type { Kysely } from "kysely";
import { randomUUID } from "crypto";
import type { Database } from "../db.js";
import { encryptAtRest } from "../crypto/secret-box.js";

/** Postgres-backed store for swarmbot.it registry credentials (`registries` table). */

export type StoredRegistry = {
	id: string;
	name: string;
	url: string;
	type: string;
	user: string;
	default: boolean;
};

const REGISTRY_COLUMNS = ["id", "name", "url", "registryType", "registryUser", "isDefault"] as const;

function toView(row: {
	id: string;
	name: string;
	url: string;
	registryType: string;
	registryUser: string | null;
	isDefault: boolean;
}): StoredRegistry {
	return {
		id: row.id,
		name: row.name,
		url: row.url,
		type: row.registryType,
		user: row.registryUser ?? "",
		default: Boolean(row.isDefault),
	};
}

export type RawRegistry = {
	url: string;
	registryUser: string | null;
	password: string | null;
};

/** Raw lookup (undecrypted password) used by createService to build a Docker registry authconfig. */
export async function getRegistryByName(
	db: Kysely<Database>,
	name: string
): Promise<RawRegistry | undefined> {
	return db
		.selectFrom("registries")
		.select(["url", "registryUser", "password"])
		.where("name", "=", name)
		.executeTakeFirst();
}

export async function listRegistries(db: Kysely<Database>): Promise<StoredRegistry[]> {
	const rows = await db
		.selectFrom("registries")
		.select(REGISTRY_COLUMNS)
		.orderBy("isDefault", "desc")
		.orderBy("name", "asc")
		.execute();
	return rows.map(toView);
}

export async function createRegistry(
	db: Kysely<Database>,
	input: {
		name: string;
		url: string;
		type: string;
		user?: string;
		password?: string;
		default?: boolean;
	}
): Promise<StoredRegistry> {
	const password = await encryptAtRest(db, input.password ?? "");
	return db.transaction().execute(async (trx) => {
		if (input.default) {
			await trx.updateTable("registries").set({ isDefault: false }).where("isDefault", "=", true).execute();
		}
		const row = await trx
			.insertInto("registries")
			.values({
				id: randomUUID(),
				name: input.name,
				url: input.url,
				registryType: input.type,
				registryUser: input.user ?? "",
				password,
				isDefault: Boolean(input.default),
			})
			.returning(REGISTRY_COLUMNS)
			.executeTakeFirstOrThrow();
		return toView(row);
	});
}

export async function removeRegistry(db: Kysely<Database>, id: string): Promise<boolean> {
	const result = await db.deleteFrom("registries").where("id", "=", id).executeTakeFirst();
	return result.numDeletedRows > 0n;
}

/** Marks the given registry as default and clears the flag on every other registry, atomically. */
export async function setDefaultRegistry(db: Kysely<Database>, id: string): Promise<StoredRegistry> {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("registries")
			.set({ isDefault: false })
			.where("isDefault", "=", true)
			.where("id", "!=", id)
			.execute();
		const row = await trx
			.updateTable("registries")
			.set({ isDefault: true })
			.where("id", "=", id)
			.returning(REGISTRY_COLUMNS)
			.executeTakeFirst();
		if (!row) throw new Error("registry_not_found");
		return toView(row);
	});
}

/** Insert built-in registries when the database is empty. Useful for the demo. */
export async function seedDefaultRegistries(db: Kysely<Database>): Promise<void> {
	const existing = await db.selectFrom("registries").select("id").execute();
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
			url: "ghcr.io/swarmbot",
			type: "GHCR",
			user: "deploy-bot",
			default: true,
		},
		{
			name: "Docker Hub",
			url: "registry-1.docker.io",
			type: "Docker Hub",
			user: "swarmbot-ci",
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
			url: "harbor.internal.swarmbot.io",
			type: "Harbor",
			user: "harbor-svc",
			default: false,
		},
		{
			name: "Quay.io",
			url: "quay.io/swarmbot",
			type: "Quay",
			user: "quay-robot",
			default: false,
		},
	];
	for (const s of seeds) {
		await createRegistry(db, s);
	}
}
