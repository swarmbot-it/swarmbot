import { inject, Injectable, signal, computed } from "@angular/core";
import { TranslocoService } from "@jsverse/transloco";
import { firstValueFrom } from "rxjs";
import { PrimeNG } from "primeng/config";
import { httpLocaleFor, isLangCode, type LangCode } from "./i18n-languages";

const STORAGE_KEY = "swarmboty.lang";

/**
 * Coordinates UI language: Transloco dictionaries, PrimeNG labels,
 * `document.documentElement.lang`, and the `Accept-Language` header locale.
 */
@Injectable({ providedIn: "root" })
export class I18nStateService {
	private readonly transloco = inject(TranslocoService);
	private readonly primeNG = inject(PrimeNG);

	/** Active language code. */
	readonly activeLang = signal<LangCode>(this.readInitialLang());

	/** BCP 47 tag sent on HTTP/GraphQL requests (e.g. `pl-PL`). */
	readonly httpLocale = computed(() => httpLocaleFor(this.activeLang()));

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
		try {
			localStorage.setItem(STORAGE_KEY, code);
		} catch {
			/* ignore */
		}
		// Load the translation file first so that when the activeLang signal fires
		// and triggers a template re-render, all keys are already available.
		this.transloco.setActiveLang(code);
		await firstValueFrom(this.transloco.load(code));
		this.activeLang.set(code);
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
			if (isLangCode(stored)) return stored;
		} catch {
			/* ignore */
		}
		if (typeof navigator !== "undefined") {
			const nav = navigator.language?.toLowerCase() ?? "";
			if (nav.startsWith("pl")) return "pl";
			if (nav.startsWith("de")) return "de";
			if (nav.startsWith("fr")) return "fr";
			if (nav.startsWith("es")) return "es";
			if (nav.startsWith("it")) return "it";
			if (nav.startsWith("zh")) return "zh";
			if (nav.startsWith("ja")) return "ja";
			if (nav.startsWith("ko")) return "ko";
		}
		return "en";
	}

	private applyDocumentLang(code: LangCode): void {
		if (typeof document === "undefined") return;
		document.documentElement.lang = code === "zh" ? "zh-Hans" : code;
	}
}
