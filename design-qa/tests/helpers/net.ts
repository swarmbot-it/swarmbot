/**
 * Third-party asset cache.
 *
 * The mockup pulls React, ReactDOM and Babel from unpkg and its two typefaces
 * from Google Fonts. Both are fatal for pixel-perfect work: no React means no
 * render at all, and a missing webfont silently reflows every label into a
 * fallback face. This routes those three hosts through an on-disk cache — the
 * first run populates it from the network, every later run replays the exact
 * same bytes, so baselines stop depending on what a CDN served that morning.
 *
 * Replaying byte-for-byte also keeps the `integrity="sha384-…"` attributes on
 * the unpkg <script> tags valid; rewriting the payload would break them.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export const CACHE_DIR = fileURLToPath(new URL("../../.netcache/", import.meta.url));

const THIRD_PARTY_HOSTS = [
	"https://unpkg.com/**",
	"https://fonts.googleapis.com/**",
	"https://fonts.gstatic.com/**",
];

interface CacheMeta {
	url: string;
	status: number;
	contentType: string;
}

const keyFor = (url: string) => createHash("sha1").update(url).digest("hex");

/** Write via temp file + rename so parallel workers can't observe a half-written entry. */
function writeAtomic(path: string, data: Buffer | string) {
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, path);
}

export async function installThirdPartyCache(page: Page): Promise<void> {
	mkdirSync(CACHE_DIR, { recursive: true });

	for (const pattern of THIRD_PARTY_HOSTS) {
		await page.route(pattern, async (route) => {
			const url = route.request().url();
			const key = keyFor(url);
			const bodyPath = join(CACHE_DIR, `${key}.bin`);
			const metaPath = join(CACHE_DIR, `${key}.json`);

			if (existsSync(bodyPath) && existsSync(metaPath)) {
				const meta = JSON.parse(readFileSync(metaPath, "utf8")) as CacheMeta;
				await route.fulfill({
					status: meta.status,
					contentType: meta.contentType || undefined,
					body: readFileSync(bodyPath),
				});
				return;
			}

			let response;
			try {
				response = await route.fetch();
			} catch (error) {
				// Offline with a cold cache. Let the request fail loudly rather than
				// serving a placeholder — a half-rendered page must not produce a baseline.
				throw new Error(
					`Could not fetch third-party asset ${url} and it is not in ${CACHE_DIR}. ` +
						`Run \`npm run warm\` once with network access. (${(error as Error).message})`
				);
			}

			const body = await response.body();
			writeAtomic(bodyPath, body);
			writeAtomic(
				metaPath,
				JSON.stringify(
					{
						url,
						status: response.status(),
						contentType: response.headers()["content-type"] ?? "",
					} satisfies CacheMeta,
					null,
					2
				)
			);
			await route.fulfill({ response, body });
		});
	}
}
