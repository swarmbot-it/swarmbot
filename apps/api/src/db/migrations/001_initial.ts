import { sql, type Kysely } from "kysely";

/**
 * Written with literal snake_case column names — CamelCasePlugin (attached to
 * the app's query-building Kysely instance, not to migrations) maps these to
 * camelCase properties on the `Database` interface at query time.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createTable("users")
		.addColumn("id", "uuid", (col) => col.primaryKey())
		.addColumn("username", "text", (col) => col.notNull().unique())
		.addColumn("name", "text")
		.addColumn("email", "text")
		.addColumn("phone", "text")
		.addColumn("role", "text")
		.addColumn("password", "text", (col) => col.notNull())
		.addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn("last_login_at", "timestamptz")
		.addColumn("api_token_jti", "text")
		.addColumn("api_token_mask", "text")
		.addColumn("api_token_expires_at", "timestamptz")
		.execute();

	await db.schema
		.createTable("registries")
		.addColumn("id", "uuid", (col) => col.primaryKey())
		.addColumn("name", "text", (col) => col.notNull())
		.addColumn("url", "text", (col) => col.notNull())
		.addColumn("registry_type", "text", (col) => col.notNull())
		.addColumn("registry_user", "text")
		.addColumn("password", "text")
		.addColumn("is_default", "boolean", (col) => col.notNull().defaultTo(false))
		.execute();

	// Singleton table: exactly one row holds the JWT signing key, enforced by
	// application logic (insert-if-empty at startup), not a DB constraint.
	await db.schema
		.createTable("app_secrets")
		.addColumn("id", "uuid", (col) => col.primaryKey())
		.addColumn("secret", "text", (col) => col.notNull())
		.execute();

	await db.schema
		.createTable("revoked_jti")
		.addColumn("jti", "text", (col) => col.primaryKey())
		.addColumn("expires_at", "timestamptz", (col) => col.notNull())
		.execute();

	await db.schema
		.createTable("slt")
		.addColumn("token", "text", (col) => col.primaryKey())
		.addColumn("username", "text", (col) => col.notNull())
		.addColumn("expires_at", "timestamptz", (col) => col.notNull())
		.execute();

	await db.schema
		.createTable("metrics_snapshots")
		.addColumn("day", "date", (col) => col.primaryKey())
		.addColumn("recorded_at", "timestamptz", (col) => col.notNull())
		.addColumn("stacks", "integer", (col) => col.notNull())
		.addColumn("services", "integer", (col) => col.notNull())
		.addColumn("tasks", "integer", (col) => col.notNull())
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropTable("metrics_snapshots").execute();
	await db.schema.dropTable("slt").execute();
	await db.schema.dropTable("revoked_jti").execute();
	await db.schema.dropTable("app_secrets").execute();
	await db.schema.dropTable("registries").execute();
	await db.schema.dropTable("users").execute();
}
