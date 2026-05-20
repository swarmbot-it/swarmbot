import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import {
	AsyncPipe,
	DatePipe,
	NgIf,
	NgSwitch,
	NgSwitchCase,
	NgSwitchDefault,
} from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { TagComponent } from "../../shared/tag.component";
import { IconComponent } from "../../shared/icon.component";
import { QUERY_USERS } from "../../core/graphql.queries";

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
					<h1 class="page-header__title">Users</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> users in workspace
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> Add user
				</button>
			</div>
			<sb-data-table
				[columns]="cols"
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
							row.role
						}}</sb-tag>
						<span *ngSwitchCase="'created'" class="mono" style="color: var(--muted)">{{
							row.created | date: "yyyy-MM-dd"
						}}</span>
						<span
							*ngSwitchCase="'lastLogin'"
							[style.color]="row.lastLogin ? 'var(--text-2)' : 'var(--muted)'"
						>
							{{
								row.lastLogin ? (row.lastLogin | date: "yyyy-MM-dd HH:mm") : "never"
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
	],
})
export class UsersPageComponent {
	/** Emitted when the user clicks "New user" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "User" },
		{ key: "phone", label: "Phone" },
		{ key: "role", label: "Role" },
		{ key: "created", label: "Created" },
		{ key: "lastLogin", label: "Last login" },
	];

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
}
