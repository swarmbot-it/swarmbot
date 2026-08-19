#!/usr/bin/env node
// Reports whether graphql 17 has become genuinely installable in this workspace.
//
// graphql 17 is GA but unusable here: @apollo/server pins `graphql` to ^16, so
// the upgrade cannot land yet. That constraint clears on Apollo's schedule, not
// ours, so this asks the resolver instead of tracking releases by hand.
//
// The check is deliberately "one copy at 17", not "npm install succeeded". npm
// does NOT fail on this conflict — it satisfies both ranges by nesting, giving
// graphql 17 to the workspaces and leaving 16 hoisted for Apollo. Two copies of
// graphql in one process breaks `instanceof` across the boundary (GraphQLError
// and friends) and is worse than not upgrading. Verified 2026-08: a dry-run
// resolve produced apps/api→17.0.2, apps/web→17.0.2, root→16.14.2 with no error.
//
// Exit codes:
//   0 — still blocked (or already on 17), nothing to do
//   1 — UNBLOCKED: graphql 17 resolves to a single copy, time to upgrade
//   2 — inconclusive (registry/network); a soft warning, not a failure
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const repo = fileURLToPath(new URL("..", import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Every resolved `graphql` copy in a lockfile, as path -> version. */
const graphqlCopies = (lock) =>
	Object.entries(lock.packages ?? {})
		.filter(([path, pkg]) => path.endsWith("node_modules/graphql") && pkg.version)
		.map(([path, pkg]) => ({ path, version: pkg.version }));

/** Packages constraining `graphql` to a range that excludes 17 — derived, never hardcoded. */
const blockers = (lock) =>
	Object.entries(lock.packages ?? {})
		.filter(
			([, pkg]) => pkg.peerDependencies?.graphql && !/17/.test(pkg.peerDependencies.graphql)
		)
		.map(([path, pkg]) => ({
			name: path.replace(/^.*node_modules\//, ""),
			range: pkg.peerDependencies.graphql,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

const current = graphqlCopies(readJson(join(repo, "package-lock.json")));
if (current.every((c) => Number.parseInt(c.version, 10) >= 17)) {
	console.log(`graphql ${current[0]?.version} is already installed.`);
	console.log("This watcher has served its purpose — delete scripts/check-graphql17.mjs");
	console.log("and the graphql-17-watch job in .github/workflows/security.yml.");
	process.exit(0);
}

// Resolve in a throwaway copy of the manifests so the repo is never touched.
const sandbox = mkdtempSync(join(tmpdir(), "graphql17-"));
try {
	for (const f of [
		"package.json",
		"package-lock.json",
		"apps/api/package.json",
		"apps/web/package.json",
		"design-qa/package.json",
	]) {
		cpSync(join(repo, f), join(sandbox, f), { recursive: true, force: true });
	}

	try {
		await run(
			"npm",
			[
				"install",
				"--package-lock-only",
				"--no-audit",
				"--no-fund",
				"graphql@17",
				"-w",
				"@swarmbot/api",
				"-w",
				"web",
			],
			{ cwd: sandbox, timeout: 300_000 }
		);
	} catch (err) {
		const stderr = String(err?.stderr ?? err?.message ?? "");
		if (/ERESOLVE|peer dep/i.test(stderr)) {
			report(readJson(join(repo, "package-lock.json")), "npm refused to resolve it");
			process.exit(0);
		}
		console.error("Could not determine whether graphql 17 resolves (registry or network?).");
		console.error(stderr.split("\n").slice(0, 8).join("\n"));
		process.exit(2);
	}

	const copies = graphqlCopies(readJson(join(sandbox, "package-lock.json")));
	const single = copies.length === 1 && Number.parseInt(copies[0].version, 10) >= 17;

	if (single) {
		console.log(`graphql 17 now resolves to a SINGLE copy (${copies[0].version}) — UNBLOCKED.`);
		console.log("");
		console.log("Next: bump @apollo/server first and verify on its own, then graphql in BOTH");
		console.log("apps/api and apps/web in one commit, regenerate the lockfile, and confirm");
		console.log("`npm ls graphql` reports exactly one copy at 17.x before trusting anything.");
		process.exit(1);
	}

	report(
		readJson(join(repo, "package-lock.json")),
		`npm would split the tree into ${copies.length} copies: ` +
			copies
				.map(
					(c) => `${c.path.replace(/node_modules\/graphql$/, "") || "root"}→${c.version}`
				)
				.join(", ")
	);
	process.exit(0);
} finally {
	rmSync(sandbox, { recursive: true, force: true });
}

function report(lock, why) {
	console.log(`graphql 17 is still blocked — ${why}.`);
	console.log("");
	console.log("Packages whose graphql peer range excludes 17:");
	for (const b of blockers(lock)) console.log(`  ${b.name.padEnd(46)} ${b.range}`);
}
