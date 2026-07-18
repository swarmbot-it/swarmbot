import type { Kysely } from "kysely";
import { randomUUID } from "crypto";
import type { Database } from "../db.js";
import { derivePassword, verifyPassword } from "../auth/password.js";

/**
 * Application user store, backed by the `users` Postgres table. Covers both
 * the admin-facing profile view (StoredUser, no password) and the
 * auth-facing lookups login/optional-jwt/API-token mutations need (AuthUser,
 * includes password + role + the current API token jti).
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
	apiTokenMask: string | null;
	apiTokenExpiresAt: string | null;
};

export type AuthUser = {
	id: string;
	username: string;
	email: string | null;
	role: string | null;
	password: string;
	apiTokenJti: string | null;
};

export type ApiToken = { jti: string; mask: string; expiresAt?: string };

function toIso(v: Date | string | null | undefined): string | null {
	if (!v) return null;
	return v instanceof Date ? v.toISOString() : v;
}

const USER_COLUMNS = [
	"id",
	"username",
	"name",
	"email",
	"phone",
	"role",
	"createdAt",
	"lastLoginAt",
	"apiTokenMask",
	"apiTokenExpiresAt",
] as const;

function toView(row: {
	id: string;
	username: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	role: string | null;
	createdAt: Date | string;
	lastLoginAt: Date | string | null;
	apiTokenMask: string | null;
	apiTokenExpiresAt: Date | string | null;
}): StoredUser {
	return {
		id: row.id,
		username: row.username,
		name: row.name ?? row.username,
		email: row.email ?? "",
		phone: row.phone && row.phone.length ? row.phone : null,
		role: row.role ?? "user",
		created: toIso(row.createdAt) ?? new Date().toISOString(),
		lastLogin: toIso(row.lastLoginAt),
		apiTokenMask: row.apiTokenMask,
		apiTokenExpiresAt: toIso(row.apiTokenExpiresAt),
	};
}

export async function listUsers(db: Kysely<Database>): Promise<StoredUser[]> {
	const rows = await db.selectFrom("users").select(USER_COLUMNS).orderBy("createdAt", "asc").execute();
	return rows.map(toView);
}

export async function createUser(
	db: Kysely<Database>,
	input: {
		username: string;
		password: string;
		name?: string;
		email: string;
		phone?: string;
		role: string;
	}
): Promise<StoredUser> {
	const dup = await db
		.selectFrom("users")
		.select("id")
		.where("username", "=", input.username)
		.executeTakeFirst();
	if (dup) {
		throw new Error("username_taken");
	}
	const row = await db
		.insertInto("users")
		.values({
			id: randomUUID(),
			username: input.username,
			name: input.name ?? input.username,
			email: input.email,
			phone: input.phone ?? "",
			role: input.role,
			password: derivePassword(input.password),
			createdAt: new Date().toISOString(),
		})
		.returning(USER_COLUMNS)
		.executeTakeFirstOrThrow();
	return toView(row);
}

export async function getUserByUsername(
	db: Kysely<Database>,
	username: string
): Promise<StoredUser | null> {
	const row = await db
		.selectFrom("users")
		.select(USER_COLUMNS)
		.where("username", "=", username)
		.executeTakeFirst();
	return row ? toView(row) : null;
}

/** Auth-facing lookup: includes the password hash and current API token jti, used by login/optional-jwt/API-token mutations. */
export async function findAuthUser(
	db: Kysely<Database>,
	username: string
): Promise<AuthUser | null> {
	const row = await db
		.selectFrom("users")
		.select(["id", "username", "email", "role", "password", "apiTokenJti"])
		.where("username", "=", username)
		.executeTakeFirst();
	return row ?? null;
}

export async function touchLastLogin(db: Kysely<Database>, username: string): Promise<void> {
	await db
		.updateTable("users")
		.set({ lastLoginAt: new Date().toISOString() })
		.where("username", "=", username)
		.execute();
}

