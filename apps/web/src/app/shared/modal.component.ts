import {
	booleanAttribute,
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	HostListener,
	Input,
	Output,
} from "@angular/core";
import { NgIf } from "@angular/common";
import { IconComponent } from "./icon.component";

/**
 * Generic modal dialog used by every "create" form on the admin panel.
 * Backdrop click and Escape both close it, matching the design.
 */
@Component({
	selector: "sb-modal",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="sb-modal-backdrop" *ngIf="open" (mousedown)="onBackdrop($event)">
			<div
				class="sb-modal"
				[class.sb-modal--wide]="wide"
				(mousedown)="$event.stopPropagation()"
			>
				<div class="sb-modal__header">
					<div>
						<div class="sb-modal__title">{{ title }}</div>
						<div class="sb-modal__subtitle" *ngIf="subtitle">{{ subtitle }}</div>
					</div>
					<button class="sb-modal__close" (click)="close.emit()" aria-label="Close">
						<sb-icon name="close" [size]="16" [strokeWidth]="2.5"></sb-icon>
					</button>
				</div>
				<div class="sb-modal__body">
					<ng-content></ng-content>
				</div>
				<div class="sb-modal__footer" *ngIf="hasFooter">
					<ng-content select="[modal-footer]"></ng-content>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.sb-modal-backdrop {
				position: fixed;
				inset: 0;
				background: rgba(15, 23, 42, 0.45);
				backdrop-filter: blur(4px);
				z-index: 100;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 24px;
				animation: sb-fade 0.15s ease-out;
			}
			:host-context([data-theme="dark"]) .sb-modal-backdrop {
				background: rgba(0, 0, 0, 0.6);
			}
			.sb-modal {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-xl);
				width: 100%;
				max-width: 560px;
				max-height: calc(100vh - 48px);
				display: flex;
				flex-direction: column;
				box-shadow: var(--shadow-3);
				animation: sb-pop 0.18s cubic-bezier(0.2, 0.9, 0.4, 1.1);
			}
			.sb-modal--wide {
				max-width: 720px;
			}
			.sb-modal__header {
				padding: 18px 22px;
				border-bottom: 1px solid var(--border);
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 16px;
			}
			.sb-modal__title {
				font-size: 16px;
				font-weight: 700;
			}
			.sb-modal__subtitle {
				font-size: 12.5px;
				color: var(--muted);
				margin-top: 3px;
			}
			.sb-modal__close {
				background: transparent;
				border: none;
				cursor: pointer;
				color: var(--muted);
				width: 28px;
				height: 28px;
				border-radius: var(--r-md);
				display: flex;
				align-items: center;
				justify-content: center;
			}
			.sb-modal__close:hover {
				background: var(--surface-hover);
				color: var(--text);
			}
			.sb-modal__body {
				padding: 22px;
				overflow-y: auto;
				display: flex;
				flex-direction: column;
				gap: 16px;
			}
			.sb-modal__footer {
				padding: 14px 22px;
				border-top: 1px solid var(--border);
				display: flex;
				justify-content: flex-end;
				gap: 10px;
			}
			@keyframes sb-fade {
				from {
					opacity: 0;
				}
				to {
					opacity: 1;
				}
			}
			@keyframes sb-pop {
				from {
					opacity: 0;
					transform: scale(0.96) translateY(8px);
				}
				to {
					opacity: 1;
					transform: scale(1) translateY(0);
				}
			}
		`,
	],
	imports: [NgIf, IconComponent],
})
export class ModalComponent {
	/** Whether the dialog and backdrop are shown. */
	@Input({ transform: booleanAttribute }) open = false;
	/** Primary heading in the modal header. */
	@Input() title = "";
	/** Optional secondary line under the title. */
	@Input() subtitle?: string;
	/** Uses the wide layout variant for forms with more fields. */
	@Input({ transform: booleanAttribute }) wide = false;
	/** Renders the footer slot when true (set false for header-only dialogs). */
	@Input({ transform: booleanAttribute }) hasFooter = true;
	/** Emitted on backdrop click, Escape, or the close button. */
	@Output() close = new EventEmitter<void>();

	onBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) {
			this.close.emit();
		}
	}

	@HostListener("document:keydown.escape")
	onEscape(): void {
		if (this.open) this.close.emit();
	}
}
