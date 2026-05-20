import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
	signal,
} from "@angular/core";
import { form, FormField, required } from "@angular/forms/signals";
import { TranslocoPipe } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { ModalComponent } from "../shared/modal.component";
import { KvEditorComponent, type KvPair } from "../shared/kv-editor.component";
import { MUTATION_CREATE_VOLUME, QUERY_VOLUMES } from "../core/graphql.queries";

/**
 * Modal form to create a new Swarm volume (name, driver, and optional labels).
 */
@Component({
	selector: "sb-volume-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			[title]="'forms.volume.title' | transloco"
			subtitle=""
		>
			<div style="display:grid; grid-template-columns: 2fr 1fr; gap: 14px;">
				<div class="field">
					<label class="field__label"
						>{{ "forms.volume.name" | transloco }}<span class="req">*</span></label
					>
					<input class="input" [formField]="volumeForm.name" />
				</div>
				<div class="field">
					<label class="field__label"
						>{{ "forms.volume.driver" | transloco }}<span class="req">*</span></label
					>
					<select class="input select" [formField]="volumeForm.driver">
						<option value="local">local</option>
						<option value="nfs">nfs</option>
						<option value="s3">s3</option>
						<option value="cifs">cifs</option>
						<option value="rexray">rexray</option>
					</select>
				</div>
			</div>
			<div class="field">
				<label class="field__label">{{ "forms.volume.labels" | transloco }}</label>
				<sb-kv-editor
					[items]="model().labels"
					(itemsChange)="setLabels($event)"
				></sb-kv-editor>
			</div>
			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="!volumeForm().valid()"
				>
					{{ "common.create" | transloco }}
				</button>
			</ng-container>
		</sb-modal>
	`,
	imports: [FormField, ModalComponent, KvEditorComponent, TranslocoPipe],
})
export class VolumeFormComponent {
	/** Whether the create-volume modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful create with the new volume name. */
	@Output() created = new EventEmitter<{ name: string }>();

	private readonly apollo = inject(Apollo);
	readonly model = signal({ name: "", driver: "local", labels: [] as KvPair[] });
	readonly volumeForm = form(this.model, (f) => {
		required(f.name);
		required(f.driver);
	});

	setLabels(labels: KvPair[]): void {
		this.model.update((m) => ({ ...m, labels }));
	}

	onClose(): void {
		this.model.set({ name: "", driver: "local", labels: [] });
		this.close.emit();
	}

	submit(): void {
		const v = this.model();
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_VOLUME,
				variables: { input: { name: v.name, driver: v.driver, labels: v.labels } },
				refetchQueries: [{ query: QUERY_VOLUMES }],
			})
			.subscribe(() => {
				this.created.emit({ name: v.name });
				this.onClose();
			});
	}
}
