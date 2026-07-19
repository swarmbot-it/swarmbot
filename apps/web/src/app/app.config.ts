/**
 * Root application providers: routing, HTTP, Apollo GraphQL, PrimeNG, Transloco i18n.
 * @module app.config
 */
import {
	ApplicationConfig,
	inject,
	provideAppInitializer,
	provideZoneChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeuix/themes/aura";
import { provideApollo } from "apollo-angular";
import { HttpLink } from "apollo-angular/http";
import { InMemoryCache } from "@apollo/client/core";
import { ApolloLink } from "@apollo/client/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideTransloco } from "@jsverse/transloco";
import { isDevMode } from "@angular/core";

import { routes } from "./app.routes";
import { TranslocoHttpLoader } from "./core/i18n/transloco-loader";
import { createApolloAuthLinks } from "./core/apollo-auth.link";
import { i18nInterceptor } from "./core/i18n/i18n.interceptor";
import { i18nInitializer } from "./core/i18n/i18n.initializer";
import { LANG_CODES } from "./core/i18n/i18n-languages";

/** Runtime UI settings fetched from the server before bootstrap (see main.ts). */
export type UiRuntimeConfig = {
	/** PrimeNG (PrimeUI) license key; empty/undefined leaves PrimeNG unlicensed. */
	primengLicense?: string;
};

/**
 * Application-wide dependency injection configuration.
 * Built as a factory so the PrimeNG license (served from the API at runtime)
 * can be injected synchronously into providePrimeNG — Angular initializers run
 * in parallel, so registering the key any later than this races the banner.
 */
export function appConfig(ui: UiRuntimeConfig = {}): ApplicationConfig {
	return {
	providers: [
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(routes),
		provideHttpClient(withInterceptors([i18nInterceptor])),
		provideAnimationsAsync(),
		providePrimeNG({
			ripple: true,
			license: ui.primengLicense || undefined,
			theme: {
				preset: Aura,
				options: {
					darkModeSelector: ".app-dark",
				},
			},
		}),
		provideTransloco({
			config: {
				availableLangs: [...LANG_CODES],
				defaultLang: "en",
				reRenderOnLangChange: true,
				prodMode: !isDevMode(),
			},
			loader: TranslocoHttpLoader,
		}),
		provideAppInitializer(i18nInitializer),
		provideApollo(() => ({
			link: ApolloLink.from([
				createApolloAuthLinks(),
				inject(HttpLink).create({ uri: "/graphql" }),
			]),
			cache: new InMemoryCache(),
		})),
	],
	};
}
