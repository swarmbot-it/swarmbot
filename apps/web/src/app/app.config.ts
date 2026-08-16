/**
 * Root application providers: routing, HTTP, Apollo GraphQL, Optimus UI, Transloco i18n.
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
import { provideOptimus } from "@openng/optimus-ui/config";
import Aura from "@openng/optimus-ui-themes/aura";
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

/**
 * Application-wide dependency injection configuration.
 *
 * Kept as a factory (rather than a const) only so bootstrap stays a single call
 * shape. It used to take a license key fetched from the API before bootstrap;
 * Optimus UI is MIT and has no license gate, so that round-trip is gone.
 */
export function appConfig(): ApplicationConfig {
	return {
		providers: [
			provideZoneChangeDetection({ eventCoalescing: true }),
			provideRouter(routes),
			provideHttpClient(withInterceptors([i18nInterceptor])),
			provideAnimationsAsync(),
			provideOptimus({
				ripple: true,
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
