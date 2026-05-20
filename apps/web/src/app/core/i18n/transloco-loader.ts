import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Translation, TranslocoLoader } from "@jsverse/transloco";
import { Observable } from "rxjs";

/**
 * Loads Transloco JSON dictionaries from `/assets/i18n/{lang}.json`.
 */
@Injectable({ providedIn: "root" })
export class TranslocoHttpLoader implements TranslocoLoader {
	private readonly http = inject(HttpClient);

	/**
	 * @param lang - Language code (`pl` or `en`).
	 * @returns Observable of the parsed translation tree.
	 */
	getTranslation(lang: string): Observable<Translation> {
		return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
	}
}
