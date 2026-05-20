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
import { MUTATION_CREATE_REGISTRY, QUERY_REGISTRIES } from "../core/graphql.queries";

/**
 * Modal form to connect a container image registry (URL, type, and credentials).
 */
@Component({
	selector: "sb-registry-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			[title]="'forms.registry.title' | transloco"
			subtitle=""
		>
			<div class="field">
				<label class="field__label"
					>{{ "forms.registry.name" | transloco }}<span class="req">*</span></label
				>
				<input class="input" [formField]="registryForm.name" />
			</div>
			<div style="display:grid; grid-template-columns: 2fr 1fr; gap: 14px;">
				<div class="field">
					<label class="field__label"
						>{{ "forms.registry.url" | transloco }}<span class="req">*</span></label
					>
					<input class="input mono" [formField]="registryForm.url" />
				</div>
				<div class="field">
					<label class="field__label"
						>{{ "forms.registry.type" | transloco }}<span class="req">*</span></label
					>
					<select class="input select" [formField]="registryForm.type">
						<option>Docker Hub</option>
						<option>GHCR</option>
						<option>ECR</option>
						<option>Harbor</option>
						<option>Quay</option>
						<option>GitLab</option>
					</select>
				</div>
			</div>
			<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px;">
				<div class="field">
					<label class="field__label">{{ "forms.registry.username" | transloco }}</label>
					<input class="input" [formField]="registryForm.user" />
				</div>
				<div class="field">
					<label class="field__label">{{ "forms.registry.password" | transloco }}</label>
					<input class="input" type="password" [formField]="registryForm.password" />
				</div>
			</div>
			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="!registryForm().valid()"
				>
					{{ "common.create" | transloco }}
				</button>
			</ng-container>
		</sb-modal>
	`,
	imports: [FormField, ModalComponent, TranslocoPipe],
})
export class RegistryFormComponent {
	/** Whether the connect-registry modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful create with the new registry name. */
	@Output() created = new EventEmitter<{ name: string }>();

	private readonly apollo = inject(Apollo);
	private readonly model = signal({
		name: "",
		url: "",
		type: "Docker Hub",
		user: "",
		password: "",
		default: false,
	});
	readonly registryForm = form(this.model, (f) => {
		required(f.name);
		required(f.url);
		required(f.type);
	});

	onClose(): void {
		this.model.set({
			name: "",
			url: "",
			type: "Docker Hub",
			user: "",
			password: "",
			default: false,
		});
		this.close.emit();
	}

	submit(): void {
		const data = this.model();
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_REGISTRY,
				variables: { input: { ...data } },
				refetchQueries: [{ query: QUERY_REGISTRIES }],
			})
			.subscribe(() => {
				this.created.emit({ name: data.name });
				this.onClose();
			});
	}
}
