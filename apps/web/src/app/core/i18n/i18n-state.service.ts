import { inject, Injectable, signal, computed } from "@angular/core";
import { TranslocoService } from "@jsverse/transloco";
import { firstValueFrom } from "rxjs";
import { PrimeNG } from "primeng/config";

/** Supported UI language codes. */
export type LangCode = "pl" | "en";

const STORAGE_KEY = "swarmboty.lang";
const HTTP_LOCALE: Record<LangCode, string> = {
	pl: "pl-PL",
	en: "en-US",
};

/**
 * Coordinates UI language: Transloco dictionaries, PrimeNG labels,
 * `document.documentElement.lang`, and the `Accept-Language` header locale.
 */
@Injectable({ providedIn: "root" })
export class I18nStateService {
	private readonly transloco = inject(TranslocoService);
	private readonly primeNG = inject(PrimeNG);

	/** Active language code (`pl` or `en`). */
	readonly activeLang = signal<LangCode>(this.readInitialLang());

	/** BCP 47 tag sent on HTTP/GraphQL requests (e.g. `pl-PL`). */
	readonly httpLocale = computed(() => HTTP_LOCALE[this.activeLang()]);

	/**
	 * Loads dictionaries and applies PrimeNG + document language during bootstrap.
	 * Invoked from {@link i18nInitializer}.
	 */
	async init(): Promise<void> {
		const lang = this.activeLang();
		this.transloco.setActiveLang(lang);
		await firstValueFrom(this.transloco.load(lang));
		this.applyDocumentLang(lang);
		this.applyPrimeNgTranslations();
	}

	/**
	 * Switches language, persists choice, and reloads translations.
	 * @param code - Target language.
	 */
	async setLanguage(code: LangCode): Promise<void> {
		if (this.activeLang() === code) return;
		this.activeLang.set(code);
		try {
			localStorage.setItem(STORAGE_KEY, code);
		} catch {
			/* ignore */
		}
		this.transloco.setActiveLang(code);
		await firstValueFrom(this.transloco.load(code));
		this.applyDocumentLang(code);
		this.applyPrimeNgTranslations();
	}

	private applyPrimeNgTranslations(): void {
		const raw = this.transloco.getTranslation(this.activeLang())?.["primeng"];
		if (raw && typeof raw === "object") {
			this.primeNG.setTranslation(raw as Record<string, unknown>);
		}
	}

	private readInitialLang(): LangCode {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === "pl" || stored === "en") return stored;
		} catch {
			/* ignore */
		}
		if (typeof navigator !== "undefined") {
			const nav = navigator.language?.toLowerCase() ?? "";
			if (nav.startsWith("pl")) return "pl";
		}
		return "en";
	}

	private applyDocumentLang(code: LangCode): void {
		if (typeof document === "undefined") return;
		document.documentElement.lang = code;
	}
}
