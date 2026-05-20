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

/** Application-wide dependency injection configuration. */
export const appConfig: ApplicationConfig = {
	providers: [
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(routes),
		provideHttpClient(withInterceptors([i18nInterceptor])),
		provideAnimationsAsync(),
		providePrimeNG({
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
				defaultLang: "pl",
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
