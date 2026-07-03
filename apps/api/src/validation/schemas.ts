import { z } from "zod";
import { GraphQLError } from "graphql";
import type { SupportedLocale } from "../i18n/locale.js";
import { t } from "../i18n/translate.js";

const VALID_ROLES = ["admin", "administrator", "editor", "read-only"];

export const createUserInputSchema = z.object({
	username: z
		.string()
		.min(3, "username must be at least 3 characters")
		.max(64, "username must be at most 64 characters")
		.regex(/^[a-zA-Z0-9_.-]+$/, "username may only contain letters, numbers, . _ -"),
	password: z.string().min(8, "password must be at least 8 characters"),
	name: z.string().max(200).optional(),
	email: z.email("invalid email address"),
	phone: z.string().max(40).optional(),
	role: z
		.string()
		.refine((v) => VALID_ROLES.includes(v.toLowerCase()), "role must be one of admin/editor/read-only"),
});

export const createRegistryInputSchema = z.object({
	name: z.string().min(1, "name is required").max(200),
	url: z.string().min(1, "url is required").max(500),
	type: z.string().min(1, "type is required").max(100),
	user: z.string().max(200).optional(),
	password: z.string().max(1000).optional(),
	default: z.boolean().optional(),
});

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export const createNetworkInputSchema = z.object({
	name: z
		.string()
		.min(1, "name is required")
		.max(200)
		.regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "invalid network name"),
	driver: z.string().min(1, "driver is required").max(100),
	subnet: z.string().regex(CIDR_RE, "subnet must be a CIDR, e.g. 10.0.0.0/24").optional(),
	gateway: z.string().regex(IPV4_RE, "gateway must be an IPv4 address").optional(),
	attachable: z.boolean().optional(),
	internal: z.boolean().optional(),
	ingress: z.boolean().optional(),
	labels: z.array(z.object({ k: z.string().min(1), v: z.string() })).optional(),
});

/** Parses `input` against `schema`; throws a localized GraphQLError (VALIDATION_ERROR)
 * carrying the raw zod issues in extensions when it doesn't match. */
export function validateInput<T>(schema: z.ZodType<T>, input: unknown, locale: SupportedLocale): T {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new GraphQLError(t(locale, "errors.validationFailed"), {
			extensions: {
				code: "VALIDATION_ERROR",
				issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
			},
		});
	}
	return result.data;
}
