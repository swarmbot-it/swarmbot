import { Injectable, signal } from "@angular/core";

/** Color scheme applied via `data-theme` on `<html>`. */
export type Theme = "light" | "dark";

const KEY = "sw4rm.bot.theme";

/**
 * Persists the light/dark theme choice in localStorage and reflects it
 * on <html data-theme="..."> so CSS variables in styles.scss kick in.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
	private readonly _theme = signal<Theme>(this.readInitial());
	/** Current theme signal for templates. */
	readonly theme = this._theme.asReadonly();

	constructor() {
		this.apply(this._theme());
	}

	/** Sets theme, updates DOM, and persists to `sw4rm.bot.theme`. */
	set(theme: Theme): void {
		this._theme.set(theme);
		this.apply(theme);
		try {
			localStorage.setItem(KEY, theme);
		} catch {
			/* ignore */
		}
	}

	/** Flips between light and dark. */
	toggle(): void {
		this.set(this._theme() === "dark" ? "light" : "dark");
	}

	private readInitial(): Theme {
		try {
			const stored = localStorage.getItem(KEY) as Theme | null;
			if (stored === "light" || stored === "dark") return stored;
		} catch {
			/* ignore */
		}
		if (
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-color-scheme: dark)").matches
		) {
			return "dark";
		}
		return "light";
	}

	private apply(theme: Theme): void {
		if (typeof document === "undefined") return;
		document.documentElement.setAttribute("data-theme", theme);
		document.documentElement.classList.toggle("app-dark", theme === "dark");
	}
}
