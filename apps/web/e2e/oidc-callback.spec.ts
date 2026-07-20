import { test, expect } from "./fixtures";

/**
 * Browser-level regression for the OIDC redirect loop. The API hands the session
 * token to the SPA at `/app/oidc#token=…&to=…`; that route must run, store the
 * token and land inside the shell — not fall through to /login and re-loop.
 *
 * Rather than stand up a full IdP we mint a real session token through the
 * (proxied) GraphQL login and replay it via the OIDC callback URL exactly as the
 * server would after Dex. Minting via the API keeps this independent of the
 * login form.
 */
test.describe("OIDC callback route", () => {
	test("a token in the fragment logs the user straight into the shell", async ({
		page,
		baseURL,
	}) => {
		const res = await page.request.post(`${baseURL}/graphql`, {
			data: {
				query: "mutation($u:String!,$p:String!){ login(username:$u,password:$p){ token } }",
				variables: { u: "admin", p: "swarmbot" },
			},
		});
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { data?: { login?: { token?: string } } };
		const raw = String(body.data?.login?.token ?? "").replace(/^Bearer\s+/i, "");
		expect(raw.length).toBeGreaterThan(0);

		// Fresh session; the token arrives only in the fragment, as the API sends it.
		await page.goto(`/app/oidc#token=${encodeURIComponent(raw)}&to=/services`);

		await expect(page).toHaveURL(/\/app\/services/, { timeout: 30_000 });
		await expect(page.locator("h1.page-header__title")).toBeVisible();
	});

	test("a missing token falls back to the login page instead of looping", async ({ page }) => {
		await page.goto("/app/oidc#state=only", { waitUntil: "domcontentloaded" });
		await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
		await expect(page.locator(".login-card")).toBeVisible();
	});
});
