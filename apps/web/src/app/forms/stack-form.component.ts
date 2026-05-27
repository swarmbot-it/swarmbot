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
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { ModalComponent } from "../shared/modal.component";
import { IconComponent } from "../shared/icon.component";
import { MUTATION_CREATE_STACK, QUERY_STACKS } from "../core/graphql.queries";
import { ToastService } from "../core/toast.service";

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

type CreateStackResult = {
	createStack: { name: string; status: string };
};

function graphqlErrorMessage(err: unknown, fallback: string): string {
	if (err && typeof err === "object" && "graphQLErrors" in err) {
		const gql = (err as { graphQLErrors?: { message?: string }[] }).graphQLErrors;
		const first = gql?.[0]?.message?.trim();
		if (first) return first;
	}
	if (err instanceof Error && err.message.trim()) {
		return err.message.trim();
	}
	return fallback;
}

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
			</div>
			<div class="field">
				<label class="field__label"
					>{{ "forms.stack.content" | transloco }}<span class="req">*</span></label
				>
				<textarea
					class="textarea"
					rows="14"
					[placeholder]="placeholder"
					[formField]="stackForm.content"
				></textarea>
			</div>
			<div class="field__error" *ngIf="error()">{{ error() }}</div>
			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()" [disabled]="submitting()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="!stackForm().valid() || submitting()"
				>
					<sb-icon name="play" [size]="14"></sb-icon>
					{{ "forms.stack.deploy" | transloco }}
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
	readonly submitting = signal(false);
	private readonly apollo = inject(Apollo);
	private readonly toast = inject(ToastService);
	private readonly transloco = inject(TranslocoService);

	private readonly model = signal({ name: "", content: "" });
	readonly stackForm = form(this.model, (f) => {
		required(f.name);
		required(f.content);
	});

	onClose(): void {
		if (this.submitting()) return;
		this.model.set({ name: "", content: "" });
		this.error.set("");
		this.close.emit();
	}

	submit(): void {
		const { name, content } = this.model();
		const trimmedName = name.trim();
		const trimmedContent = content.trim();
		if (!trimmedName) {
			this.error.set(this.transloco.translate("forms.stack.errors.nameRequired"));
			return;
		}
		if (!trimmedContent) {
			this.error.set(this.transloco.translate("forms.stack.errors.contentRequired"));
			return;
		}

		this.error.set("");
		this.submitting.set(true);

		this.apollo
			.mutate<CreateStackResult>({
				mutation: MUTATION_CREATE_STACK,
				variables: { input: { name: trimmedName, composeYaml: content } },
				refetchQueries: [{ query: QUERY_STACKS }],
			})
			.subscribe({
				next: (res) => {
					const stack = res.data?.createStack;
					const stackName = stack?.name ?? trimmedName;
					const status = stack?.status ?? "—";
					this.toast.push(
						"success",
						this.transloco.translate("forms.stack.toast.success", {
							name: stackName,
							status,
						})
					);
					this.submitting.set(false);
					this.created.emit({ name: stackName });
					this.model.set({ name: "", content: "" });
					this.error.set("");
					this.close.emit();
				},
				error: (err) => {
					const msg = graphqlErrorMessage(
						err,
						this.transloco.translate("forms.stack.toast.failed")
					);
					this.error.set(msg);
					this.toast.push("error", msg);
					this.submitting.set(false);
				},
			});
	}
}
