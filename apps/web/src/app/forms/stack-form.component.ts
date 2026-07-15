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
import { IconComponent } from "../shared/icon.component";
import { MUTATION_CREATE_STACK, QUERY_STACKS } from "../core/graphql.queries";

const COMPOSE_PLACEHOLDER = `version: "3.9"
services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
networks:
  default:
    driver: overlay
`;

/**
 * Modal form to deploy a new stack from a Compose file pasted by the operator.
 */
@Component({
	selector: "sb-stack-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			wide
			[title]="'forms.stack.title' | transloco"
			[subtitle]="'forms.stack.subtitle' | transloco"
		>
			<div class="field">
				<label class="field__label"
					>{{ "forms.stack.name" | transloco }}<span class="req">*</span></label
				>
				<input class="input" [formField]="stackForm.name" />
				<div class="field__error" *ngIf="error()">{{ error() }}</div>
			</div>
			<div class="field">
				<label class="field__label">{{ "forms.stack.content" | transloco }}</label>
				<textarea
					class="textarea"
					rows="14"
					[placeholder]="placeholder"
					[formField]="stackForm.content"
				></textarea>
			</div>
			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="!stackForm().valid()"
				>
					<sb-icon name="play" [size]="14"></sb-icon> Deploy
				</button>
			</ng-container>
		</sb-modal>
	`,
	imports: [NgIf, FormField, ModalComponent, IconComponent, TranslocoPipe],
})
export class StackFormComponent {
	/** Whether the deploy-stack modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without deploying. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful deploy with the new stack name. */
	@Output() created = new EventEmitter<{ name: string }>();

	readonly placeholder = COMPOSE_PLACEHOLDER;
	readonly error = signal("");
	private readonly apollo = inject(Apollo);

	private readonly model = signal({ name: "", content: "" });
	readonly stackForm = form(this.model, (f) => {
		required(f.name);
	});

	onClose(): void {
		this.model.set({ name: "", content: "" });
		this.error.set("");
		this.close.emit();
	}

	submit(): void {
		const { name, content } = this.model();
		if (!name.trim()) {
			return;
		}
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_STACK,
				variables: { input: { name, composeYaml: content } },
				refetchQueries: [{ query: QUERY_STACKS }],
			})
			.subscribe(() => {
				this.created.emit({ name });
				this.onClose();
			});
	}
}
