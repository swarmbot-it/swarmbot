import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Output,
	inject,
	signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AsyncPipe } from "@angular/common";
import { TranslocoService } from "@jsverse/transloco";
import { map } from "rxjs/operators";
import type { Observable } from "rxjs";

import { BootService } from "../../core/boot.service";

/**
 * Full-screen splash shown during the initial cluster data fetch.
 * Step texts are translated via Transloco using keys from BootService.
 * Emits (destroyed) after its fade-out animation finishes so the
 * host can remove it from the DOM.
 */
@Component({
	selector: "sb-boot-loader",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [AsyncPipe],
	styleUrls: ["./boot-loader.component.scss"],
	template: `
		<div
			class="sb-boot"
			[class.sb-boot--leaving]="leaving()"
			[class.sb-boot--refresh]="refreshing$ | async"
			role="status"
			aria-live="polite"
			[attr.aria-busy]="!leaving()"
		>
			<div class="sb-boot__stage">
				<svg class="sb-boot__mark" viewBox="0 0 32 32" fill="none" aria-label="Loading">
					<line class="sb-blink sb-blink--1" x1="12"   y1="16"   x2="15.7" y2="9.4"  stroke="#F97316" stroke-width="1.2" stroke-linecap="round"/>
					<line class="sb-blink sb-blink--2" x1="12"   y1="16"   x2="15.7" y2="22.6" stroke="#F97316" stroke-width="1.2" stroke-linecap="round"/>
					<line class="sb-blink sb-blink--3" x1="20.3" y1="9.4"  x2="23"   y2="14"   stroke="#F97316" stroke-width="1.2" stroke-linecap="round"/>
					<line class="sb-blink sb-blink--4" x1="20.3" y1="22.6" x2="23"   y2="18"   stroke="#F97316" stroke-width="1.2" stroke-linecap="round"/>
					<circle class="sb-bdot sb-bdot--center" cx="9"  cy="16" r="3.4" fill="#F97316"/>
					<circle class="sb-bdot sb-bdot--top"    cx="18" cy="9"  r="2.4" fill="#FB923C"/>
					<circle class="sb-bdot sb-bdot--bottom" cx="18" cy="23" r="2.4" fill="#FB923C"/>
					<circle class="sb-bdot sb-bdot--right"  cx="25" cy="16" r="2.8" fill="#EA580C"/>
				</svg>

				<div class="sb-boot__title">swarm<span>boty</span></div>

				<div class="sb-boot__progress">
					<div class="sb-boot__progress-bar" [style.width.%]="progressPct$ | async"></div>
				</div>

				<div class="sb-boot__sub">
					<span>{{ statusText$ | async }}</span>
					<span class="sb-boot__sep">·</span>
					<span class="sb-boot__pct">{{ progressPct$ | async }}%</span>
				</div>
			</div>
		</div>
	`,
})
export class BootLoaderComponent {
	@Output() readonly destroyed = new EventEmitter<void>();

	private readonly boot = inject(BootService);
	private readonly transloco = inject(TranslocoService);

	readonly leaving = signal(false);
	private _leaveTimer?: ReturnType<typeof setTimeout>;

	readonly refreshing$ = this.boot.refreshing$;

	readonly progressPct$: Observable<number> = this.boot.step$.pipe(
		map((step) => Math.round(((step + 1) / this.boot.stepKeys.length) * 100))
	);

	readonly statusText$: Observable<string> = this.boot.step$.pipe(
		map((step) =>
			this.transloco.translate(
				this.boot.stepKeys[Math.min(step, this.boot.stepKeys.length - 1)]
			)
		)
	);

	constructor() {
		this.boot.ready$.pipe(takeUntilDestroyed()).subscribe((ready) => {
			if (ready) {
				this.leaving.set(true);
				this._leaveTimer = setTimeout(() => this.destroyed.emit(), 350);
			} else {
				// ready$ flipped back to false (e.g. refresh started during fade-out)
				// — cancel the pending destroy and stay visible
				clearTimeout(this._leaveTimer);
				this.leaving.set(false);
			}
		});
	}
}
