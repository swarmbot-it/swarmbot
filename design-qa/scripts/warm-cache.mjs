/**
 * Populates `.netcache/` so later runs never touch the network.
 *
 * Uses the same sha1(url) key scheme as `tests/helpers/net.ts` — this script and
 * that helper are two writers of one cache, so the scheme must stay in step.
 * Run once with network access; after that the suite is hermetic.
 */
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const CACHE_DIR = fileURLToPath(new URL("../.netcache/", import.meta.url));
const PORT = Number(process.env.DESIGN_QA_PORT ?? 4321);
const HOST = process.env.DESIGN_QA_HOST ?? "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

const PATTERNS = [
	"https://unpkg.com/**",
	"https://fonts.googleapis.com/**",
	"https://fonts.gstatic.com/**",
];

function writeAtomic(path, data) {
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, path);
}

mkdirSync(CACHE_DIR, { recursive: true });

const { default: server } = await import("./static-server.mjs").then((m) => ({ default: m }));
void server; // starting the module boots the server on import

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 1,
});

let stored = 0;
for (const pattern of PATTERNS) {
	await page.route(pattern, async (route) => {
		const url = route.request().url();
		const key = createHash("sha1").update(url).digest("hex");
		const response = await route.fetch();
		const body = await response.body();

		writeAtomic(join(CACHE_DIR, `${key}.bin`), body);
		writeAtomic(
			join(CACHE_DIR, `${key}.json`),
			JSON.stringify(
				{
					url,
					status: response.status(),
					contentType: response.headers()["content-type"] ?? "",
				},
				null,
				2
			)
		);
		stored++;
		await route.fulfill({ response, body });
	});
}

// The admin shell pulls React/Babel plus both typefaces; the login screen pulls a
// second Google Fonts subset. Between them they cover every third-party request.
for (const path of ["/SwarmBot%20Admin.html?demo=1", "/demo-login.html"]) {
	await page.goto(`${BASE_URL}${path}`);
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

await browser.close();
console.log(`cached ${stored} third-party responses in ${CACHE_DIR}`);
process.exit(0);
