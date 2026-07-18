import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

export type JwtUser = { username: string; email?: string; role?: string };

/** Structural subset any user record needs to carry to be signable into a JWT. */
type SignableUser = { username: string; email?: string | null; role?: string | null };

export type JwtClaims = {
	iss: string;
	exp?: number;
	iat: number;
	usr: JwtUser;
	jti: string;
};

const DAY_SEC = 86400;

export function tokenValue(header: string | undefined): string {
	if (!header) return "";
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	return m ? m[1]! : header.trim();
}

export function generateJwt(
	secret: string,
	user: SignableUser,
	opts?: { exp?: number | null; jti?: string; iss?: string }
): string {
	const usr: JwtUser = {
		username: user.username,
		email: user.email ?? undefined,
		role: user.role ?? undefined,
	};
	const now = Math.floor(Date.now() / 1000);
	const payload: JwtClaims = {
		iss: opts?.iss ?? "swarmbot",
		iat: now,
		usr,
		jti: opts?.jti ?? randomUUID(),
		...(opts?.exp === null
			? {}
			: opts?.exp !== undefined
				? { exp: opts.exp }
				: { exp: now + DAY_SEC }),
	};
	const token = jwt.sign(payload, secret, { algorithm: "HS256" });
	return `Bearer ${token}`;
}

export function verifyJwt(secret: string, authHeader: string | undefined): JwtClaims {
	const raw = tokenValue(authHeader);
	if (!raw) throw new Error("missing_token");
	const decoded = jwt.verify(raw, secret, { algorithms: ["HS256"] });
	if (typeof decoded !== "object" || decoded === null) throw new Error("invalid_token");
	return decoded as JwtClaims;
}

export function decodeBasic(authHeader: string | undefined): {
	username: string;
	password: string;
} {
	const raw = authHeader?.trim();
	if (!raw) throw new Error("expected_basic");
	const m = /^Basic\s+(.+)$/i.exec(raw);
	if (!m) throw new Error("expected_basic");
	const b64 = m[1]!.trim();
	const decoded = Buffer.from(b64, "base64").toString("utf8");
	const idx = decoded.indexOf(":");
	if (idx < 0) throw new Error("invalid_basic");
	return {
		username: decoded.slice(0, idx),
		password: decoded.slice(idx + 1),
	};
}
