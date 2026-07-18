import { type Kysely } from "kysely";

/**
 * OIDC (Dex) login support: external-identity columns on `users` and a
 * short-lived table for the authorization-code flow (state/nonce/PKCE),
 * mirroring the `slt` pattern so any API replica can finish a flow another
 * one started. Column names are literal snake_case (CamelCasePlugin maps them).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema.alterTable("users").addColumn("oidc_sub", "text").execute();
	await db.schema.alterTable("users").addColumn("oidc_provider", "text").execute();

	await db.schema
		.createTable("oidc_flow")
		.addColumn("state", "text", (col) => col.primaryKey())
		.addColumn("nonce", "text", (col) => col.notNull())
		.addColumn("code_verifier", "text", (col) => col.notNull())
		.addColumn("redirect_to", "text")
		.addColumn("expires_at", "timestamptz", (col) => col.notNull())
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropTable("oidc_flow").execute();
	await db.schema.alterTable("users").dropColumn("oidc_provider").execute();
	await db.schema.alterTable("users").dropColumn("oidc_sub").execute();
}
