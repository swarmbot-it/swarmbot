/**
 * Zero-dependency static file server for the design mockup.
 *
 * Playwright's `webServer` boots this instead of `npx serve` / `http-server` so the
 * suite never has to reach the npm registry mid-run — one less source of drift for
 * pixel-perfect baselines. It also handles the space in "SwarmBot Admin.html"
 * without the quoting games a shell-based server would need.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../mockup/", import.meta.url));
const PORT = Number(process.env.DESIGN_QA_PORT ?? 4321);
const HOST = process.env.DESIGN_QA_HOST ?? "127.0.0.1";

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".jsx": "text/babel; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".ico": "image/x-icon",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

	if (url.pathname === "/health") {
		res.writeHead(200, { "content-type": "text/plain" });
		res.end("ok");
		return;
	}

	const decoded = decodeURIComponent(url.pathname);
	const relative = normalize(decoded === "/" ? "/index.html" : decoded).replace(/^([/\\])+/, "");

	// Refuse anything that climbs out of the mockup directory.
	if (relative.split(sep).includes("..")) {
		res.writeHead(403).end("forbidden");
		return;
	}

	const filePath = join(ROOT, relative);
	try {
		const info = await stat(filePath);
		if (!info.isFile()) throw new Error("not a file");
		res.writeHead(200, {
			"content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
			"content-length": info.size,
			// Deterministic runs beat warm caches — never let a stale asset survive a run.
			"cache-control": "no-store",
		});
		createReadStream(filePath).pipe(res);
	} catch {
		res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		res.end(`404 ${relative}`);
	}
});

server.listen(PORT, HOST, () => {
	console.log(`design-qa mockup served at http://${HOST}:${PORT}/`);
});
