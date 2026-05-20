import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
	signal,
} from "@angular/core";
import { NgIf } from "@angular/common";
import { form, FormField, required } from "@angular/forms/signals";
import { TranslocoPipe } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { ModalComponent } from "../shared/modal.component";
import { MUTATION_CREATE_SECRET, QUERY_SECRETS } from "../core/graphql.queries";

/**
 * Modal form to create a Swarm secret (name and opaque payload).
 */
@Component({
	selector: "sb-secret-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			wide
			[title]="'forms.secret.title' | transloco"
			subtitle=""
		>
			<div class="field">
				<label class="field__label"
					>{{ "forms.secret.name" | transloco }}<span class="req">*</span></label
				>
				<input class="input" [formField]="secretForm.name" />
			</div>
			<div class="field">
				<label class="field__label">{{ "forms.secret.content" | transloco }}</label>
				<textarea
					class="textarea"
					rows="8"
					style="font-family: var(--font-mono)"
					[formField]="secretForm.content"
				></textarea>
			</div>
			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="!secretForm().valid()"
				>
					{{ "common.create" | transloco }}
				</button>
			</ng-container>
		</sb-modal>
	`,
	imports: [FormField, ModalComponent, TranslocoPipe],
})
export class SecretFormComponent {
	/** Whether the create-secret modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful create with the new secret name. */
	@Output() created = new EventEmitter<{ name: string }>();

	private readonly apollo = inject(Apollo);
	private readonly model = signal({ name: "", content: "" });
	readonly secretForm = form(this.model, (f) => {
		required(f.name);
	});

	onClose(): void {
		this.model.set({ name: "", content: "" });
		this.close.emit();
	}

	submit(): void {
		const { name, content } = this.model();
		if (!name.trim()) return;
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_SECRET,
				variables: { input: { name, content } },
				refetchQueries: [{ query: QUERY_SECRETS }],
			})
			.subscribe(() => {
				this.created.emit({ name });
				this.onClose();
			});
	}
}
