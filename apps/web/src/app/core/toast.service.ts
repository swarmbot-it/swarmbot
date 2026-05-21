import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

export type ToastLevel = "error" | "warn" | "success";

export interface Toast {
	id: number;
	level: ToastLevel;
	message: string;
	hiding: boolean;
}

const MAX_VISIBLE = 5;
const TTL_ERROR = 8000;
const TTL_WARN = 5000;
const EXIT_MS = 320;

// Internal framework noise that should never surface as user-facing toasts.
const IGNORED = [
	/missing translation for/i,
	/^\[Transloco\]/i,
	/^\[NG\d/i,
];

/**
 * Captures console.error and console.warn calls and exposes them as a
 * reactive stack of dismissable toasts. Constructed eagerly in AppComponent
 * so patching happens before any app code runs.
 *
 * Deduplication: identical messages already on screen are silently ignored.
 * Stack cap: oldest entry is removed when MAX_VISIBLE is exceeded.
 */
@Injectable({ providedIn: "root" })
export class ToastService {
	private _idSeq = 0;
	private _inside = false;
	private readonly _toasts$ = new BehaviorSubject<Toast[]>([]);

	readonly toasts$ = this._toasts$.asObservable();

	constructor() {
		this._patch();
	}

	/** Programmatically push a toast (bypasses console interception). */
	push(level: ToastLevel, message: string): void {
		if (!this._inside) {
			this._inside = true;
			this._add(level, message);
			this._inside = false;
		}
	}

	dismiss(id: number): void {
		this._toasts$.next(
			this._toasts$.value.map((t) => (t.id === id ? { ...t, hiding: true } : t))
		);
		setTimeout(
			() => this._toasts$.next(this._toasts$.value.filter((t) => t.id !== id)),
			EXIT_MS
		);
	}

	private _patch(): void {
		const origError = console.error.bind(console);
		const origWarn = console.warn.bind(console);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		console.error = (...args: any[]) => {
			origError(...args);
			if (!this._inside) {
				this._inside = true;
				this._add("error", this._format(args));
				this._inside = false;
			}
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		console.warn = (...args: any[]) => {
			origWarn(...args);
			if (!this._inside) {
				this._inside = true;
				this._add("warn", this._format(args));
				this._inside = false;
			}
		};
	}

	private _format(args: unknown[]): string {
		const first = args[0];
		let msg: string;
		if (first instanceof Error) {
			msg = first.message;
		} else if (typeof first === "string") {
			msg = first;
		} else {
			try {
				msg = JSON.stringify(first);
			} catch {
				msg = String(first);
			}
		}
		// First non-empty line, capped at 220 chars
		return (msg.split("\n").find((l) => l.trim().length > 0) ?? msg).slice(0, 220);
	}

	private _add(level: ToastLevel, message: string): void {
		if (!message.trim()) return;
		if (IGNORED.some((re) => re.test(message))) return;

		const current = this._toasts$.value;

		// Deduplicate: skip if the same message is already visible
		if (current.some((t) => t.message === message)) return;

		const id = ++this._idSeq;

		// Drop oldest if at cap
		const trimmed = current.length >= MAX_VISIBLE ? current.slice(1) : current;
		this._toasts$.next([...trimmed, { id, level, message, hiding: false }]);

		setTimeout(() => this.dismiss(id), level === "error" ? TTL_ERROR : TTL_WARN);
	}
}