/** Auto-upgrades a legacy SHA-256 password hash to pbkdf2 on successful login. */
export async function upgradePasswordHash(
	db: Kysely<Database>,
	username: string,
	newHash: string
): Promise<void> {
	await db.updateTable("users").set({ password: newHash }).where("username", "=", username).execute();
}

export async function setApiToken(
	db: Kysely<Database>,
	username: string,
	token: ApiToken | null
): Promise<void> {
	await db
		.updateTable("users")
		.set({
			apiTokenJti: token?.jti ?? null,
			apiTokenMask: token?.mask ?? null,
			apiTokenExpiresAt: token?.expiresAt ?? null,
		})
		.where("username", "=", username)
		.execute();
}

export async function updateUserProfile(
	db: Kysely<Database>,
	username: string,
	input: { name: string; email: string; phone?: string | null }
): Promise<StoredUser> {
	const row = await db
		.updateTable("users")
		.set({ name: input.name, email: input.email, phone: input.phone ?? "" })
		.where("username", "=", username)
		.returning(USER_COLUMNS)
		.executeTakeFirst();
	if (!row) throw new Error("user_not_found");
	return toView(row);
}

export async function changeUserPassword(
	db: Kysely<Database>,
	username: string,
	current: string,
	next: string
): Promise<boolean> {
	const row = await db
		.selectFrom("users")
		.select(["password"])
		.where("username", "=", username)
		.executeTakeFirst();
	if (!row) throw new Error("user_not_found");
	if (!verifyPassword(current, row.password)) {
		throw new Error("invalid_credentials");
	}
	await db
		.updateTable("users")
		.set({ password: derivePassword(next) })
		.where("username", "=", username)
		.execute();
	return true;
}

export async function removeUser(db: Kysely<Database>, id: string): Promise<boolean> {
	const result = await db.deleteFrom("users").where("id", "=", id).executeTakeFirst();
	return result.numDeletedRows > 0n;
}

/**
 * Add a handful of demo users when running in mock mode so the Users
 * page is not blank. The bootstrap admin still gets created separately.
 */
export async function seedDemoUsers(db: Kysely<Database>): Promise<void> {
	const existing = await db.selectFrom("users").select("username").execute();
	if (existing.length > 2) return;
	const existingNames = new Set(existing.map((u) => u.username));

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
			email: "m.kowalski@swarmbot.io",
			phone: "+48 602 345 678",
			role: "Editor",
		},
		{
			username: "j.wisniewska",
			name: "Julia Wiśniewska",
			email: "j.wisniewska@swarmbot.io",
			phone: "+48 603 456 789",
			role: "Editor",
		},
		{
			username: "t.lewandowski",
			name: "Tomasz Lewandowski",
			email: "t.lewandowski@swarmbot.io",
			phone: "+48 604 567 890",
			role: "Read-only",
		},
		{
			username: "k.wojcik",
			name: "Karolina Wójcik",
			email: "k.wojcik@swarmbot.io",
			phone: "+48 605 678 901",
			role: "Administrator",
		},
		{
			username: "p.kaminski",
			name: "Piotr Kamiński",
			email: "p.kaminski@swarmbot.io",
			phone: "+48 606 789 012",
			role: "Editor",
		},
		{
			username: "m.zielinska",
			name: "Magdalena Zielińska",
			email: "m.zielinska@swarmbot.io",
			phone: null,
			role: "Read-only",
		},
	];
	for (const s of seeds) {
		if (existingNames.has(s.username)) continue;
		await db
			.insertInto("users")
			.values({
				id: randomUUID(),
				username: s.username,
				name: s.name,
				email: s.email,
				phone: s.phone ?? "",
				role: s.role,
				password: derivePassword("demo-password"),
				createdAt: new Date(Date.now() - Math.random() * 1e10).toISOString(),
				lastLoginAt: Math.random() > 0.2 ? new Date(Date.now() - Math.random() * 1e9).toISOString() : null,
			})
			.execute();
	}
}
