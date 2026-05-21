import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { AsyncPipe } from "@angular/common";
import { TranslocoPipe } from "@jsverse/transloco";
import { ToastService } from "../../core/toast.service";

/**
 * Fixed bottom-right stack of dismissable toast notifications.
 * Fed by ToastService which intercepts console.error / console.warn.
 */
@Component({
	selector: "sb-toast",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [AsyncPipe, TranslocoPipe],
	styleUrls: ["./toast.component.scss"],
	template: `
		<div class="toast-stack" aria-live="assertive" aria-atomic="false">
			@for (t of toastSvc.toasts$ | async; track t.id) {
				<div
					class="toast"
					[class.toast--error]="t.level === 'error'"
					[class.toast--warn]="t.level === 'warn'"
					[class.toast--success]="t.level === 'success'"
					[class.toast--hiding]="t.hiding"
					role="alert"
				>
					<span class="toast__icon" aria-hidden="true">
						{{ t.level === "error" ? "✕" : t.level === "success" ? "✓" : "⚠" }}
					</span>
					<span class="toast__msg">{{ t.message }}</span>
					<button
						class="toast__close"
						[attr.aria-label]="'toast.dismiss' | transloco"
						(click)="toastSvc.dismiss(t.id)"
					>×</button>
				</div>
			}
		</div>
	`,
})
export class ToastComponent {
	readonly toastSvc = inject(ToastService);
}
