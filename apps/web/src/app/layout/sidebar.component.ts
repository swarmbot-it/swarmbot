import { ChangeDetectionStrategy, Component, Input, inject } from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { TranslocoPipe } from "@jsverse/transloco";
import { IconComponent } from "../shared/icon.component";
import { OrchestratorStateService } from "../core/orchestrator-state.service";

type NavItem = {
	id: string;
	labelKey: string;
	icon: string;
	group: "overview" | "workloads" | "infra" | "store" | "admin";
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
		icon: "trending",
		group: "workloads",
		path: "load",
	},
	{
		id: "stacks",
		labelKey: "nav.stacks",
		icon: "stacks",
		group: "workloads",
		path: "stacks",
		countKey: "stacks",
	},
	{
		id: "services",
		labelKey: "nav.services",
		icon: "services",
		group: "workloads",
		path: "services",
		countKey: "services",
	},
	{
		id: "tasks",
		labelKey: "nav.tasks",
		icon: "tasks",
		group: "workloads",
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
	workloads: "nav.groups.workloads",
	infra: "nav.groups.infra",
	store: "nav.groups.store",
	admin: "nav.groups.admin",
};

const GROUPS: NavItem["group"][] = ["overview", "workloads", "infra", "store", "admin"];

/**
 * Primary app navigation. Groups routes by area and shows live resource counts from the cluster.
 */
@Component({
	selector: "sb-sidebar",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<nav class="sidebar">
			<ng-container *ngFor="let group of groups">
				<div class="sidebar__group-label">{{ groupKeys[group] | transloco }}</div>
				<a
					*ngFor="let item of nav[group]"
					class="sidebar__item"
					routerLinkActive="sidebar__item--active"
					[routerLink]="['/app', item.path]"
				>
					<sb-icon [name]="item.icon" [size]="17"></sb-icon>
					<span>{{ navLabelKey(item) | transloco }}</span>
					<span class="sidebar__count" *ngIf="item.countKey && counts">{{
						counts[item.countKey]
					}}</span>
				</a>
			</ng-container>

			<div class="sidebar__footer">
				<div class="sidebar__cluster-status">
					<span class="dot dot--success"></span>
					{{ "nav.clusterHealthy" | transloco }}
				</div>
				<div>
					{{
						"nav.quorum"
							| transloco
								: {
										managers: counts?.["managersReady"] ?? 0,
										total: counts?.["managersTotal"] ?? 0,
								  }
					}}
				</div>
				<div>API: <span class="mono">v1.45</span></div>
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
	/** Optional map of nav count keys to totals (stacks, services, nodes, etc.). */
	@Input() counts: Record<string, number> | null = null;

	readonly orch = inject(OrchestratorStateService);

	/** Mode-dependent nav labels: "Stacks" becomes "Namespaces" on Kubernetes. */
	navLabelKey(item: NavItem): string {
		if (item.id === "stacks") return this.orch.stacksNavKey();
		return item.labelKey;
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
