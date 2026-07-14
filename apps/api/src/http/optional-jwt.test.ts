import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import type { Kysely } from "kysely";
import { optionalJwtMiddleware } from "./optional-jwt.js";
import { createTestDb } from "../test/db-setup.js";
import type { Database } from "../db.js";
import { derivePassword } from "../auth/password.js";
import { generateJwt } from "../auth/jwt.js";
import type { AuthedRequest } from "./optional-jwt.js";
import type { Response, NextFunction } from "express";

const SECRET = "test-secret"; // matches the row createTestDb() seeds into app_secrets

function mockRes(): Response {
	return {} as Response;
}

async function runMiddleware(req: AuthedRequest, db: Kysely<Database>): Promise<void> {
	const mw = optionalJwtMiddleware(db);
	await new Promise<void>((resolve) => {
		mw(req, mockRes(), (() => resolve()) as NextFunction);
	});
}

async function insertTestUser(
	db: Kysely<Database>,
	input: { username: string; password: string; role: string }
) {
	return db
		.insertInto("users")
		.values({ id: randomUUID(), ...input })
		.returning(["username", "role"])
		.executeTakeFirstOrThrow();
}

describe("optionalJwtMiddleware", () => {
	it("leaves request anonymous without header", async () => {
		const db = await createTestDb();
		const req = { headers: {} } as AuthedRequest;
		await runMiddleware(req, db);
		expect(req.swarmUser).toBeUndefined();
	});

	it("attaches swarmUser for valid session JWT", async () => {
		const db = await createTestDb();
		const user = await insertTestUser(db, {
			username: "alice",
			password: derivePassword("x"),
			role: "admin",
		});
		const token = generateJwt(SECRET, user);
		const req = { headers: { authorization: token } } as AuthedRequest;
		await runMiddleware(req, db);
		expect(req.swarmUser?.usr.username).toBe("alice");
	});

	it("ignores revoked session tokens", async () => {
		const db = await createTestDb();
		const user = await insertTestUser(db, {
			username: "bob",
			password: derivePassword("x"),
			role: "user",
		});
		const token = generateJwt(SECRET, user);
		const { revokeJti } = await import("../auth/blacklist.js");
		const { verifyJwt } = await import("../auth/jwt.js");
		await revokeJti(db, verifyJwt(SECRET, token).jti);
		const req = { headers: { authorization: token } } as AuthedRequest;
		await runMiddleware(req, db);
		expect(req.swarmUser).toBeUndefined();
	});
});
