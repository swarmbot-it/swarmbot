import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { IconComponent } from "../../shared/icon.component";
import { TagComponent } from "../../shared/tag.component";
import { QUERY_REGISTRIES } from "../../core/graphql.queries";

type Registry = {
	id: string;
	name: string;
	url: string;
	type: string;
	user: string;
	default: boolean;
};

/**
 * Container registry list page. Manages connected registries and default pull credentials.
 */
@Component({
	selector: "sb-registries-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">Registries</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> registries connected
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> Connect registry
				</button>
			</div>
			<sb-data-table
				[columns]="cols"
				[rows]="rows"
				[searchKeys]="['name', 'url', 'type', 'user']"
			>
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px;"
						>
							<sb-icon name="registries" [size]="14"></sb-icon>
							<span>
								<strong>{{ row.name }}</strong>
								<sb-tag
									*ngIf="row.default"
									text="DEFAULT"
									variant="primary"
									style="margin-left:8px;"
									>DEFAULT</sb-tag
								>
								<div class="mono" style="color: var(--muted); margin-top: 2px;">
									{{ row.url }}
								</div>
							</span>
						</span>
						<span
							*ngSwitchCase="'type'"
							class="badge badge--neutral"
							style="text-transform:none; letter-spacing:0;"
							>{{ row.type }}</span
						>
						<span *ngSwitchCase="'user'" class="mono">{{ row.user }}</span>
						<ng-container *ngSwitchDefault>{{ row[key] }}</ng-container>
					</ng-container>
				</ng-template>
			</sb-data-table>
		</ng-container>
	`,
	imports: [
		NgIf,
		NgSwitch,
		NgSwitchCase,
		NgSwitchDefault,
		AsyncPipe,
		DataTableComponent,
		IconComponent,
		TagComponent,
	],
})
export class RegistriesPageComponent {
	/** Emitted when the user clicks "Connect registry" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "Registry" },
		{ key: "type", label: "Type" },
		{ key: "user", label: "Auth user" },
	];

	readonly rows$: Observable<Registry[]> = this.apollo
		.watchQuery<{ registries: Registry[] }>({ query: QUERY_REGISTRIES, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.registries ?? []) as Registry[]));
}
