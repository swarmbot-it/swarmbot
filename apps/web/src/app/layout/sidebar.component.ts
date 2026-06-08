import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { TranslocoPipe } from "@jsverse/transloco";
import { IconComponent } from "../shared/icon.component";

type NavItem = {
	id: string;
	labelKey: string;
	icon: string;
	group: "overview" | "resources" | "infra" | "store" | "admin";
	countKey?:
		| "stacks"
		| "services"
		| "tasks"
		| "nodes"
		| "networks"
		| "volumes"
		| "secrets"
		| "configs"
		| "registries"
		| "users";
	path: string;
};

const NAV: NavItem[] = [
	{
		id: "dashboard",
		labelKey: "nav.dashboard",
		icon: "dashboard",
		group: "overview",
		path: "dashboard",
	},
	{
		id: "load",
		labelKey: "nav.load",
		icon: "load",
		group: "resources",
		path: "load",
	},
	{
		id: "stacks",
		labelKey: "nav.stacks",
		icon: "stacks",
		group: "resources",
		path: "stacks",
		countKey: "stacks",
	},
	{
		id: "services",
		labelKey: "nav.services",
		icon: "services",
		group: "resources",
		path: "services",
		countKey: "services",
	},
	{
		id: "tasks",
		labelKey: "nav.tasks",
		icon: "tasks",
		group: "resources",
		path: "tasks",
		countKey: "tasks",
	},
	{
		id: "nodes",
		labelKey: "nav.nodes",
		icon: "nodes",
		group: "infra",
		path: "nodes",
		countKey: "nodes",
	},
	{
		id: "networks",
		labelKey: "nav.networks",
		icon: "networks",
		group: "infra",
		path: "networks",
		countKey: "networks",
	},
	{
		id: "volumes",
		labelKey: "nav.volumes",
		icon: "volumes",
		group: "infra",
		path: "volumes",
		countKey: "volumes",
	},
	{
		id: "secrets",
		labelKey: "nav.secrets",
		icon: "secrets",
		group: "store",
		path: "secrets",
		countKey: "secrets",
	},
	{
		id: "configs",
		labelKey: "nav.configs",
		icon: "configs",
		group: "store",
		path: "configs",
		countKey: "configs",
	},
	{
		id: "registries",
		labelKey: "nav.registries",
		icon: "registries",
		group: "store",
		path: "registries",
		countKey: "registries",
	},
	{
		id: "users",
		labelKey: "nav.users",
		icon: "users",
		group: "admin",
		path: "users",
		countKey: "users",
	},
];

const GROUP_KEYS: Record<NavItem["group"], string> = {
	overview: "nav.groups.overview",
	resources: "nav.groups.resources",
	infra: "nav.groups.infra",
	store: "nav.groups.store",
	admin: "nav.groups.admin",
};

const GROUPS: NavItem["group"][] = ["overview", "resources", "infra", "store", "admin"];

export type SidebarFooter = {
	clusterStatus: string;
	managersReady: number;
	managersTotal: number;
	dockerApi: string | null;
};

