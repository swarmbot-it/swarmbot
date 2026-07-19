import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import {
	authorizationUrl,
	challenge,
	exchangeAndVerify,
	newVerifier,
	oidcConfig,
	randomOpaque,
	roleForGroups,
	type OidcConfig,
} from "./oidc.js";
import type { SwarmbotConfig } from "../config.js";

/** Minimal config carrying only the OIDC fields oidcConfig() reads. */
function cfgWith(over: Partial<SwarmbotConfig>): SwarmbotConfig {
	return {
		oidcIssuer: undefined,
		oidcClientId: undefined,
		oidcClientSecret: undefined,
		oidcRedirectUri: undefined,
		oidcScopes: "openid profile email groups",
		oidcAdminGroups: [],
		oidcEditorGroups: [],
		...over,
	} as SwarmbotConfig;
}

const fullOidc: OidcConfig = {
	issuer: "https://idp.test",
	clientId: "swarmbot",
	clientSecret: "s3cret",
	redirectUri: "https://swarmbot.infra/api/auth/oidc/callback",
	scopes: "openid profile email groups",
	adminGroups: ["org:admins"],
	editorGroups: ["org:devs"],
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("oidcConfig", () => {
	it("returns null unless issuer+clientId+secret+redirectUri are all set", () => {
		expect(oidcConfig(cfgWith({}))).toBeNull();
		expect(
			oidcConfig(
				cfgWith({
					oidcIssuer: "https://idp.test",
					oidcClientId: "swarmbot",
					oidcClientSecret: "x",
					// redirectUri missing
				})
			)
		).toBeNull();
	});

	it("builds the config and trims trailing slashes from the issuer", () => {
		const c = oidcConfig(
			cfgWith({
				oidcIssuer: "https://idp.test/",
				oidcClientId: "swarmbot",
				oidcClientSecret: "x",
				oidcRedirectUri: "https://swarmbot.infra/api/auth/oidc/callback",
				oidcAdminGroups: ["org:admins"],
			})
		);
		expect(c).not.toBeNull();
		expect(c!.issuer).toBe("https://idp.test");
		expect(c!.adminGroups).toEqual(["org:admins"]);
	});
});

describe("roleForGroups", () => {
	it("maps admin groups to admin (case-insensitive)", () => {
		expect(roleForGroups(fullOidc, ["org:admins"])).toBe("admin");
		expect(roleForGroups(fullOidc, ["ORG:Admins"])).toBe("admin");
	});

	it("maps editor groups to editor", () => {
		expect(roleForGroups(fullOidc, ["org:devs"])).toBe("editor");
	});

	it("defaults unknown groups to user", () => {
		expect(roleForGroups(fullOidc, ["org:randoms"])).toBe("user");
		expect(roleForGroups(fullOidc, [])).toBe("user");
	});

	it("prefers admin when a user is in both admin and editor groups", () => {
		expect(roleForGroups(fullOidc, ["org:devs", "org:admins"])).toBe("admin");
	});
});

describe("PKCE helpers", () => {
	it("challenge is the base64url SHA-256 of the verifier", () => {
		const v = "test-verifier";
		const expected = createHash("sha256").update(v).digest("base64url");
		expect(challenge(v)).toBe(expected);
	});

	it("newVerifier/randomOpaque return url-safe strings (no +, /, =)", () => {
		for (const s of [newVerifier(), randomOpaque()]) {
			expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
		}
		// Two calls differ (randomness).
		expect(newVerifier()).not.toBe(newVerifier());
	});
});

describe("authorizationUrl", () => {
	it("includes client_id, redirect_uri, PKCE S256 challenge, state, nonce and scopes", async () => {
		const issuer = "https://authz.test";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.endsWith("/.well-known/openid-configuration")) {
					return new Response(
						JSON.stringify({
							issuer,
							authorization_endpoint: `${issuer}/auth`,
							token_endpoint: `${issuer}/token`,
							jwks_uri: `${issuer}/keys`,
						}),
						{ status: 200 }
					);
				}
				return new Response(JSON.stringify({ keys: [] }), { status: 200 });
			})
		);
		const url = new URL(
			await authorizationUrl(
				{ ...fullOidc, issuer },
				{ state: "st", nonce: "no", codeChallenge: "chal" }
			)
		);
		expect(url.origin + url.pathname).toBe(`${issuer}/auth`);
		expect(url.searchParams.get("client_id")).toBe("swarmbot");
		expect(url.searchParams.get("redirect_uri")).toBe(fullOidc.redirectUri);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")).toBe(fullOidc.scopes);
		expect(url.searchParams.get("state")).toBe("st");
		expect(url.searchParams.get("nonce")).toBe("no");
		expect(url.searchParams.get("code_challenge")).toBe("chal");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	});
});

