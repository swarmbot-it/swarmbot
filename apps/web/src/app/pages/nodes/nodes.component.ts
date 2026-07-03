import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Apollo } from "apollo-angular";
import { map, switchMap } from "rxjs/operators";
import { Observable, forkJoin, of } from "rxjs";
import { IconComponent } from "../../shared/icon.component";
import { SparklineComponent } from "../../shared/sparkline.component";
import { TagComponent } from "../../shared/tag.component";
import { SegmentedComponent } from "../../shared/segmented.component";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import {
	MUTATION_SET_NODE_AVAILABILITY,
	QUERY_METRICS_SERIES,
	QUERY_NODES,
} from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { AuthService } from "../../core/auth.service";
import { ToastService } from "../../core/toast.service";

type Node = {
	id: string;
	hostname: string;
	ip: string;
	dockerVersion: string;
	role: string;
	availability: string | null;
	tags: string[];
	cpu: number;
	mem: number;
	disk: number;
};

type NodeSpark = { cpu: number[]; mem: number[]; disk: number[] };
type MetricsResponse = { metricsSeries: { cpu: number[]; mem: number[]; disk: number[] } };

/**
 * Cluster nodes page. Shows node roles, resource usage, and CPU/memory sparklines per host.
 */
@Component({
	selector: "sb-nodes-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="page-header" *ngIf="nodes$ | async as nodes">
			<div>
				<h1 class="page-header__title">{{ "nav.nodes" | transloco }}</h1>
				<div class="page-header__count">
					{{
						"pages.nodes.countSummary"
							| transloco
								: {
										total: nodes.length,
										managers: count(nodes, "manager"),
										workers: count(nodes, "worker")
								  }
					}}
				</div>
			</div>
		</div>

		<div class="dt-toolbar">
			<input
				class="input input--search"
				[placeholder]="'pages.nodes.searchPlaceholder' | transloco"
				[ngModel]="query()"
				(ngModelChange)="query.set($event)"
			/>
			<sb-segmented
				[options]="filters()"
				[value]="filter()"
				(select)="filter.set($any($event))"
			>
			</sb-segmented>
		</div>

		<div *ngIf="nodes$ | async as nodes" class="node-grid">
			<div *ngFor="let n of filteredNodes(nodes)" class="node-card">
				<div class="node-card__top">
					<div>
						<div class="node-card__hostname">
							<span
								class="dot"
								[class.dot--warning]="n.tags.includes('DRAIN')"
								[class.dot--success]="!n.tags.includes('DRAIN')"
							></span>
							{{ n.hostname }}
						</div>
						<div class="node-card__meta">{{ n.ip }} · Docker {{ n.dockerVersion }}</div>
					</div>
					<div class="node-actions" *ngIf="auth.isAdmin()">
						<button
							class="btn btn--ghost btn--icon btn--sm"
							[title]="'pages.nodes.actions.title' | transloco"
							(click)="toggleMenu(n.id)"
						>
							<sb-icon name="settings" [size]="14"></sb-icon>
						</button>
						@if (openMenuId() === n.id) {
							<div class="splitbtn__menu">
								@if (n.availability === 'drain') {
									<div class="splitbtn__item" (click)="setAvailability(n)">
										<sb-icon name="play" [size]="14" style="color:var(--muted)"></sb-icon>
										<span>{{ "pages.nodes.actions.activate" | transloco }}</span>
									</div>
								} @else {
									<div class="splitbtn__item" (click)="setAvailability(n)">
										<sb-icon name="pause" [size]="14" style="color:var(--muted)"></sb-icon>
										<span>{{ "pages.nodes.actions.drain" | transloco }}</span>
									</div>
								}
							</div>
						}
					</div>
				</div>
				<div class="node-card__tags">
					<sb-tag *ngFor="let t of n.tags" [text]="t">{{ t }}</sb-tag>
				</div>
				<div class="node-card__charts">
					<div class="node-mini">
						<div
							style="display:flex; justify-content:space-between; align-items:baseline"
						>
							<span class="node-mini__label">{{ "pages.nodes.labels.cpu" | transloco }}</span>
							<span class="node-mini__value">{{ n.cpu }}%</span>
						</div>
						<sb-sparkline
							[data]="series(n.id, 'cpu')"
							[width]="120"
							[height]="32"
							color="var(--primary-500)"
						></sb-sparkline>
					</div>
					<div class="node-mini">
						<div
							style="display:flex; justify-content:space-between; align-items:baseline"
						>
							<span class="node-mini__label">{{
								"pages.nodes.labels.memory" | transloco
							}}</span>
							<span class="node-mini__value">{{ n.mem }}%</span>
						</div>
						<sb-sparkline
							[data]="series(n.id, 'mem')"
							[width]="120"
							[height]="32"
							color="#3b82f6"
						></sb-sparkline>
					</div>
					<div class="node-mini">
						<div
							style="display:flex; justify-content:space-between; align-items:baseline"
						>
							<span class="node-mini__label">{{ "pages.nodes.labels.disk" | transloco }}</span>
							<span class="node-mini__value">{{ n.disk }}%</span>
						</div>
						<sb-sparkline
							[data]="series(n.id, 'disk')"
							[width]="120"
							[height]="32"
							color="#10b981"
						></sb-sparkline>
					</div>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.dt-toolbar {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-bottom: 14px;
			}
			.node-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
				gap: 16px;
			}
			.node-card {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				padding: 18px;
				box-shadow: var(--shadow-1);
				display: flex;
				flex-direction: column;
				gap: 14px;
			}
			.node-card__top {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 10px;
			}
			.node-card__hostname {
				font-size: 15px;
				font-weight: 700;
				display: flex;
				align-items: center;
				gap: 8px;
			}
			.node-card__meta {
				font-size: 12px;
				color: var(--muted);
				font-family: var(--font-mono);
				margin-top: 2px;
			}
			.node-card__tags {
				display: flex;
				gap: 4px;
				flex-wrap: wrap;
			}
			.node-card__charts {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 10px;
			}
			.node-mini {
				background: var(--surface-2);
				border-radius: var(--r-md);
				padding: 10px;
				overflow: hidden;
			}
			.node-mini__label {
				font-size: 10.5px;
				text-transform: uppercase;
				color: var(--muted);
				font-weight: 600;
				letter-spacing: 0.04em;
			}
			.node-mini__value {
				font-size: 16px;
				font-weight: 700;
				font-variant-numeric: tabular-nums;
			}
			.node-actions {
				position: relative;
				display: inline-flex;
			}
			.splitbtn__menu {
				position: absolute;
				top: calc(100% + 6px);
				right: 0;
				min-width: 180px;
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-md);
				box-shadow: var(--shadow-3);
				padding: 6px;
				z-index: 20;
			}
			.splitbtn__item {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 8px 10px;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
				white-space: nowrap;
			}
			.splitbtn__item:hover {
				background: var(--surface-2);
			}
		`,
	],
	imports: [
		NgIf,
		NgFor,
		AsyncPipe,
		FormsModule,
		IconComponent,
		SparklineComponent,
		TagComponent,
		SegmentedComponent,
		TranslocoPipe,
	],
})
export class NodesPageComponent {
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	private readonly toast = inject(ToastService);
	readonly auth = inject(AuthService);

	readonly filter = signal<"all" | "manager" | "worker">("all");
	readonly query = signal("");
	readonly openMenuId = signal<string | null>(null);

	readonly filters = computed(() => {
		this.i18n.activeLang();
		return [
			{ value: "all", label: this.transloco.translate("pages.nodes.filters.all") },
			{ value: "manager", label: this.transloco.translate("pages.nodes.filters.manager") },
			{ value: "worker", label: this.transloco.translate("pages.nodes.filters.worker") },
		];
	});

	private readonly sparks = signal<Record<string, NodeSpark>>({});

	private readonly nodesQuery = this.apollo.watchQuery<{ nodes: Node[] }>({
		query: QUERY_NODES,
		pollInterval: 30_000,
	});

	readonly nodes$: Observable<Node[]> = this.nodesQuery.valueChanges.pipe(
			map((x) => (x.data?.nodes ?? []) as Node[]),
			switchMap((nodes) => (nodes.length === 0 ? of(nodes) : this.withSparks(nodes)))
		);

	private withSparks(nodes: Node[]): Observable<Node[]> {
		return forkJoin(
			nodes.map((n) =>
				this.apollo
					.query<MetricsResponse>({
						query: QUERY_METRICS_SERIES,
						variables: { input: { nodeId: n.id, range: "1h", resolution: "low" } },
						fetchPolicy: "network-only",
					})
					.pipe(map((r) => [n.id, r.data?.metricsSeries] as const))
			)
		).pipe(
			map((results) => {
				const next: Record<string, NodeSpark> = {};
				for (const [id, m] of results) if (m) next[id] = m;
				this.sparks.set(next);
				return nodes;
			})
		);
	}

	count(nodes: Node[], role: string): number {
		return nodes.filter((n) => n.role === role).length;
	}

	filteredNodes(nodes: Node[]): Node[] {
		const q = this.query().toLowerCase();
		const f = this.filter();
		return nodes.filter((n) => {
			if (f === "manager" && n.role !== "manager") return false;
			if (f === "worker" && n.role !== "worker") return false;
			if (q && !n.hostname.toLowerCase().includes(q) && !(n.ip ?? "").includes(q))
				return false;
			return true;
		});
	}

	series(id: string, kind: "cpu" | "mem" | "disk"): number[] {
		return this.sparks()[id]?.[kind] ?? [];
	}

	toggleMenu(id: string): void {
		this.openMenuId.set(this.openMenuId() === id ? null : id);
	}

	setAvailability(node: Node): void {
		this.openMenuId.set(null);
		const next = node.availability === "drain" ? "active" : "drain";
		this.apollo
			.mutate<{ setNodeAvailability: { id: string; availability: string } }>({
				mutation: MUTATION_SET_NODE_AVAILABILITY,
				variables: { id: node.id, availability: next },
			})
			.subscribe({
				next: () => {
					const key = next === "drain" ? "pages.nodes.actions.toastDrained" : "pages.nodes.actions.toastActivated";
					this.toast.push("success", this.transloco.translate(key, { name: node.hostname }));
					this.nodesQuery.refetch();
				},
				error: (err) => {
					this.toast.push(
						"error",
						err?.message || this.transloco.translate("pages.nodes.actions.failed")
					);
				},
			});
	}
}
