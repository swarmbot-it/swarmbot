import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { IconComponent } from "../../shared/icon.component";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { QUERY_NETWORKS } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { AuthService } from "../../core/auth.service";

type Network = {
	id: string;
	name: string;
	driver: string;
	subnet: string;
	gateway: string;
	scope: string;
};

/**
 * Overlay networks list page. Displays driver, subnet, gateway, and scope for each network.
 */
@Component({
	selector: "sb-networks-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "nav.networks" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong>
						{{ "pages.networks.countSuffix" | transloco }}
					</div>
				</div>
				<button *ngIf="auth.isAdmin()" class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon>
					{{ "pages.networks.add" | transloco }}
				</button>
			</div>
			<sb-data-table
				[columns]="cols()"
				[rows]="rows"
				[searchKeys]="['name', 'driver', 'subnet', 'gateway']"
			>
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px;"
						>
							<sb-icon name="networks" [size]="14"></sb-icon>
							<strong>{{ row.name }}</strong>
						</span>
						<span
							*ngSwitchCase="'driver'"
							class="badge badge--neutral"
							style="text-transform:uppercase; font-size:10.5px; letter-spacing:.06em;"
							>{{ row.driver }}</span
						>
						<span *ngSwitchCase="'subnet'" class="mono">{{ row.subnet || "—" }}</span>
						<span *ngSwitchCase="'gateway'" class="mono">{{ row.gateway || "—" }}</span>
						<span *ngSwitchCase="'scope'" class="mono" style="color: var(--muted)">{{
							row.scope
						}}</span>
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
		TranslocoPipe,
	],
})
export class NetworksPageComponent {
	/** Emitted when the user clicks "New network" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	readonly auth = inject(AuthService);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	readonly cols = translatedColumns<Network>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "driver", labelKey: "columns.driver" },
		{ key: "subnet", labelKey: "columns.subnet" },
		{ key: "gateway", labelKey: "columns.gateway" },
		{ key: "scope", labelKey: "columns.scope" },
	]);

	readonly rows$: Observable<Network[]> = this.apollo
		.watchQuery<{ networks: Network[] }>({ query: QUERY_NETWORKS, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.networks ?? []) as Network[]));
}
