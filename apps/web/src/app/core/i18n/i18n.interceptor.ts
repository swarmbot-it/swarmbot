import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { I18nStateService } from "./i18n-state.service";

/**
 * Adds `Accept-Language` to every HTTP request (asset loads, REST, etc.)
 * using the locale from {@link I18nStateService}.
 */
export const i18nInterceptor: HttpInterceptorFn = (req, next) => {
	const locale = inject(I18nStateService).httpLocale();
	return next(
		req.clone({
			setHeaders: { "Accept-Language": locale },
		})
	);
};
