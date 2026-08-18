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
import { MUTATION_CREATE_NETWORK, QUERY_NETWORKS } from "../core/graphql.queries";

/**
 * Modal form to create an overlay network (driver, subnet, gateway, and labels).
 */
@Component({
	selector: "sb-network-form",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-modal
			[open]="open"
			(closed)="onClose()"
			wide
			[title]="'forms.network.title' | transloco"
			subtitle=""
		>
			<div style="display:grid; grid-template-columns: 2fr 1fr; gap: 14px;">
				<div class="field">
					<label for="network-name" class="field__label"
						>{{ "forms.network.name" | transloco }}<span class="req">*</span></label
					>
					<input id="network-name" class="input" [formField]="networkForm.name" />
				</div>
				<div class="field">
					<label for="network-driver" class="field__label"
						>{{ "forms.network.driver" | transloco }}<span class="req">*</span></label
					>
					<select
						id="network-driver"
						class="input select"
						[formField]="networkForm.driver"
					>
						<option value="overlay">overlay</option>
						<option value="bridge">bridge</option>
						<option value="macvlan">macvlan</option>
						<option value="ipvlan">ipvlan</option>
					</select>
				</div>
			</div>
			<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px;">
				<div class="field">
					<label for="network-subnet" class="field__label">{{
						"forms.network.subnet" | transloco
					}}</label>
					<input
						id="network-subnet"
						class="input mono"
						[formField]="networkForm.subnet"
					/>
				</div>
				<div class="field">
					<label for="network-gateway" class="field__label">{{
						"forms.network.gateway" | transloco
					}}</label>
					<input
						id="network-gateway"
						class="input mono"
						[formField]="networkForm.gateway"
					/>
				</div>
			</div>
			<div class="field">
				<div class="field__label" id="network-labels-caption">
					{{ "forms.network.labels" | transloco }}
				</div>
				<sb-kv-editor
					role="group"
					aria-labelledby="network-labels-caption"
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
					[disabled]="!networkForm().valid()"
				>
					{{ "common.create" | transloco }}
				</button>
			</ng-container>
		</sb-modal>
	`,
	styles: [
		`
			.switch-grid {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 12px;
			}
		`,
	],
	imports: [FormField, ModalComponent, KvEditorComponent, TranslocoPipe],
})
export class NetworkFormComponent {
	/** Whether the create-network modal is visible. */
	@Input() open = false;
	/** Emitted when the user dismisses the modal without creating. */
	@Output() closed = new EventEmitter<void>();
	/** Emitted after a successful create with the new network name. */
	@Output() created = new EventEmitter<{ name: string }>();

	private readonly apollo = inject(Apollo);
	readonly model = signal({
		name: "",
		subnet: "",
		gateway: "",
		driver: "overlay",
		attachable: true,
		internal: false,
		ingress: false,
		labels: [] as KvPair[],
	});
	readonly networkForm = form(this.model, (f) => {
		required(f.name);
		required(f.driver);
	});

	setLabels(labels: KvPair[]): void {
		this.model.update((m) => ({ ...m, labels }));
	}

	onClose(): void {
		this.model.set({
			name: "",
			subnet: "",
			gateway: "",
			driver: "overlay",
			attachable: true,
			internal: false,
			ingress: false,
			labels: [],
		});
		this.closed.emit();
	}

	submit(): void {
		const data = this.model();
		this.apollo
			.mutate({
				mutation: MUTATION_CREATE_NETWORK,
				variables: { input: { ...data } },
				refetchQueries: [{ query: QUERY_NETWORKS }],
			})
			.subscribe(() => {
				this.created.emit({ name: data.name });
				this.onClose();
			});
	}
}
