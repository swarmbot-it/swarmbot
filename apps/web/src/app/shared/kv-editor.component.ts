import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
} from "@angular/core";
import { NgFor } from "@angular/common";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { IconComponent } from "./icon.component";

/** Key/value row used by {@link KvEditorComponent} for Docker labels and env pairs. */
export type KvPair = { k: string; v: string };

/**
 * Editable list of key/value pairs with add and remove rows (labels, env, etc.).
 */
@Component({
	selector: "sb-kv-editor",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="kv-list">
			<div *ngFor="let item of items; let i = index" class="kv-row">
				<input
					class="input"
					[placeholder]="keyPh"
					[value]="item.k"
					(input)="update(i, { k: inputValue($event) })"
				/>
				<input
					class="input"
					[placeholder]="valPh"
					[value]="item.v"
					(input)="update(i, { v: inputValue($event) })"
				/>
				<button
					class="btn btn--ghost btn--icon"
					(click)="remove(i)"
					[attr.aria-label]="'forms.kv.remove' | transloco"
				>
					<sb-icon name="trash" [size]="15"></sb-icon>
				</button>
			</div>
			<button class="kv-add" (click)="add()">+ {{ "forms.kv.add" | transloco }}</button>
		</div>
	`,
	styles: [
		`
			.kv-list {
				display: flex;
				flex-direction: column;
				gap: 8px;
			}
			.kv-row {
				display: grid;
				grid-template-columns: 1fr 1fr 36px;
				gap: 8px;
			}
			.kv-add {
				align-self: flex-start;
				font-size: 12px;
				color: var(--primary-600);
				background: none;
				border: 1px dashed var(--border-strong);
				border-radius: var(--r-md);
				padding: 6px 12px;
				font-weight: 600;
				cursor: pointer;
			}
			.kv-add:hover {
				background: var(--primary-50);
			}
			:host-context([data-theme="dark"]) .kv-add {
				color: var(--primary-400);
			}
			:host-context([data-theme="dark"]) .kv-add:hover {
				background: rgba(249, 115, 22, 0.1);
			}
		`,
	],
	imports: [NgFor, IconComponent, TranslocoPipe],
})
export class KvEditorComponent {
	private readonly transloco = inject(TranslocoService);

	/** Current rows bound to the key and value inputs. */
	@Input() items: KvPair[] = [];
	/** Placeholder for the key column (falls back to i18n). */
	@Input() keyPlaceholder = "";
	/** Placeholder for the value column (falls back to i18n). */
	@Input() valPlaceholder = "";
	/** Emitted when rows are added, edited, or removed. */
	@Output() itemsChange = new EventEmitter<KvPair[]>();

	get keyPh(): string {
		return this.keyPlaceholder || this.transloco.translate("forms.kv.key");
	}
	get valPh(): string {
		return this.valPlaceholder || this.transloco.translate("forms.kv.value");
	}

	inputValue(event: Event): string {
		return (event.target as HTMLInputElement).value;
	}

	update(i: number, patch: Partial<KvPair>): void {
		const next = this.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
		this.itemsChange.emit(next);
	}
	remove(i: number): void {
		this.itemsChange.emit(this.items.filter((_, idx) => idx !== i));
	}
	add(): void {
		this.itemsChange.emit([...this.items, { k: "", v: "" }]);
	}
}
