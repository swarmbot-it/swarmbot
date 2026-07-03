import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { DatePipe, DecimalPipe, NgFor, NgIf, NgSwitch, NgSwitchCase } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Apollo } from "apollo-angular";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { ToastService } from "../../core/toast.service";
import { AuthService } from "../../core/auth.service";
import {
	MUTATION_REDEPLOY_SERVICE,
	MUTATION_REMOVE_SERVICE,
	MUTATION_ROLLBACK_SERVICE,
	MUTATION_SCALE_SERVICE,
	QUERY_NETWORKS,
	QUERY_SERVICE_DETAIL,
	QUERY_TASKS,
} from "../../core/graphql.queries";
import { IconComponent } from "../../shared/icon.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { ModalComponent } from "../../shared/modal.component";
import { DataTableComponent } from "../../shared/data-table.component";

type ServiceDetail = {
	id: string;
	name: string;
	image: string | null;
	replicasRunning: number;
	replicasTotal: number;
	ports: string[];
	status: string;
	stack: string | null;
	mode: string | null;
	created: string | null;
	updated: string | null;
	env: string[];
	labels: Array<{ k: string; v: string }>;
	networks: string[];
	mounts: Array<{ type: string; source: string | null; target: string; readOnly: boolean }>;
	secrets: string[];
	configs: string[];
};

type Task = {
	id: string;
	name: string;
	node: string;
	cpu: number;
	mem: number;
	status: string;
	serviceName: string | null;
	desiredState: string | null;
};

/**
 * Single service's configuration (env, labels, mounts, networks) and live task list,
 * with lifecycle actions (redeploy, rollback, scale, remove).
 */
