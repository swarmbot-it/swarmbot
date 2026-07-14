import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db.js";
import { derivePassword } from "../auth/password.js";
import yaml from "js-yaml";
import { logger } from "../logger.js";

export async function initUsersFromConfig(db: Kysely<Database>): Promise<void> {
	const path = process.env.SWARMBOTY_USERS_CONFIG ?? "/run/configs/users.yaml";
	try {
		const raw = await readFile(path, "utf8");
		const doc = yaml.load(raw) as { users?: Array<Record<string, unknown>> };
		const users = doc?.users ?? [];
		for (const u of users) {
			const username = u.username as string | undefined;
			const passwordHash = u.password_hash as string | undefined;
			const plainPassword = u.password as string | undefined;
			const envPassword =
				u.password_env && process.env[String(u.password_env)]
					? String(process.env[String(u.password_env)])
					: undefined;
			const storedPassword =
				passwordHash ??
				(plainPassword !== undefined ? derivePassword(plainPassword) : undefined) ??
				(envPassword !== undefined ? derivePassword(envPassword) : undefined);
			if (!username || !storedPassword) continue;
			const existing = await db
				.selectFrom("users")
				.select("id")
				.where("username", "=", username)
				.executeTakeFirst();
			if (existing) continue;
			await db
				.insertInto("users")
				.values({
					id: randomUUID(),
					username,
					password: storedPassword,
					email: (u.email as string) ?? "",
					role: (u.role as string) ?? "user",
					createdAt: new Date().toISOString(),
				})
				.execute();
			logger.info({ username }, "Created user from config");
		}
	} catch {
		/* file missing is OK */
	}
}

export async function bootstrapAdminIfEmpty(
	db: Kysely<Database>,
	opts?: { mock?: boolean }
): Promise<void> {
	const existing = await db.selectFrom("users").select("id").executeTakeFirst();
	if (existing) return;
	const mock = Boolean(opts?.mock);
	const u = process.env.SWARMBOTY_BOOTSTRAP_ADMIN ?? (mock ? "admin" : undefined);
	const p = process.env.SWARMBOTY_BOOTSTRAP_PASSWORD ?? (mock ? "swarmboty" : undefined);
	if (!u || !p) {
		logger.warn(
			"No users in database. Set SWARMBOTY_BOOTSTRAP_ADMIN and SWARMBOTY_BOOTSTRAP_PASSWORD or mount users.yaml."
		);
		return;
	}
	await db
		.insertInto("users")
		.values({
			id: randomUUID(),
			username: u,
			password: derivePassword(p),
			email: mock ? "admin@swarmboty.local" : "",
			role: "admin",
			createdAt: new Date().toISOString(),
		})
		.execute();
	logger.info({ username: u }, "Bootstrap admin user created");
}
