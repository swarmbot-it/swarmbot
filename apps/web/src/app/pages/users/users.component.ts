import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Output,
	computed,
	inject,
} from "@angular/core";
import {
	AsyncPipe,
	DatePipe,
	NgIf,
	NgSwitch,
	NgSwitchCase,
	NgSwitchDefault,
} from "@angular/common";
import { Apollo } from "apollo-angular";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { TagComponent } from "../../shared/tag.component";
import { IconComponent } from "../../shared/icon.component";
import { QUERY_USERS } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";

type AppUser = {
	id: string;
	username: string;
	name: string;
	email: string;
	phone: string | null;
	role: string;
	created: string;
	lastLogin: string | null;
};

const ROLE_VARIANT: Record<string, "primary" | "info" | "neutral"> = {
	Administrator: "primary",
	admin: "primary",
	Editor: "info",
	"Read-only": "neutral",
};

const ROLE_I18N_KEY: Record<string, string> = {
	Administrator: "users.roles.Administrator",
	admin: "users.roles.admin",
	Editor: "users.roles.Editor",
	"Read-only": "users.roles.Read-only",
	user: "users.roles.user",
};

/**
 * Application users list page. Loads users via GraphQL and shows roles, contact info, and activity.
 */
@Component({
	selector: "sb-users-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "users.title" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> {{ "users.inWorkspace" | transloco }}
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> {{ "users.addUser" | transloco }}
				</button>
			</div>
			<sb-data-table
				[columns]="cols()"
				[rows]="rows"
				[searchKeys]="['name', 'username', 'email', 'role']"
			>
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<div
							*ngSwitchCase="'name'"
							style="display:flex; align-items:center; gap:10px;"
						>
							<div class="avatar avatar--sm">
								{{ initials(row.name || row.username) }}
							</div>
							<div>
								<div style="font-weight:600">{{ row.name || row.username }}</div>
								<div style="font-size: 11.5px; color: var(--muted)">
									{{ row.email }}
								</div>
							</div>
						</div>
						<span *ngSwitchCase="'phone'">
							<span *ngIf="row.phone" class="mono">{{ row.phone }}</span>
							<span *ngIf="!row.phone" style="color: var(--muted)">—</span>
						</span>
						<sb-tag *ngSwitchCase="'role'" [variant]="roleVariant(row.role)">{{
							roleLabel(row.role)
						}}</sb-tag>
						<span *ngSwitchCase="'created'" class="mono" style="color: var(--muted)">{{
							row.created | date: "yyyy-MM-dd"
						}}</span>
						<span
							*ngSwitchCase="'lastLogin'"
							[style.color]="row.lastLogin ? 'var(--text-2)' : 'var(--muted)'"
						>
							{{
								row.lastLogin
									? (row.lastLogin | date: "yyyy-MM-dd HH:mm")
									: ("users.never" | transloco)
							}}
						</span>
						<ng-container *ngSwitchDefault>{{ row[key] }}</ng-container>
					</ng-container>
				</ng-template>
			</sb-data-table>
		</ng-container>
	`,
	styles: [
		`
			.avatar--sm {
				width: 28px;
				height: 28px;
				font-size: 11px;
			}
		`,
	],
	imports: [
		NgIf,
		NgSwitch,
		NgSwitchCase,
		NgSwitchDefault,
		AsyncPipe,
		DatePipe,
		DataTableComponent,
		TagComponent,
		IconComponent,
		TranslocoPipe,
	],
})
export class UsersPageComponent {
	/** Emitted when the user clicks "New user" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	readonly cols = computed(() => {
		this.i18n.activeLang();
		return [
			{ key: "name", label: this.transloco.translate("users.columns.user") },
			{ key: "phone", label: this.transloco.translate("users.columns.phone") },
			{ key: "role", label: this.transloco.translate("users.columns.role") },
			{ key: "created", label: this.transloco.translate("users.columns.created") },
			{ key: "lastLogin", label: this.transloco.translate("users.columns.lastLogin") },
		];
	});

	readonly rows$: Observable<AppUser[]> = this.apollo
		.watchQuery<{ users: AppUser[] }>({ query: QUERY_USERS, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.users ?? []) as AppUser[]));

	initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0])
			.join("")
			.toUpperCase();
	}

	roleVariant(role: string): "primary" | "info" | "neutral" {
		return ROLE_VARIANT[role] ?? "neutral";
	}

	roleLabel(role: string): string {
		const key = ROLE_I18N_KEY[role];
		if (!key) return role;
		const translated = this.transloco.translate(key);
		return translated === key ? role : translated;
	}
}
