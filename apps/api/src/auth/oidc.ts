import { createHash, createPublicKey, randomBytes, type JsonWebKey } from "crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Kysely } from "kysely";
import type { Database } from "../db.js";
import type { SwarmbotConfig } from "../config.js";

/**
 * App-native OIDC login against Dex (the console at swarmbot.infra). The app is
 * a confidential OIDC client: it drives the authorization-code flow with PKCE,
 * verifies the ID token (RS256 against the provider JWKS — using the built-in
 * `crypto` JWK->PEM import + `jsonwebtoken`, no extra dependency), maps the
 * identity to a swarmbot user, then issues its OWN session JWT so guards/WS/
 * blacklist are unchanged. Dex already restricts identities to the GitHub org.
 */

export type OidcConfig = {
	issuer: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scopes: string;
	adminGroups: string[];
	editorGroups: string[];
};

/** Returns the OIDC config when fully set, otherwise null (feature disabled). */
export function oidcConfig(cfg: SwarmbotConfig): OidcConfig | null {
	if (!cfg.oidcIssuer || !cfg.oidcClientId || !cfg.oidcClientSecret || !cfg.oidcRedirectUri) {
		return null;
	}
	return {
		issuer: cfg.oidcIssuer.replace(/\/+$/, ""),
		clientId: cfg.oidcClientId,
		clientSecret: cfg.oidcClientSecret,
		redirectUri: cfg.oidcRedirectUri,
		scopes: cfg.oidcScopes,
		adminGroups: cfg.oidcAdminGroups,
		editorGroups: cfg.oidcEditorGroups,
	};
}

type Discovery = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	jwks_uri: string;
};

const DISCOVERY_TTL_MS = 60 * 60_000;
// kid -> SPKI PEM public key.
let cache: { issuer: string; doc: Discovery; keys: Map<string, string>; at: number } | null = null;

async function fetchKeys(jwksUri: string): Promise<Map<string, string>> {
	const res = await fetch(jwksUri);
	if (!res.ok) throw new Error(`oidc jwks fetch failed: ${res.status}`);
	const body = (await res.json()) as { keys?: JsonWebKey[] };
	const map = new Map<string, string>();
	for (const jwk of body.keys ?? []) {
		const kid = typeof jwk.kid === "string" ? jwk.kid : undefined;
		if (!kid || jwk.kty !== "RSA") continue;
		try {
			const pem = createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "pem" });
			map.set(kid, typeof pem === "string" ? pem : pem.toString("utf8"));
		} catch {
			/* skip unusable key */
		}
	}
	return map;
}