@Component({
	selector: "sb-service-detail-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		NgIf,
		NgFor,
		NgSwitch,
		NgSwitchCase,
		DatePipe,
		DecimalPipe,
		FormsModule,
		TranslocoPipe,
		IconComponent,
		StatusBadgeComponent,
		ModalComponent,
		DataTableComponent,
	],
	template: `
		@if (loading()) {
			<div class="t-empty">{{ "common.loading" | transloco }}</div>
		} @else if (detail(); as d) {
			<div class="page-header" style="align-items:flex-start">
				<div>
					<button class="btn btn--ghost btn--sm" (click)="back()" style="margin-bottom:8px">
						<sb-icon name="chevronLeft" [size]="14"></sb-icon>
						{{ "pages.services.detail.back" | transloco }}
					</button>
					<h1 class="page-header__title" style="display:flex; align-items:center; gap:12px">
						<sb-icon name="services" [size]="20" style="color:var(--primary-500)"></sb-icon>
						{{ d.name }}
						<sb-status [status]="d.status"></sb-status>
					</h1>
					<div class="page-header__subtitle mono">{{ d.image }}</div>
				</div>
				<div class="splitbtn" *ngIf="auth.isEditor()">
					<button class="btn btn--primary splitbtn__main" [disabled]="busy()" (click)="edit()">
						<sb-icon name="settings" [size]="14"></sb-icon>
						{{ busy() ? ("pages.stacks.detail.working" | transloco) : ("pages.stacks.detail.edit" | transloco) }}
					</button>
					<button
						class="btn btn--primary splitbtn__caret"
						[disabled]="busy()"
						(click)="menuOpen.set(!menuOpen())"
					>
						<sb-icon name="chevronDown" [size]="14"></sb-icon>
					</button>
					@if (menuOpen()) {
						<div class="splitbtn__menu">
							<div class="splitbtn__item" (click)="redeploy()">
								<sb-icon name="refresh" [size]="14" style="color:var(--muted)"></sb-icon>
								<span>{{ "pages.stacks.detail.redeploy" | transloco }}</span>
							</div>
							<div class="splitbtn__item" (click)="rollback()">
								<sb-icon name="chevronLeft" [size]="14" style="color:var(--muted)"></sb-icon>
								<span>{{ "pages.stacks.detail.rollback" | transloco }}</span>
							</div>
							<div class="splitbtn__item" (click)="openScale()">
								<sb-icon name="services" [size]="14" style="color:var(--muted)"></sb-icon>
								<span>{{ "pages.services.detail.scale" | transloco }}</span>
							</div>
							<div class="splitbtn__sep"></div>
							<div class="splitbtn__item splitbtn__item--danger" (click)="remove()">
								<sb-icon name="trash" [size]="14"></sb-icon>
								<span>{{ "pages.stacks.detail.delete" | transloco }}</span>
							</div>
						</div>
					}
				</div>
			</div>

			<sb-modal
				[open]="scaleOpen()"
				[title]="'pages.services.detail.scale' | transloco"
				[subtitle]="'pages.services.detail.scaleSubtitle' | transloco: { name: d.name }"
				(close)="scaleOpen.set(false)"
			>
				<div class="field">
					<label class="field__label">{{ "pages.services.columns.replicas" | transloco }}</label>
					<input class="input" type="number" min="0" [ngModel]="scaleReplicas()" (ngModelChange)="scaleReplicas.set($event)" />
				</div>
				<ng-container modal-footer>
					<button class="btn btn--secondary" (click)="scaleOpen.set(false)">{{ "common.cancel" | transloco }}</button>
					<button class="btn btn--primary" [disabled]="busy()" (click)="scale()">
						{{ busy() ? ("pages.stacks.detail.working" | transloco) : ("pages.services.detail.scale" | transloco) }}
					</button>
				</ng-container>
			</sb-modal>

			<div class="card" style="margin-bottom:16px">
				<div class="card__body">
					<div class="meta-grid">
						<div class="meta">
							<div class="meta__label">{{ "pages.services.detail.serviceId" | transloco }}</div>
							<div class="meta__value mono">{{ d.id.slice(0, 16) }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "columns.stack" | transloco }}</div>
							<div class="meta__value">{{ d.stack || "—" }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "pages.services.detail.mode" | transloco }}</div>
							<div class="meta__value">{{ d.mode || "—" }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "pages.services.columns.replicas" | transloco }}</div>
							<div class="meta__value">{{ d.replicasRunning }} / {{ d.replicasTotal }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "columns.created" | transloco }}</div>
							<div class="meta__value">{{ d.created ? (d.created | date: "medium") : "—" }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "columns.updated" | transloco }}</div>
							<div class="meta__value">{{ d.updated ? (d.updated | date: "medium") : "—" }}</div>
						</div>
					</div>
				</div>
			</div>

			<div class="svc-body">
				<aside class="svc-tiles">
					<div class="card svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="settings" [size]="14" style="color:var(--primary-500)"></sb-icon>
							<span>{{ "pages.services.detail.env" | transloco }}</span>
							<span class="svc-tile__count">{{ d.env.length }}</span>
						</div>
						<div class="svc-tile__body">
							<div *ngIf="d.env.length === 0" class="svc-tile__empty">{{ "pages.services.detail.noEnv" | transloco }}</div>
							<ul class="svc-tile__list" *ngIf="d.env.length > 0">
								<li *ngFor="let e of d.env"><span class="mono">{{ e }}</span></li>
							</ul>
						</div>
					</div>
					<div class="card svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="configs" [size]="14" style="color:var(--primary-500)"></sb-icon>
							<span>{{ "pages.services.detail.labels" | transloco }}</span>
							<span class="svc-tile__count">{{ d.labels.length }}</span>
						</div>
						<div class="svc-tile__body">
							<div *ngIf="d.labels.length === 0" class="svc-tile__empty">{{ "pages.services.detail.noLabels" | transloco }}</div>
							<dl class="kv-grid" *ngIf="d.labels.length > 0">
								<ng-container *ngFor="let l of d.labels">
									<dt>{{ l.k }}</dt>
									<dd>{{ l.v }}</dd>
								</ng-container>
							</dl>
						</div>
					</div>
					<div class="card svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="secrets" [size]="14" style="color:var(--primary-500)"></sb-icon>
							<span>{{ "nav.secrets" | transloco }}</span>
							<span class="svc-tile__count">{{ d.secrets.length }}</span>
						</div>
						<div class="svc-tile__body">
							<div *ngIf="d.secrets.length === 0" class="svc-tile__empty">{{ "pages.services.detail.noSecrets" | transloco }}</div>
							<ul class="svc-tile__list" *ngIf="d.secrets.length > 0">
								<li *ngFor="let s of d.secrets"><span class="mono">{{ s }}</span></li>
							</ul>
						</div>
					</div>
					<div class="card svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="configs" [size]="14" style="color:var(--primary-500)"></sb-icon>
							<span>{{ "nav.configs" | transloco }}</span>
							<span class="svc-tile__count">{{ d.configs.length }}</span>
						</div>
						<div class="svc-tile__body">
							<div *ngIf="d.configs.length === 0" class="svc-tile__empty">{{ "pages.services.detail.noConfigs" | transloco }}</div>
							<ul class="svc-tile__list" *ngIf="d.configs.length > 0">
								<li *ngFor="let c of d.configs"><span class="mono">{{ c }}</span></li>
							</ul>
						</div>
					</div>
				</aside>

				<section class="svc-tables">
					<div class="detail-section">
						<div class="detail-section__head">
							<div class="detail-section__title">
								<sb-icon name="tasks" [size]="14" style="color:var(--primary-500)"></sb-icon>
								{{ "nav.tasks" | transloco }}
								<span class="detail-section__count">{{ tasksForService().length }}</span>
							</div>
						</div>
						<div class="detail-section__body">
							@if (tasksForService().length === 0) {
								<div class="t-empty">{{ "pages.services.detail.noTasks" | transloco }}</div>
							} @else {
								<sb-data-table [columns]="taskCols()" [rows]="tasksForService()" [searchKeys]="['name']" [pageSize]="5" (rowClick)="openTask($event.id)">
									<ng-template #cell let-row let-key="key">
										<ng-container [ngSwitch]="key">
											<strong *ngSwitchCase="'task'" class="mono">{{ row.name }}</strong>
											<span *ngSwitchCase="'node'" class="mono">{{ row.node || "—" }}</span>
											<span *ngSwitchCase="'cpu'" class="mono">{{ row.cpu | number: "1.0-1" }}%</span>
											<span *ngSwitchCase="'mem'" class="mono">{{ row.mem | number: "1.0-1" }}%</span>
											<sb-status *ngSwitchCase="'status'" [status]="row.status"></sb-status>
										</ng-container>
									</ng-template>
								</sb-data-table>
							}
						</div>
					</div>

					<div class="detail-grid">
						<div class="detail-section">
							<div class="detail-section__head">
								<div class="detail-section__title">
									<sb-icon name="networks" [size]="14" style="color:var(--primary-500)"></sb-icon>
									{{ "nav.networks" | transloco }}
									<span class="detail-section__count">{{ d.networks.length }}</span>
								</div>
							</div>
							<div class="detail-section__body">
								<div *ngIf="d.networks.length === 0" class="t-empty">{{ "pages.services.detail.noNetworks" | transloco }}</div>
								<ul class="resource-list" *ngIf="d.networks.length > 0">
									<li *ngFor="let nid of d.networks">
										<sb-icon name="networks" [size]="14"></sb-icon>
										<span>{{ networkName(nid) }}</span>
									</li>
								</ul>
							</div>
						</div>
						<div class="detail-section">
							<div class="detail-section__head">
								<div class="detail-section__title">
									<sb-icon name="services" [size]="14" style="color:var(--primary-500)"></sb-icon>
									{{ "pages.services.columns.ports" | transloco }}
									<span class="detail-section__count">{{ d.ports.length }}</span>
								</div>
							</div>
							<div class="detail-section__body">
								<div *ngIf="d.ports.length === 0" class="t-empty">{{ "pages.services.detail.noPorts" | transloco }}</div>
								<div *ngIf="d.ports.length > 0" style="display:flex; flex-wrap:wrap; gap:6px">
									<span class="tag" style="background:var(--surface-2); color:var(--text-2); text-transform:none" *ngFor="let p of d.ports">{{ p }}</span>
								</div>
							</div>
						</div>
					</div>

					<div class="detail-section">
						<div class="detail-section__head">
							<div class="detail-section__title">
								<sb-icon name="volumes" [size]="14" style="color:var(--primary-500)"></sb-icon>
								{{ "pages.services.detail.mounts" | transloco }}
								<span class="detail-section__count">{{ d.mounts.length }}</span>
							</div>
						</div>
						<div class="detail-section__body">
							@if (d.mounts.length === 0) {
								<div class="t-empty">{{ "pages.services.detail.noMounts" | transloco }}</div>
							} @else {
								<sb-data-table [columns]="mountCols()" [rows]="d.mounts" [searchable]="false" [pageSize]="5">
									<ng-template #cell let-row let-key="key">
										<ng-container [ngSwitch]="key">
											<span *ngSwitchCase="'source'" class="mono" style="color:var(--muted)">{{ row.source || "—" }}</span>
											<span *ngSwitchCase="'target'" class="mono">{{ row.target }}</span>
											<span *ngSwitchCase="'type'" class="badge badge--neutral">{{ row.type }}</span>
											<span *ngSwitchCase="'readOnly'" class="tag" [class.tag--warning]="row.readOnly" [class.tag--success]="!row.readOnly">{{ row.readOnly ? "RO" : "RW" }}</span>
										</ng-container>
									</ng-template>
								</sb-data-table>
							}
						</div>
					</div>
				</section>
			</div>
		} @else {
			<div class="t-empty">{{ "pages.services.detail.notFound" | transloco }}</div>
		}
	`,
	styles: [
		`
			.t-empty {
				padding: 40px;
				text-align: center;
				color: var(--muted);
				font-size: 13px;
			}
			.meta-grid {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 18px;
			}
			.meta__label {
				font-size: 11px;
				color: var(--muted);
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.meta__value {
				font-size: 14px;
				font-weight: 600;
				margin-top: 4px;
			}
			.svc-body {
				display: grid;
				grid-template-columns: 280px 1fr;
				gap: 16px;
				align-items: start;
			}
			.svc-tiles {
				display: flex;
				flex-direction: column;
				gap: 16px;
			}
			.svc-tile__head {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 12px 16px;
				border-bottom: 1px solid var(--border);
				font-size: 12.5px;
				font-weight: 600;
			}
			.svc-tile__count {
				margin-left: auto;
				font-size: 11px;
				color: var(--muted);
				background: var(--surface-2);
				border-radius: 999px;
				padding: 1px 8px;
			}
			.svc-tile__empty {
				padding: 12px 16px;
				font-size: 12px;
				color: var(--muted);
			}
			.svc-tile__list {
				list-style: none;
				margin: 0;
				padding: 8px 0;
				max-height: 180px;
				overflow-y: auto;
			}
			.svc-tile__list li {
				padding: 6px 16px;
				font-size: 12px;
				word-break: break-all;
			}
			.kv-grid {
				margin: 0;
				padding: 10px 16px;
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 6px 12px;
				max-height: 180px;
				overflow-y: auto;
			}
			.kv-grid dt {
				font-size: 11.5px;
				color: var(--muted);
				font-family: var(--font-mono);
			}
			.kv-grid dd {
				margin: 0;
				font-size: 11.5px;
				font-family: var(--font-mono);
				word-break: break-all;
			}
			.svc-tables {
				display: flex;
				flex-direction: column;
				gap: 16px;
			}
			.detail-section {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				box-shadow: var(--shadow-1);
			}
			.detail-grid {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 16px;
			}
			.detail-section__head {
				padding: 16px 20px;
				border-bottom: 1px solid var(--border);
			}
			.detail-section__title {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 14px;
				font-weight: 600;
			}
			.detail-section__count {
				font-size: 11.5px;
				color: var(--muted);
				font-weight: 600;
				background: var(--surface-2);
				border-radius: 999px;
				padding: 1px 8px;
			}
			.detail-section__body {
				padding: 20px;
			}
			.resource-list {
				list-style: none;
				margin: 0;
				padding: 0;
				display: flex;
				flex-direction: column;
				gap: 8px;
			}
			.resource-list li {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 8px 10px;
				background: var(--surface-2);
				border-radius: var(--r-md);
				font-size: 12.5px;
			}
			.splitbtn {
				position: relative;
				display: inline-flex;
			}
			.splitbtn__main {
				border-top-right-radius: 0;
				border-bottom-right-radius: 0;
			}
			.splitbtn__caret {
				border-top-left-radius: 0;
				border-bottom-left-radius: 0;
				border-left: 1px solid rgba(255, 255, 255, 0.25);
				padding-left: 8px;
				padding-right: 8px;
			}
			.splitbtn__menu {
				position: absolute;
				top: calc(100% + 6px);
				right: 0;
				min-width: 200px;
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
			.splitbtn__sep {
				height: 1px;
				background: var(--border);
				margin: 6px 4px;
			}
			.splitbtn__item--danger {
				color: var(--danger);
			}
		`,
	],
})
export class ServiceDetailPageComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly apollo = inject(Apollo);
	private readonly toast = inject(ToastService);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	private readonly destroyRef = inject(DestroyRef);
	readonly auth = inject(AuthService);

	private readonly id = this.route.snapshot.paramMap.get("id") || "";

	readonly loading = signal(true);
	readonly detail = signal<ServiceDetail | null>(null);
	readonly menuOpen = signal(false);
	readonly busy = signal(false);
	readonly scaleOpen = signal(false);
	readonly scaleReplicas = signal(0);

	private readonly allTasks = signal<Task[]>([]);
	private readonly networkNames = signal<Map<string, string>>(new Map());

	readonly tasksForService = computed(() => {
		const d = this.detail();
		if (!d) return [];
		return this.allTasks().filter((t) => t.serviceName === d.name);
	});

	readonly taskCols = translatedColumns<Task>(this.transloco, this.i18n.activeLang, [
		{ key: "task", labelKey: "columns.task" },
		{ key: "node", labelKey: "columns.node" },
		{ key: "cpu", labelKey: "dashboard.cpu", align: "right" },
		{ key: "mem", labelKey: "dashboard.memory", align: "right" },
		{ key: "status", labelKey: "columns.status" },
	]);

	readonly mountCols = translatedColumns<{ type: string; source: string | null; target: string; readOnly: boolean }>(
		this.transloco,
		this.i18n.activeLang,
		[
			{ key: "source", labelKey: "pages.services.detail.mountSource" },
			{ key: "target", labelKey: "pages.services.detail.mountTarget" },
			{ key: "type", labelKey: "columns.type" },
			{ key: "readOnly", labelKey: "pages.services.detail.mountMode", align: "right" },
		]
	);

	ngOnInit(): void {
		this.loadDetail();
		this.loadTasks();
		this.apollo
			.query<{ networks: Array<{ id: string; name: string }> }>({ query: QUERY_NETWORKS, fetchPolicy: "network-only" })
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => {
				const map = new Map<string, string>();
				for (const n of r.data?.networks ?? []) map.set(n.id, n.name);
				this.networkNames.set(map);
			});
	}

	private loadDetail(): void {
		this.apollo
			.query<{ service: ServiceDetail | null }>({
				query: QUERY_SERVICE_DETAIL,
				variables: { id: this.id },
				fetchPolicy: "network-only",
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => {
				this.detail.set(r.data?.service ?? null);
				this.loading.set(false);
			});
	}

	private loadTasks(): void {
		this.apollo
			.query<{ tasks: Task[] }>({ query: QUERY_TASKS, fetchPolicy: "network-only" })
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => this.allTasks.set((r.data?.tasks ?? []) as Task[]));
	}

	private reloadAfterAction(): void {
		setTimeout(() => {
			this.loadDetail();
			this.loadTasks();
		}, 2500);
		setTimeout(() => {
			this.loadDetail();
			this.loadTasks();
		}, 6000);
	}

	networkName(id: string): string {
		return this.networkNames().get(id) || id.slice(0, 12);
	}

	back(): void {
		this.router.navigate(["/app/services"]);
	}

	openTask(id: string): void {
		this.router.navigate(["/app/tasks", id]);
	}

	edit(): void {
		this.menuOpen.set(false);
		this.toast.push("warn", this.transloco.translate("pages.services.detail.editUnsupported"));
	}

	redeploy(): void {
		this.menuOpen.set(false);
		const d = this.detail();
		if (!d) return;
		if (d.replicasTotal === 0) {
			this.toast.push("warn", this.transloco.translate("pages.services.detail.toastNothingToRedeploy", { name: d.name }));
			return;
		}
		this.busy.set(true);
		this.apollo
			.mutate<{ redeployService: boolean }>({ mutation: MUTATION_REDEPLOY_SERVICE, variables: { id: this.id } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.services.detail.toastRedeploying", { name: d.name }));
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.services.detail.redeployFailed"));
				},
			});
	}

	rollback(): void {
		this.menuOpen.set(false);
		const d = this.detail();
		this.busy.set(true);
		this.apollo
			.mutate<{ rollbackService: boolean }>({ mutation: MUTATION_ROLLBACK_SERVICE, variables: { id: this.id } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.services.detail.toastRolledBack", { name: d?.name ?? "" }));
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.services.detail.rollbackFailed"));
				},
			});
	}

	openScale(): void {
		this.menuOpen.set(false);
		this.scaleReplicas.set(this.detail()?.replicasTotal ?? 0);
		this.scaleOpen.set(true);
	}

	scale(): void {
		const d = this.detail();
		this.busy.set(true);
		this.apollo
			.mutate<{ scaleService: boolean }>({
				mutation: MUTATION_SCALE_SERVICE,
				variables: { id: this.id, replicas: this.scaleReplicas() },
			})
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.scaleOpen.set(false);
					this.toast.push(
						"success",
						this.transloco.translate("pages.services.detail.toastScaled", { name: d?.name ?? "", replicas: this.scaleReplicas() })
					);
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.services.detail.scaleFailed"));
				},
			});
	}

	remove(): void {
		this.menuOpen.set(false);
		const d = this.detail();
		if (!d) return;
		if (!confirm(this.transloco.translate("pages.services.detail.confirmRemove", { name: d.name }))) return;
		this.busy.set(true);
		this.apollo
			.mutate<{ removeService: boolean }>({ mutation: MUTATION_REMOVE_SERVICE, variables: { id: this.id } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.services.detail.toastRemoved", { name: d.name }));
					this.back();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.services.detail.removeFailed"));
				},
			});
	}
}