describe("exchangeAndVerify", () => {
	// Generate an RSA keypair, publish it as a JWKS, and sign an ID token the way
	// Dex would — the whole discovery -> token -> JWKS -> RS256 verify path.
	function harness(issuer: string, claims: Record<string, unknown>) {
		const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const jwk = { ...(publicKey.export({ format: "jwk" }) as object), kid: "k1" };
		const idToken = jwt.sign(claims, privateKey.export({ type: "pkcs8", format: "pem" }), {
			algorithm: "RS256",
			keyid: "k1",
		});
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith("/.well-known/openid-configuration")) {
				return new Response(
					JSON.stringify({
						issuer,
						authorization_endpoint: `${issuer}/auth`,
						token_endpoint: `${issuer}/token`,
						jwks_uri: `${issuer}/keys`,
					}),
					{ status: 200 }
				);
			}
			if (url === `${issuer}/keys`) {
				return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
			}
			if (url === `${issuer}/token`) {
				return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
			}
			return new Response("not found", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);
		return { fetchMock };
	}

	it("verifies the ID token and derives the identity (username from preferred_username, groups)", async () => {
		const issuer = "https://verify1.test";
		harness(issuer, {
			iss: issuer,
			aud: "swarmbot",
			sub: "gh|42",
			preferred_username: "Dominik",
			email: "d@no-human.tech",
			name: "Dominik S",
			groups: ["org:admins"],
			nonce: "nonce-1",
			exp: Math.floor(Date.now() / 1000) + 300,
		});
		const id = await exchangeAndVerify({ ...fullOidc, issuer }, "code", "verifier", "nonce-1");
		expect(id.sub).toBe("gh|42");
		expect(id.username).toBe("dominik"); // lowercased + sanitised
		expect(id.email).toBe("d@no-human.tech");
		expect(id.groups).toEqual(["org:admins"]);
	});

	it("rejects a token whose nonce does not match the flow", async () => {
		const issuer = "https://verify2.test";
		harness(issuer, {
			iss: issuer,
			aud: "swarmbot",
			sub: "gh|7",
			nonce: "server-nonce",
			exp: Math.floor(Date.now() / 1000) + 300,
		});
		await expect(
			exchangeAndVerify({ ...fullOidc, issuer }, "code", "verifier", "different-nonce")
		).rejects.toThrow(/nonce mismatch/);
	});

	it("rejects a token signed by a key not in the JWKS", async () => {
		const issuer = "https://verify3.test";
		// Sign with a DIFFERENT key than the one published in the JWKS.
		const rogue = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const published = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const jwk = { ...(published.publicKey.export({ format: "jwk" }) as object), kid: "k1" };
		const idToken = jwt.sign({ iss: issuer, aud: "swarmbot", sub: "x", exp: Math.floor(Date.now() / 1000) + 300 },
			rogue.privateKey.export({ type: "pkcs8", format: "pem" }),
			{ algorithm: "RS256", keyid: "k1" }
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.endsWith("/.well-known/openid-configuration")) {
					return new Response(
						JSON.stringify({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/keys` }),
						{ status: 200 }
					);
				}
				if (url === `${issuer}/keys`) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
				return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
			})
		);
		await expect(
			exchangeAndVerify({ ...fullOidc, issuer }, "code", "verifier", "")
		).rejects.toThrow();
	});
});
