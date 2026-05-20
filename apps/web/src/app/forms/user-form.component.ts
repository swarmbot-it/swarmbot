import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
	signal,
} from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { form, FormField, minLength, required } from "@angular/forms/signals";
import { TranslocoPipe } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { ModalComponent } from "../shared/modal.component";
import { MUTATION_CREATE_USER, QUERY_USERS } from "../core/graphql.queries";

type UserRole = "Read-only" | "Editor" | "Administrator";

type UserFormModel = {
	username: string;
	password: string;
	email: string;
	phone: string;
	role: UserRole;
};

const ROLES: { value: UserRole; nameKey: string; descKey: string }[] = [
	{
		value: "Read-only",
		nameKey: "forms.user.roles.readOnly",
		descKey: "forms.user.roles.readOnlyDesc",
	},
	{ value: "Editor", nameKey: "forms.user.roles.editor", descKey: "forms.user.roles.editorDesc" },
	{
		value: "Administrator",
		nameKey: "forms.user.roles.administrator",
		descKey: "forms.user.roles.administratorDesc",
	},
];

/**
 * Modal form to invite or create an application user with role and credentials.
 */
@Component({
	selector: "sb-user-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			[title]="'forms.user.title' | transloco"
			[subtitle]="'forms.user.subtitle' | transloco"
		>
			<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px;">
				<div class="field">
					<label class="field__label"
						>{{ "forms.user.username" | transloco }}<span class="req">*</span></label
					>
					<input class="input" [formField]="userForm.username" />
				</div>
				<div class="field">
					<label class="field__label"
						>{{ "forms.user.password" | transloco }}<span class="req">*</span></label
					>
					<input class="input" type="password" [formField]="userForm.password" />
					<div class="field__hint">{{ "forms.user.passwordHint" | transloco }}</div>
				</div>
			</div>

			<div class="field">
				<label class="field__label"
					>{{ "forms.user.role" | transloco }}<span class="req">*</span></label
				>
				<div class="role-grid">
					<div
						*ngFor="let r of roles"
						class="role-card"
						[class.role-card--selected]="model().role === r.value"
						(click)="setRole(r.value)"
					>
						<div class="role-card__name">{{ r.nameKey | transloco }}</div>
						<div class="role-card__desc">{{ r.descKey | transloco }}</div>
					</div>
				</div>
			</div>

			<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px;">
				<div class="field">
					<label class="field__label"
						>{{ "forms.user.email" | transloco }}<span class="req">*</span></label
					>
					<input class="input" type="email" [formField]="userForm.email" />
				</div>
				<div class="field">
					<label class="field__label">{{ "forms.user.phone" | transloco }}</label>
					<input class="input" [formField]="userForm.phone" />
					<div class="field__hint">{{ "common.optional" | transloco }}</div>
				</div>
			</div>

			<ng-container modal-footer>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button
					class="btn btn--primary"
					(click)="submit()"
					[disabled]="submitting() || !userForm().valid()"
				>
					{{ "common.create" | transloco }}
				</button>
			</ng-container>
		</sb-modal>
	`,
	styles: [
		`
			.role-grid {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 10px;
			}
			.role-card {
				padding: 12px;
				border: 1.5px solid var(--border);
				border-radius: var(--r-md);
				cursor: pointer;
				background: var(--surface);
				transition:
					border-color 0.12s,
					background 0.12s;
			}
			.role-card:hover {
				border-color: var(--border-strong);
			}
			.role-card--selected {
				border-color: var(--primary-500);
				background: rgba(249, 115, 22, 0.05);
			}
			.role-card__name {
				font-weight: 700;
				font-size: 13px;
			}
			.role-card--selected .role-card__name {
				color: var(--primary-600);
			}
			.role-card__desc {
				font-size: 11.5px;
				color: var(--muted);
				margin-top: 4px;
				line-height: 1.35;
			}
		`,
	],
	imports: [NgFor, FormField, ModalComponent, TranslocoPipe],
})
export class UserFormComponent {
	/** Whether the create-user modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful create with the new user's display name. */
	@Output() created = new EventEmitter<{ name: string }>();

	readonly roles = ROLES;
	readonly submitting = signal(false);
	private readonly apollo = inject(Apollo);

	readonly model = signal<UserFormModel>({
		username: "",
		password: "",
		email: "",
		phone: "",
		role: "Editor",
	});

	readonly userForm = form(this.model, (f) => {
		required(f.username);
		required(f.password);
		minLength(f.password, 8);
		required(f.email);
	});

	setRole(role: UserRole): void {
		this.model.update((m) => ({ ...m, role }));
	}

	onClose(): void {
		this.model.set({ username: "", password: "", email: "", phone: "", role: "Editor" });
		this.submitting.set(false);
		this.close.emit();
	}

	submit(): void {
		if (!this.userForm().valid()) return;
		const data = this.model();
		if (!data.email.includes("@")) return;

		this.submitting.set(true);
		this.apollo
			.mutate<{ createUser: { username: string } }>({
				mutation: MUTATION_CREATE_USER,
				variables: { input: { ...data, name: data.username } },
				refetchQueries: [{ query: QUERY_USERS }],
			})
			.subscribe({
				next: (res) => {
					this.submitting.set(false);
					this.created.emit({ name: res.data!.createUser.username });
					this.onClose();
				},
				error: () => {
					this.submitting.set(false);
				},
			});
	}
}
