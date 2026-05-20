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
import { QUERY_NODES } from "../../core/graphql.queries";

type Node = {
	id: string;
	hostname: string;
	ip: string;
	dockerVersion: string;
	role: string;
	tags: string[];
	cpu: number;
	mem: number;
	disk: number;
};

/**
 * Stable per-node history seeded by node id so charts don't reshuffle
 * between renders. Mirrors the design's mock-data approach.
 */
function nodeSpark(id: string, base: number, kind: number): number[] {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	const out: number[] = [];
	for (let i = 0; i < 32; i++) {
		const wave = Math.sin(((i / 32) * Math.PI * 4 + kind + (h % 7)) * 0.6) * 16;
		const jit = Math.sin(i * 13.13 + kind * 7 + (h % 11)) * 6;
		out.push(Math.max(2, Math.min(98, base + wave + jit)));
	}
	return out;
}

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
				<h1 class="page-header__title">Nodes</h1>
				<div class="page-header__count">
					<strong>{{ nodes.length }}</strong> nodes —
					{{ count(nodes, "manager") }} managers, {{ count(nodes, "worker") }} workers
				</div>
			</div>
		</div>

		<div class="dt-toolbar">
			<input
				class="input input--search"
				placeholder="Search hostname or IP…"
				[ngModel]="query()"
				(ngModelChange)="query.set($event)"
			/>
			<sb-segmented
				[options]="filters"
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
					<button class="btn btn--ghost btn--icon btn--sm" title="Actions">
						<sb-icon name="settings" [size]="14"></sb-icon>
					</button>
				</div>
				<div class="node-card__tags">
					<sb-tag *ngFor="let t of n.tags" [text]="t">{{ t }}</sb-tag>
				</div>
				<div class="node-card__charts">
					<div class="node-mini">
						<div
							style="display:flex; justify-content:space-between; align-items:baseline"
						>
							<span class="node-mini__label">CPU</span>
							<span class="node-mini__value">{{ n.cpu }}%</span>
						</div>
						<sb-sparkline
							[data]="series(n.id, n.cpu, 0)"
							[width]="120"
							[height]="32"
							color="var(--primary-500)"
						></sb-sparkline>
					</div>
					<div class="node-mini">
						<div
							style="display:flex; justify-content:space-between; align-items:baseline"
						>
							<span class="node-mini__label">Memory</span>
							<span class="node-mini__value">{{ n.mem }}%</span>
						</div>
						<sb-sparkline
							[data]="series(n.id, n.mem, 1)"
							[width]="120"
							[height]="32"
							color="#3b82f6"
						></sb-sparkline>
					</div>
					<div class="node-mini">
						<div
							style="display:flex; justify-content:space-between; align-items:baseline"
						>
							<span class="node-mini__label">Disk</span>
							<span class="node-mini__value">{{ n.disk }}%</span>
						</div>
						<sb-sparkline
							[data]="series(n.id, n.disk, 2)"
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
	],
})
export class NodesPageComponent {
	private readonly apollo = inject(Apollo);

	readonly filter = signal<"all" | "manager" | "worker">("all");
	readonly query = signal("");

	readonly filters = [
		{ value: "all", label: "All" },
		{ value: "manager", label: "Managers" },
		{ value: "worker", label: "Workers" },
	];

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

	series(id: string, base: number, kind: number): number[] {
		return nodeSpark(id, base, kind);
	}
}
