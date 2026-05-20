import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	OnInit,
	Output,
	inject,
	signal,
} from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { form, FormField, required } from "@angular/forms/signals";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { ModalComponent } from "../shared/modal.component";
import { IconComponent } from "../shared/icon.component";
import { TagComponent } from "../shared/tag.component";
import { MUTATION_CREATE_SERVICE, QUERY_REGISTRIES, QUERY_SERVICES } from "../core/graphql.queries";

type Registry = {
	id: string;
	name: string;
	url: string;
	type: string;
	user: string;
	default: boolean;
};

/**
 * Modal form to create a Swarm service (image, replicas, registry, and deploy options).
 */
@Component({
	selector: "sb-service-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(close)="onClose()"
			wide
			[title]="
				(step() === 1 ? 'forms.service.step1.title' : 'forms.service.step2.title')
					| transloco
			"
			[subtitle]="
				step() === 1
					? ('forms.service.step1.subtitle' | transloco)
					: ('forms.service.step2.subtitle'
						| transloco: { registry: registry() ?? '...' })
			"
		>
			<ng-container *ngIf="step() === 1">
				<div *ngIf="error" class="field__error">{{ error }}</div>
				<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
					<div
						*ngFor="let r of registries"
						class="reg-card"
						[class.reg-card--selected]="registry() === r.name"
						(click)="registry.set(r.name)"
					>
						<div style="display:flex; align-items:center; gap:10px;">
							<sb-icon name="registries" [size]="18"></sb-icon>
							<div style="flex:1; min-width: 0;">
								<div style="font-weight: 700; font-size: 13px;">
									{{ r.name }}
									<sb-tag
										*ngIf="r.default"
										variant="primary"
										[text]="'common.default' | transloco"
										style="margin-left: 6px;"
										>{{ "common.default" | transloco }}</sb-tag
									>
								</div>
								<div
									class="mono"
									style="color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
								>
									{{ r.url }}
								</div>
							</div>
						</div>
						<div style="margin-top: 8px; font-size: 11.5px; color: var(--muted);">
							{{
								"forms.service.registryMeta"
									| transloco: { type: r.type, user: r.user }
							}}
						</div>
					</div>
				</div>
			</ng-container>

			<ng-container *ngIf="step() === 2">
				<div *ngIf="error" class="field__error">{{ error }}</div>
				<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px;">
					<div class="field">
						<label class="field__label"
							>{{ "forms.service.name" | transloco }}<span class="req">*</span></label
						>
						<input class="input" [formField]="serviceForm.name" />
					</div>
					<div class="field">
						<label class="field__label"
							>{{ "forms.service.replicas" | transloco
							}}<span class="req">*</span></label
						>
						<input class="input" type="number" [formField]="serviceForm.replicas" />
					</div>
				</div>
				<div class="field">
					<label class="field__label"
						>{{ "forms.service.image" | transloco }}<span class="req">*</span></label
					>
					<input class="input mono" [formField]="serviceForm.image" />
					<div class="field__hint">
						{{ "forms.service.imageHint" | transloco: { registry: registry() } }}
					</div>
				</div>
				<div class="field">
					<label class="field__label">{{ "forms.service.ports" | transloco }}</label>
					<input class="input mono" [formField]="serviceForm.portsCsv" />
					<div class="field__hint">{{ "forms.service.portsHint" | transloco }}</div>
				</div>
			</ng-container>

			<ng-container modal-footer>
				<button *ngIf="step() > 1" class="btn btn--ghost" (click)="step.set(1)">
					{{ "common.back" | transloco }}
				</button>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.cancel" | transloco }}
				</button>
				<button class="btn btn--primary" (click)="next()">
					{{
						(step() === 1 ? "common.continue" : "forms.service.createService")
							| transloco
					}}
				</button>
			</ng-container>
		</sb-modal>
	`,
	styles: [
		`
			.reg-card {
				padding: 14px;
				border: 1.5px solid var(--border);
				border-radius: var(--r-md);
				cursor: pointer;
				background: var(--surface);
			}
			.reg-card:hover {
				border-color: var(--border-strong);
			}
			.reg-card--selected {
				border-color: var(--primary-500);
				background: rgba(249, 115, 22, 0.05);
			}
		`,
	],
	imports: [NgIf, NgFor, FormField, ModalComponent, IconComponent, TagComponent, TranslocoPipe],
})
export class ServiceFormComponent implements OnInit {
	/** Whether the create-service modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() close = new EventEmitter<void>();
	/** Emitted after a successful create with the new service name. */
	@Output() created = new EventEmitter<{ name: string }>();

	step = signal<1 | 2>(1);
	registry = signal<string | null>(null);

	error = "";

	registries: Registry[] = [];

	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly serviceModel = signal({
		name: "",
		image: "",
		replicas: 1,
		portsCsv: "",
	});
	readonly serviceForm = form(this.serviceModel, (f) => {
		required(f.name);
		required(f.image);
		required(f.replicas);
	});

	ngOnInit(): void {
		this.apollo
			.watchQuery<{ registries: Registry[] }>({ query: QUERY_REGISTRIES })
			.valueChanges.subscribe((res) => {
				this.registries = (res.data?.registries ?? []) as Registry[];
				if (!this.registry() && this.registries.length) {
					const def = this.registries.find((r) => r.default) ?? this.registries[0];
					this.registry.set(def.name);
				}
			});
	}

	onClose(): void {
		this.step.set(1);
		this.serviceModel.set({ name: "", image: "", replicas: 1, portsCsv: "" });
		this.error = "";
		this.close.emit();
	}

	next(): void {
		if (this.step() === 1) {
			if (!this.registry()) {
				this.error = this.transloco.translate("forms.service.errors.selectRegistry");
				return;
			}
			this.error = "";
			this.step.set(2);
			return;
		}
		const { name, image, replicas, portsCsv } = this.serviceModel();
		if (!image.trim() || !name.trim()) {
			this.error = this.transloco.translate("forms.service.errors.serviceRequired");
			return;
		}
		const ports = portsCsv
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_SERVICE,
				variables: {
					input: {
						name,
						image,
						registry: this.registry()!,
						replicas,
						ports,
					},
				},
				refetchQueries: [{ query: QUERY_SERVICES }],
			})
			.subscribe(() => {
				this.created.emit({ name });
				this.onClose();
			});
	}
}
