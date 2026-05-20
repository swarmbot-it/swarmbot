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
import { MUTATION_CREATE_CONFIG, QUERY_CONFIGS } from "../core/graphql.queries";

/**
 * Modal form to create a Swarm config (name and file-like content).
 */
@Component({
	selector: "sb-config-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			wide
			[title]="'forms.config.title' | transloco"
			subtitle=""
		>
			<div class="field">
				<label class="field__label"
					>{{ "forms.config.name" | transloco }}<span class="req">*</span></label
				>
				<input class="input" [formField]="configForm.name" />
			</div>
			<div class="field">
				<label class="field__label">{{ "forms.config.content" | transloco }}</label>
				<textarea class="textarea" rows="12" [formField]="configForm.content"></textarea>
			</div>
			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="!configForm().valid()"
				>
					{{ "common.create" | transloco }}
				</button>
			</ng-container>
		</sb-modal>
	`,
	imports: [FormField, ModalComponent, TranslocoPipe],
})
export class ConfigFormComponent {
	/** Whether the create-config modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful create with the new config name. */
	@Output() created = new EventEmitter<{ name: string }>();

	private readonly apollo = inject(Apollo);
	private readonly model = signal({ name: "", content: "" });
	readonly configForm = form(this.model, (f) => {
		required(f.name);
	});

	onClose(): void {
		this.model.set({ name: "", content: "" });
		this.close.emit();
	}

	submit(): void {
		const { name, content } = this.model();
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_CONFIG,
				variables: { input: { name, content } },
				refetchQueries: [{ query: QUERY_CONFIGS }],
			})
			.subscribe(() => {
				this.created.emit({ name });
				this.onClose();
			});
	}
}
