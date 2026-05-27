import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { IconComponent } from "../../shared/icon.component";
import { SparklineComponent } from "../../shared/sparkline.component";
import { TagComponent } from "../../shared/tag.component";
import { SegmentedComponent } from "../../shared/segmented.component";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { QUERY_NODES } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { pctOrNa } from "../../core/metrics-display";

type Node = {
	id: string;
	hostname: string;
	ip: string;
	dockerVersion: string;
	agentVersion: string | null;
	role: string;
	tags: string[];
	cpu: number | null;
	mem: number | null;
	disk: number | null;
	cpuHistory?: number[] | null;
	memHistory?: number[] | null;
	diskHistory?: number[] | null;
};

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
						<div class="node-card__meta">
							{{ n.ip }} · Docker {{ n.dockerVersion
							}}<ng-container *ngIf="n.agentVersion">
								· {{ "pages.nodes.agent" | transloco }} {{ n.agentVersion }}</ng-container
							>
						</div>
					</div>
					<button class="btn btn--ghost btn--icon btn--sm" title="Actions">
						<sb-icon name="settings" [size]="14"></sb-icon>
					</button>
				</div>
				<div class="node-card__tags">
					<sb-tag *ngFor="let t of n.tags" [text]="t">{{ t }}</sb-tag>
				</div>
				<div class="node-card__charts">
					<div class="node-mini">
						<div class="node-mini__head">
							<span class="node-mini__label">{{ "pages.nodes.labels.cpu" | transloco }}</span>
							<span class="node-mini__value"
								>{{ pct(n.cpu) }}<span *ngIf="n.cpu != null">%</span></span
							>
						</div>
						<sb-sparkline
							*ngIf="n.cpuHistory?.length; else cpuNa"
							[data]="n.cpuHistory!"
							[fluid]="true"
							[height]="32"
							color="var(--primary-500)"
						></sb-sparkline>
						<ng-template #cpuNa
							><div class="node-mini__na">{{ "common.na" | transloco }}</div></ng-template
						>
					</div>
					<div class="node-mini">
						<div class="node-mini__head">
							<span class="node-mini__label">{{
								"pages.nodes.labels.memory" | transloco
							}}</span>
							<span class="node-mini__value"
								>{{ pct(n.mem) }}<span *ngIf="n.mem != null">%</span></span
							>
						</div>
						<sb-sparkline
							*ngIf="n.memHistory?.length; else memNa"
							[data]="n.memHistory!"
							[fluid]="true"
							[height]="32"
							color="#3b82f6"
						></sb-sparkline>
						<ng-template #memNa
							><div class="node-mini__na">{{ "common.na" | transloco }}</div></ng-template
						>
					</div>
					<div class="node-mini">
						<div class="node-mini__head">
							<span class="node-mini__label">{{ "pages.nodes.labels.disk" | transloco }}</span>
							<span class="node-mini__value"
								>{{ pct(n.disk) }}<span *ngIf="n.disk != null">%</span></span
							>
						</div>
						<sb-sparkline
							*ngIf="n.diskHistory?.length; else diskNa"
							[data]="n.diskHistory!"
							[fluid]="true"
							[height]="32"
							color="#10b981"
						></sb-sparkline>
						<ng-template #diskNa
							><div class="node-mini__na">{{ "common.na" | transloco }}</div></ng-template
						>
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
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 8px;
			}
			.node-mini {
				background: var(--surface-2);
				border-radius: var(--r-md);
				padding: 10px;
				min-width: 0;
				overflow: hidden;
			}
			.node-mini__head {
				display: flex;
				justify-content: space-between;
				align-items: baseline;
				gap: 4px;
			}
			.node-mini sb-sparkline {
				display: block;
				width: 100%;
				margin-top: 6px;
			}
			.node-mini__na {
				margin-top: 6px;
				height: 32px;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 12px;
				font-weight: 600;
				color: var(--muted);
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

	readonly filter = signal<"all" | "manager" | "worker">("all");
	readonly query = signal("");

	readonly filters = computed(() => {
		this.i18n.activeLang();
		return [
			{ value: "all", label: this.transloco.translate("pages.nodes.filters.all") },
			{ value: "manager", label: this.transloco.translate("pages.nodes.filters.manager") },
			{ value: "worker", label: this.transloco.translate("pages.nodes.filters.worker") },
		];
	});

	readonly nodes$: Observable<Node[]> = this.apollo
		.watchQuery<{ nodes: Node[] }>({ query: QUERY_NODES, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.nodes ?? []) as Node[]));

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

	pct(value: number | null | undefined): string {
		return pctOrNa(value, this.transloco.translate("common.na"));
	}
}
