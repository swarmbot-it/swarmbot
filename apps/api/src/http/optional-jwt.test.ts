import { describe, it, expect } from "vitest";
import { optionalJwtMiddleware } from "./optional-jwt.js";
import { createMockCouch } from "../couch.mock.js";
import { createSecret, insertDoc } from "../couch.js";
import { derivePassword } from "../auth/password.js";
import { generateJwt } from "../auth/jwt.js";
import type { AuthedRequest } from "./optional-jwt.js";
import type { Response, NextFunction } from "express";

function mockRes(): Response {
	return {} as Response;
}

async function runMiddleware(
	req: AuthedRequest,
	db: ReturnType<typeof createMockCouch>["db"]
): Promise<void> {
	const mw = optionalJwtMiddleware(db);
	await new Promise<void>((resolve) => {
		mw(req, mockRes(), (() => resolve()) as NextFunction);
	});
}

describe("optionalJwtMiddleware", () => {
	it("leaves request anonymous without header", async () => {
		const { db } = createMockCouch();
		await createSecret(db, "sec");
		const req = { headers: {} } as AuthedRequest;
		await runMiddleware(req, db);
		expect(req.swarmUser).toBeUndefined();
	});

	it("attaches swarmUser for valid session JWT", async () => {
		const { db } = createMockCouch();
		await createSecret(db, "sec");
		const user = await insertDoc(db, {
			type: "user",
			username: "alice",
			password: derivePassword("x"),
			role: "admin",
		});
		const token = generateJwt("sec", user);
		const req = { headers: { authorization: token } } as AuthedRequest;
		await runMiddleware(req, db);
		expect(req.swarmUser?.usr.username).toBe("alice");
	});

	it("ignores revoked session tokens", async () => {
		const { db } = createMockCouch();
		await createSecret(db, "sec");
		const user = await insertDoc(db, {
			type: "user",
			username: "bob",
			password: derivePassword("x"),
			role: "user",
		});
		const token = generateJwt("sec", user);
		const { revokeJti } = await import("../auth/blacklist.js");
		const { verifyJwt } = await import("../auth/jwt.js");
		await revokeJti(db, verifyJwt("sec", token).jti);
		const req = { headers: { authorization: token } } as AuthedRequest;
		await runMiddleware(req, db);
		expect(req.swarmUser).toBeUndefined();
	});
});