@Component({
	selector: "sb-sidebar",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<nav class="sidebar">
			<ng-container *ngFor="let group of groups">
				<div class="sidebar__group-label">
					<span class="sidebar__group-text">{{ groupKeys[group] | transloco }}</span>
				</div>
				<a
					*ngFor="let item of nav[group]"
					class="sidebar__item"
					routerLinkActive="sidebar__item--active"
					[routerLink]="['/app', item.path]"
					[attr.data-label]="item.labelKey | transloco"
				>
					<sb-icon [name]="item.icon" [size]="17"></sb-icon>
					<span class="sidebar__item-text">{{ item.labelKey | transloco }}</span>
					<span
						class="sidebar__count"
						*ngIf="item.countKey && counts && counts[item.countKey] != null"
						>{{ counts[item.countKey] }}</span
					>
				</a>
			</ng-container>

			<div class="sidebar__footer" *ngIf="footer">
				<div class="sidebar__cluster-status">
					<span
						class="dot"
						[class.dot--success]="footer.clusterStatus === 'healthy'"
						[class.dot--warning]="footer.clusterStatus === 'degraded'"
						[class.dot--danger]="footer.clusterStatus === 'unhealthy'"
					></span>
					<span class="sidebar__footer-text">{{
						clusterStatusKey(footer.clusterStatus) | transloco
					}}</span>
				</div>
				<div class="sidebar__footer-text" *ngIf="footer.managersTotal > 0">
					{{
						"nav.quorum"
							| transloco
								: {
										managers: footer.managersReady,
										total: footer.managersTotal,
								  }
					}}
				</div>
				<div class="sidebar__api-line sidebar__footer-text mono">
					API
					<ng-container *ngIf="footer.dockerApi; else apiUnknown"
						>v{{ footer.dockerApi }}</ng-container
					>
					<ng-template #apiUnknown>{{ "common.na" | transloco }}</ng-template>
				</div>
			</div>
		</nav>
	`,
	styles: [
		`
			.sidebar {
				background: var(--sidebar-bg);
				border-right: 1px solid var(--border);
				padding: 16px 12px;
				display: flex;
				flex-direction: column;
				gap: 2px;
				height: 100%;
			}
			.sidebar__group-label {
				font-size: 11px;
				text-transform: uppercase;
				letter-spacing: 0.08em;
				color: var(--muted);
				padding: 12px 12px 6px;
				font-weight: 600;
			}
			.sidebar__item {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 9px 12px;
				border-radius: var(--r-md);
				font-size: 13.5px;
				color: var(--text-2);
				cursor: pointer;
				font-weight: 500;
				user-select: none;
				position: relative;
				text-decoration: none;
			}
			.sidebar__item:hover {
				background: var(--sidebar-item-hover);
				color: var(--text);
			}
			.sidebar__item--active {
				background: var(--sidebar-item-active);
				color: var(--sidebar-item-active-fg);
				font-weight: 600;
			}
			.sidebar__item--active::before {
				content: "";
				position: absolute;
				left: -12px;
				top: 8px;
				bottom: 8px;
				width: 3px;
				background: var(--primary-500);
				border-radius: 0 3px 3px 0;
			}
			.sidebar__count {
				margin-left: auto;
				font-size: 11px;
				font-weight: 600;
				background: var(--surface-2);
				color: var(--muted);
				padding: 1px 7px;
				border-radius: 999px;
				min-width: 22px;
				text-align: center;
			}
			.sidebar__item--active .sidebar__count {
				background: var(--primary-500);
				color: white;
			}
			.sidebar__footer {
				margin-top: auto;
				padding: 12px;
				border-top: 1px solid var(--border);
				font-size: 11.5px;
				color: var(--muted);
				display: flex;
				flex-direction: column;
				gap: 4px;
			}
			.sidebar__cluster-status {
				display: flex;
				align-items: center;
				gap: 6px;
				font-weight: 600;
				color: var(--text-2);
				font-size: 12px;
			}
		`,
	],
	imports: [NgFor, NgIf, RouterLink, RouterLinkActive, IconComponent, TranslocoPipe],
})
export class SidebarComponent {
	@Input() counts: Record<string, number> | null = null;
	@Input() footer: SidebarFooter | null = null;

	clusterStatusKey(status: string): string {
		switch (status) {
			case "healthy":
				return "nav.clusterHealthy";
			case "degraded":
				return "nav.clusterDegraded";
			case "unhealthy":
				return "nav.clusterUnhealthy";
			default:
				return "nav.clusterUnknown";
		}
	}

	readonly groups = GROUPS;
	readonly groupKeys = GROUP_KEYS;
	readonly nav: Record<NavItem["group"], NavItem[]> = NAV.reduce(
		(acc, item) => {
			(acc[item.group] = acc[item.group] || []).push(item);
			return acc;
		},
		{} as Record<NavItem["group"], NavItem[]>
	);
}
