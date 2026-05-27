import yaml from "js-yaml";
import type { MessageKey } from "../i18n/translate.js";

export type ComposeDoc = {
	services?: Record<string, unknown>;
	networks?: Record<string, unknown>;
	volumes?: Record<string, unknown>;
	configs?: Record<string, unknown>;
	secrets?: Record<string, unknown>;
};

export type ComposeResourceCounts = {
	services: number;
	networks: number;
	volumes: number;
	configs: number;
	secrets: number;
};

export class ComposeValidationError extends Error {
	constructor(
		readonly messageKey: MessageKey,
		readonly detail?: string
	) {
		super(messageKey);
		this.name = "ComposeValidationError";
	}
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function countSection(section: unknown): number {
	return isPlainObject(section) ? Object.keys(section).length : 0;
}

/** Parses and validates a Compose file for `docker stack deploy`. */
export function validateComposeYaml(source: string): ComposeDoc {
	const trimmed = source.trim();
	if (!trimmed) {
		throw new ComposeValidationError("errors.composeEmpty");
	}

	let doc: unknown;
	try {
		doc = yaml.load(trimmed);
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		throw new ComposeValidationError("errors.composeYamlSyntax", detail);
	}

	if (!isPlainObject(doc)) {
		throw new ComposeValidationError("errors.composeInvalidRoot");
	}

	if (!isPlainObject(doc.services) || Object.keys(doc.services).length === 0) {
		throw new ComposeValidationError("errors.composeMissingServices");
	}

	for (const [name, svc] of Object.entries(doc.services)) {
		if (!isPlainObject(svc)) {
			throw new ComposeValidationError(
				"errors.composeInvalidService",
				name
			);
		}
	}

	return doc as ComposeDoc;
}

export function countComposeResources(doc: ComposeDoc): ComposeResourceCounts {
	return {
		services: countSection(doc.services),
		networks: countSection(doc.networks),
		volumes: countSection(doc.volumes),
		configs: countSection(doc.configs),
		secrets: countSection(doc.secrets),
	};
}
