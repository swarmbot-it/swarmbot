import type { ColumnType, Generated } from "kysely";

/** ISO-8601 string in, `Date` out — matches how the app already handles timestamps as strings. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type UserTable = {
	id: Generated<string>;
	username: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	role: string | null;
	password: string;
	createdAt: ColumnType<Date, Date | string | undefined, never>;
	lastLoginAt: Timestamp | null;
	apiTokenJti: string | null;
	apiTokenMask: string | null;
	apiTokenExpiresAt: Timestamp | null;
};

export type RegistryTable = {
	id: Generated<string>;
	name: string;
	url: string;
	registryType: string;
	registryUser: string | null;
	password: string | null;
	isDefault: ColumnType<boolean, boolean | undefined, boolean>;
};

/** Singleton table — exactly one row, holding the JWT signing key. */
export type AppSecretTable = {
	id: Generated<string>;
	secret: string;
};

/** Natural key: the JWT ID itself (no synthetic surrogate key needed). */
export type RevokedJtiTable = {
	jti: string;
	expiresAt: Timestamp;
};

/** Natural key: the SSE handshake token itself. */
export type SltTable = {
	token: string;
	username: string;
	expiresAt: Timestamp;
};

/** Natural key: calendar day, preserving the "one snapshot per day" upsert guard. */
export type MetricsSnapshotTable = {
	day: ColumnType<string, string, never>;
	recordedAt: Timestamp;
	stacks: number;
	services: number;
	tasks: number;
};

export type Database = {
	users: UserTable;
	registries: RegistryTable;
	appSecrets: AppSecretTable;
	revokedJti: RevokedJtiTable;
	slt: SltTable;
	metricsSnapshots: MetricsSnapshotTable;
};
