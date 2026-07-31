import { test as base, expect } from "@playwright/test";

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			localStorage.clear();
			sessionStorage.clear();
		});
		await use(page);
	},
});

export { expect };

// One session token for the whole (single-worker) run. Minted via a Node-side
// API request (no browser CORS, no rate-limit churn) and injected on every
// navigation — the page fixture clears storage on each load, so a one-off
// setItem would be wiped by the next goto. This keeps the many per-test logins
// reliable; the login form itself is exercised directly in login.spec.ts.
let cachedToken: string | null = null;

export async function loginAsAdmin(
	page: import("@playwright/test").Page,
	options?: { locale?: string }
): Promise<void> {
	if (!cachedToken) {
		const res = await page.request.post("/graphql", {
			data: {
				query: "mutation($u:String!,$p:String!){ login(username:$u,password:$p){ token } }",
				variables: { u: "admin", p: "swarmbot" },
			},
		});
		const body = (await res.json()) as { data?: { login?: { token?: string } } };
		const token = body.data?.login?.token;
		if (!token) throw new Error("loginAsAdmin: could not obtain a session token");
		cachedToken = String(token).startsWith("Bearer") ? token : `Bearer ${token}`;
	}
	await page.addInitScript(
		({ token, locale }) => {
			localStorage.setItem("swarmbot.token", token);
			// Seed the admin profile too — the form login fetches it via `me`, and
			// role-gated UI (e.g. the "Add" buttons) stays hidden without a role.
			localStorage.setItem(
				"swarmbot.profile",
				JSON.stringify({ username: "admin", name: "admin", role: "admin" })
			);
			if (locale) localStorage.setItem("swarmbot.lang", locale);
		},
		{ token: cachedToken, locale: options?.locale ?? null }
	);
	await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
	await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
}
