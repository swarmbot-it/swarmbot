import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	Input,
	Output,
	EventEmitter,
	inject,
	signal,
} from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { IconComponent } from "./icon.component";

export type SplitButtonAction = {
	id: string;
	label: string;
	icon?: string;
	primary?: boolean;
	danger?: boolean;
	separator?: boolean;
};

/**
 * Primary action + chevron dropdown (design spec: Edit default, Redeploy, Delete, …).
 */
@Component({
	selector: "sb-split-button",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="split-btn" #root>
			<button
				type="button"
				class="split-btn__main"
				[class.split-btn__main--primary]="primaryAction()?.primary !== false"
				(click)="onMain()"
			>
				<sb-icon *ngIf="primaryAction()?.icon" [name]="primaryAction()!.icon!" [size]="14"></sb-icon>
				{{ primaryAction()?.label }}
			</button>
			<button
				type="button"
				class="split-btn__toggle"
				[class.split-btn__toggle--primary]="primaryAction()?.primary !== false"
				(click)="toggleMenu($event)"
				[attr.aria-expanded]="open()"
			>
				<sb-icon name="chevronDown" [size]="14"></sb-icon>
			</button>
			<div class="split-btn__menu" *ngIf="open()">
				<ng-container *ngFor="let a of menuActions()">
					<div class="split-btn__sep" *ngIf="a.separator"></div>
					<button
						type="button"
						class="split-btn__item"
						[class.split-btn__item--danger]="a.danger"
						*ngIf="!a.separator"
						(click)="pick(a)"
					>
						<sb-icon *ngIf="a.icon" [name]="a.icon" [size]="14"></sb-icon>
						{{ a.label }}
					</button>
				</ng-container>
			</div>
		</div>
	`,
	styles: [
		`
			.split-btn {
				position: relative;
				display: inline-flex;
				align-items: stretch;
			}
			.split-btn__main,
			.split-btn__toggle {
				border: 1px solid var(--border);
				background: var(--surface);
				color: var(--text);
				font-size: 13px;
				font-weight: 600;
				cursor: pointer;
				display: inline-flex;
				align-items: center;
				gap: 8px;
				height: 36px;
				font-family: inherit;
			}
			.split-btn__main {
				border-radius: var(--r-md) 0 0 var(--r-md);
				padding: 0 14px;
			}
			.split-btn__toggle {
				border-left: none;
				border-radius: 0 var(--r-md) var(--r-md) 0;
				padding: 0 10px;
			}
			.split-btn__main--primary,
			.split-btn__toggle--primary {
				background: var(--primary-500);
				border-color: var(--primary-600);
				color: #fff;
			}
			.split-btn__main--primary:hover,
			.split-btn__toggle--primary:hover {
				background: var(--primary-600);
			}
			.split-btn__menu {
				position: absolute;
				top: calc(100% + 6px);
				right: 0;
				min-width: 180px;
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-md);
				box-shadow: var(--shadow-3);
				padding: 6px;
				z-index: 50;
				animation: split-pop 0.15s ease-out;
			}
			.split-btn__item {
				width: 100%;
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 8px 10px;
				border: none;
				background: transparent;
				border-radius: var(--r-sm);
				font-size: 13px;
				font-weight: 500;
				color: var(--text-2);
				cursor: pointer;
				text-align: left;
				font-family: inherit;
			}
			.split-btn__item:hover {
				background: var(--surface-hover);
				color: var(--text);
			}
			.split-btn__item--danger {
				color: var(--danger);
			}
			.split-btn__sep {
				height: 1px;
				background: var(--border);
				margin: 4px 0;
			}
			@keyframes split-pop {
				from {
					opacity: 0;
					transform: translateY(-4px) scale(0.98);
				}
				to {
					opacity: 1;
					transform: translateY(0) scale(1);
				}
			}
		`,
	],
	imports: [NgIf, NgFor, IconComponent],
})
export class SplitButtonComponent {
	@Input() actions: SplitButtonAction[] = [];
	@Output() action = new EventEmitter<string>();

	private readonly host = inject(ElementRef<HTMLElement>);
	readonly open = signal(false);

	primaryAction = () => this.actions.find((a) => a.primary) ?? this.actions[0];
	menuActions = () => this.actions.filter((a) => !a.primary);

	@HostListener("document:mousedown", ["$event"])
	onDocClick(ev: MouseEvent): void {
		if (!this.open()) return;
		if (!this.host.nativeElement.contains(ev.target as Node)) {
			this.open.set(false);
		}
	}

	onMain(): void {
		const p = this.primaryAction();
		if (p) this.action.emit(p.id);
	}

	toggleMenu(ev: Event): void {
		ev.stopPropagation();
		this.open.update((v) => !v);
	}

	pick(a: SplitButtonAction): void {
		this.open.set(false);
		this.action.emit(a.id);
	}
}
