import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Deployed swarmbot release (env override, then apps/api package.json). */
export function appVersion(): string {
	if (process.env.SWARMBOT_VERSION) return process.env.SWARMBOT_VERSION;
	for (const rel of ["../package.json", "../../package.json"]) {
		try {
			const raw = readFileSync(join(moduleDir, rel), "utf8");
			const v = JSON.parse(raw).version;
			if (typeof v === "string" && v.length > 0) return v;
		} catch {
			/* try next */
		}
	}
	return "0.0.0";
}
