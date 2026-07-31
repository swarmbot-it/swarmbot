/**
 * Browser entry point. Fetches runtime UI settings (served by the API from
 * server-side env) and bootstraps the standalone root component with the
 * resulting {@link appConfig}. The PrimeNG license must be known synchronously
 * at provider-construction time, so it is fetched here — before bootstrap —
 * rather than in an app initializer (those run in parallel and would race the
 * PrimeNG license verification).
 */
import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig, type UiRuntimeConfig } from "./app/app.config";
import { AppComponent } from "./app/app.component";

async function loadUiConfig(): Promise<UiRuntimeConfig> {
	try {
		const res = await fetch("/api/ui-config", { headers: { Accept: "application/json" } });
		if (!res.ok) return {};
		return (await res.json()) as UiRuntimeConfig;
	} catch {
		// Offline/degraded API: bootstrap unlicensed rather than not at all.
		return {};
	}
}

loadUiConfig().then((ui) =>
	bootstrapApplication(AppComponent, appConfig(ui)).catch((err) => console.error(err)),
);
