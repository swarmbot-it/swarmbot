import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { IconComponent } from "../../shared/icon.component";
import { TagComponent } from "../../shared/tag.component";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { QUERY_REGISTRIES } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";

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
					<h1 class="page-header__title">{{ "nav.registries" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong>
						{{ "pages.registries.countSuffix" | transloco }}
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon>
					{{ "pages.registries.add" | transloco }}
				</button>
			</div>
			<sb-data-table
				[columns]="cols()"
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
									[text]="'common.default' | transloco"
									variant="primary"
									style="margin-left:8px;"
									>{{ "common.default" | transloco }}</sb-tag
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
		TranslocoPipe,
	],
})
export class RegistriesPageComponent {
	/** Emitted when the user clicks "Connect registry" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	readonly cols = translatedColumns<Registry>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "pages.registries.columns.registry" },
		{ key: "type", labelKey: "columns.type" },
		{ key: "user", labelKey: "pages.registries.columns.authUser" },
	]);

	readonly rows$: Observable<Registry[]> = this.apollo
		.watchQuery<{ registries: Registry[] }>({ query: QUERY_REGISTRIES, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.registries ?? []) as Registry[]));
}