async function discover(issuer: string): Promise<{ doc: Discovery; keys: Map<string, string> }> {
	if (cache && cache.issuer === issuer && Date.now() - cache.at < DISCOVERY_TTL_MS) return cache;
	const res = await fetch(`${issuer}/.well-known/openid-configuration`);
	if (!res.ok) throw new Error(`oidc discovery failed: ${res.status}`);
	const doc = (await res.json()) as Discovery;
	const keys = await fetchKeys(doc.jwks_uri);
	cache = { issuer, doc, keys, at: Date.now() };
	return cache;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");
export const newVerifier = (): string => b64url(randomBytes(32));
export const challenge = (verifier: string): string => b64url(createHash("sha256").update(verifier).digest());
export const randomOpaque = (): string => b64url(randomBytes(16));

export async function authorizationUrl(
	cfg: OidcConfig,
	params: { state: string; nonce: string; codeChallenge: string }
): Promise<string> {
	const { doc } = await discover(cfg.issuer);
	const u = new URL(doc.authorization_endpoint);
	u.searchParams.set("client_id", cfg.clientId);
	u.searchParams.set("redirect_uri", cfg.redirectUri);
	u.searchParams.set("response_type", "code");
	u.searchParams.set("scope", cfg.scopes);
	u.searchParams.set("state", params.state);
	u.searchParams.set("nonce", params.nonce);
	u.searchParams.set("code_challenge", params.codeChallenge);
	u.searchParams.set("code_challenge_method", "S256");
	return u.toString();
}

export type OidcIdentity = {
	sub: string;
	username: string;
	email: string | null;
	name: string | null;
	groups: string[];
};

export async function exchangeAndVerify(
	cfg: OidcConfig,
	code: string,
	codeVerifier: string,
	nonce: string
): Promise<OidcIdentity> {
	const { doc, keys } = await discover(cfg.issuer);
	const res = await fetch(doc.token_endpoint, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: cfg.redirectUri,
			client_id: cfg.clientId,
			client_secret: cfg.clientSecret,
			code_verifier: codeVerifier,
		}),
	});
	if (!res.ok) throw new Error(`oidc token exchange failed: ${res.status}`);
	const tok = (await res.json()) as { id_token?: string };
	if (!tok.id_token) throw new Error("oidc token response missing id_token");

	const decoded = jwt.decode(tok.id_token, { complete: true });
	if (!decoded || typeof decoded === "string") throw new Error("oidc id token malformed");
	const kid = decoded.header.kid;
	let pem = kid ? keys.get(kid) : undefined;
	if (!pem) {
		// Key rotation: refresh the JWKS once and retry.
		const fresh = await fetchKeys(doc.jwks_uri);
		if (cache && cache.issuer === cfg.issuer) cache.keys = fresh;
		pem = kid ? fresh.get(kid) : undefined;
	}
	if (!pem) throw new Error("oidc signing key not found");

	const payload = jwt.verify(tok.id_token, pem, {
		algorithms: ["RS256"],
		issuer: doc.issuer,
		audience: cfg.clientId,
	});
	if (typeof payload === "string") throw new Error("oidc id token payload invalid");
	if (nonce && (payload as JwtPayload).nonce !== nonce) throw new Error("oidc nonce mismatch");
	return identityFromClaims(payload as JwtPayload & Record<string, unknown>);
}

function identityFromClaims(p: JwtPayload & Record<string, unknown>): OidcIdentity {
	const sub = String(p.sub ?? "");
	if (!sub) throw new Error("oidc id token missing sub");
	const email = typeof p.email === "string" ? p.email : null;
	const name = typeof p.name === "string" ? p.name : null;
	// Dex's GitHub connector sets preferred_username to the GitHub login.
	const preferred = typeof p.preferred_username === "string" ? p.preferred_username : undefined;
	const base = preferred || (email ? email.split("@")[0]! : "") || sub;
	const username = base.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
	const groups = Array.isArray(p.groups) ? (p.groups as unknown[]).map((g) => String(g)) : [];
	return { sub, username, email, name, groups };
}

/** Map Dex/GitHub groups (e.g. "no-human-tech:admins") to a swarmbot role. */
export function roleForGroups(cfg: OidcConfig, groups: string[]): string {
	const have = new Set(groups.map((g) => g.toLowerCase()));
	if (cfg.adminGroups.some((g) => have.has(g.toLowerCase()))) return "admin";
	if (cfg.editorGroups.some((g) => have.has(g.toLowerCase()))) return "editor";
	return "user";
}

// ---------------------------------------------------------------- flow store
// state/nonce/PKCE persisted in Postgres (stateless across replicas), TTL 10 min.
const FLOW_TTL_MS = 10 * 60_000;

export async function saveFlow(
	db: Kysely<Database>,
	flow: { state: string; nonce: string; codeVerifier: string; redirectTo: string | null }
): Promise<void> {
	await db
		.insertInto("oidcFlow")
		.values({
			state: flow.state,
			nonce: flow.nonce,
			codeVerifier: flow.codeVerifier,
			redirectTo: flow.redirectTo,
			expiresAt: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
		})
		.execute();
}

export async function consumeFlow(
	db: Kysely<Database>,
	state: string | undefined
): Promise<{ nonce: string; codeVerifier: string; redirectTo: string | null } | null> {
	if (!state) return null;
	const row = await db.selectFrom("oidcFlow").selectAll().where("state", "=", state).executeTakeFirst();
	if (!row) return null;
	await db.deleteFrom("oidcFlow").where("state", "=", state).execute();
	if (new Date(row.expiresAt).getTime() < Date.now()) return null;
	return { nonce: row.nonce, codeVerifier: row.codeVerifier, redirectTo: row.redirectTo ?? null };
}
