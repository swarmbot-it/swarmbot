import { inject } from "@angular/core";
import { I18nStateService } from "./i18n-state.service";

/**
 * Application initializer: loads i18n before the first route renders.
 * Must be registered with `provideAppInitializer(i18nInitializer)` (no call parentheses).
 *
 * @returns Promise resolved when the active language dictionary is loaded.
 */
export function i18nInitializer(): Promise<void> {
	return inject(I18nStateService).init();
}
