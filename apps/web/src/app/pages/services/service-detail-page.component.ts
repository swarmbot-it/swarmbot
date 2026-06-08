import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { Apollo } from "apollo-angular";
import { combineLatest, map, switchMap } from "rxjs";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import {
	QUERY_NETWORKS,
	QUERY_SECRETS,
	QUERY_CONFIGS,
	QUERY_SERVICE,
	QUERY_TASKS,
} from "../../core/graphql.queries";
import { BackLinkComponent } from "../../shared/back-link.component";
import { IconComponent } from "../../shared/icon.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { SplitButtonComponent } from "../../shared/split-button.component";
import { DonutComponent } from "../../shared/donut.component";
import { DetailSectionComponent } from "../../shared/detail-section.component";
import { DataTableComponent } from "../../shared/data-table.component";
import { SparklineComponent } from "../../shared/sparkline.component";
import { formatRelativeTime } from "../../core/relative-time";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { resourceBelongsToStack } from "../../core/stack-scope";

type ServiceDetail = {
	id: string;
	name: string;
	image: string;
	replicasRunning: number;
	replicasTotal: number;
	status: string;
	stack: string | null;
	mode: string;
	created: string;
	updated: string;
	env: Array<{ key: string; value: string }>;
	labels: Array<{ key: string; value: string }>;
	secretNames: string[];
	configNames: string[];
	publishedPorts: Array<{
		containerPort: number;
		hostPort: number;
		protocol: string;
		mode: string;
	}>;
	bindMounts: Array<{
		containerPath: string;
		hostPath: string;
		readOnly: boolean;
	}>;
	volumeMounts: Array<{
		containerPath: string;
		volumeName: string;
		readOnly: boolean;
		driver: string;
	}>;
};
type TaskRow = {
	id: string;
	serviceId: string;
	name: string;
	image: string;
	node: string;
	cpu: number;
	mem: number;
	updated: string;
	status: string;
	cpuSeries: number[];
	memSeries: number[];
};
type NetworkRow = {
	name: string;
	driver: string;
	subnet: string;
	gateway: string;
};
type NamedRow = { name: string; updated: string };

@Component({
	selector: "sb-service-detail-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="vm$ | async as vm">
			<sb-back-link
				link="/app/services"
				[label]="'pages.serviceDetail.back' | transloco"
			></sb-back-link>
			<div class="page-header">
				<div>
					<h1 class="page-header__title" style="display:flex;align-items:center;gap:14px;">
						<sb-icon name="services" [size]="22"></sb-icon>
						{{ vm.svc?.name }}
						<sb-status *ngIf="vm.svc" [status]="vm.svc.status ?? 'UNKNOWN'"></sb-status>
					</h1>
					<div class="page-header__subtitle mono" style="font-size:12.5px;">
						{{ vm.svc?.image }}
					</div>
				</div>
				<sb-split-button [actions]="svcActions" (action)="onAction($event)"></sb-split-button>
			</div>

			<div class="svc-summary" *ngIf="vm.svc">
				<div class="svc-summary__pie">
					<sb-donut
						[size]="120"
						[stroke]="16"
						[value]="vm.replicaPct ?? 0"
						[valueLabel]="vm.replicaLabel"
						[label]="'pages.serviceDetail.replicas' | transloco"
						color="var(--success)"
					></sb-donut>
					<div class="svc-summary__legend">
						<div class="svc-summary__legend-row">
							<span class="dot dot--success"></span>
							<span>{{ "pages.serviceDetail.running" | transloco }}</span>
							<strong>{{ vm.svc.replicasRunning }}</strong>
						</div>
						<div class="svc-summary__legend-row">
							<span
								class="dot"
								style="background:var(--muted-2); box-shadow:none"
							></span>
							<span>{{ "pages.serviceDetail.stopped" | transloco }}</span>
							<strong>{{ vm.stopped }}</strong>
						</div>
					</div>
				</div>
				<div class="svc-summary__meta">
					<div class="svc-meta" *ngFor="let f of vm.metaFields">
						<div class="svc-meta__label">{{ f.label }}</div>
						<div class="svc-meta__value" [class.mono]="f.mono">{{ f.value }}</div>
					</div>
				</div>
			</div>

			<div class="svc-body">
				<aside class="svc-tiles">
					<div class="svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="settings" [size]="14"></sb-icon>
							{{ "pages.serviceDetail.env" | transloco }}
							<span class="svc-tile__count">{{ vm.svc?.env?.length ?? 0 }}</span>
						</div>
						<div class="svc-tile__body">
							<dl class="kv-grid" *ngIf="vm.svc?.env?.length; else envEmpty">
								<ng-container *ngFor="let e of vm.svc?.env">
									<dt>{{ e.key }}</dt>
									<dd>{{ e.value }}</dd>
								</ng-container>
							</dl>
							<ng-template #envEmpty>
								<div style="padding:12px 16px;font-size:12px;color:var(--muted)">
									{{ "pages.serviceDetail.noEntries" | transloco }}
								</div>
							</ng-template>
						</div>
					</div>
					<div class="svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="filter" [size]="14"></sb-icon>
							{{ "pages.serviceDetail.labels" | transloco }}
							<span class="svc-tile__count">{{ vm.svc?.labels?.length ?? 0 }}</span>
						</div>
						<div class="svc-tile__body">
							<dl class="kv-grid" *ngIf="vm.svc?.labels?.length; else labelsEmpty">
								<ng-container *ngFor="let l of vm.svc?.labels">
									<dt>{{ l.key }}</dt>
									<dd>{{ l.value }}</dd>
								</ng-container>
							</dl>
							<ng-template #labelsEmpty>
								<div style="padding:12px 16px;font-size:12px;color:var(--muted)">
									{{ "pages.serviceDetail.noEntries" | transloco }}
								</div>
							</ng-template>
						</div>
					</div>
					<div class="svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="secrets" [size]="14"></sb-icon>
							{{ "pages.serviceDetail.secrets" | transloco }}
							<span class="svc-tile__count">{{ vm.secretRows.length }}</span>
						</div>
						<div class="svc-tile__body">
							<ul class="svc-tile__list" *ngIf="vm.secretRows.length; else secretsEmpty">
								<li *ngFor="let s of vm.secretRows">
									<div class="svc-tile__primary">{{ s.name }}</div>
									<div class="svc-tile__secondary">
										{{ "pages.serviceDetail.updated" | transloco }} {{ s.updated }}
									</div>
								</li>
							</ul>
							<ng-template #secretsEmpty>
								<div style="padding:12px 16px;font-size:12px;color:var(--muted)">
									{{ "pages.serviceDetail.noSecrets" | transloco }}
								</div>
							</ng-template>
						</div>
					</div>
					<div class="svc-tile">
						<div class="svc-tile__head">
							<sb-icon name="configs" [size]="14"></sb-icon>
							{{ "pages.serviceDetail.configs" | transloco }}
							<span class="svc-tile__count">{{ vm.configRows.length }}</span>
						</div>
						<div class="svc-tile__body">
							<ul class="svc-tile__list" *ngIf="vm.configRows.length; else configsEmpty">
								<li *ngFor="let c of vm.configRows">
									<div class="svc-tile__primary">{{ c.name }}</div>
									<div class="svc-tile__secondary">
										{{ "pages.serviceDetail.updated" | transloco }} {{ c.updated }}
									</div>
								</li>
							</ul>
							<ng-template #configsEmpty>
								<div style="padding:12px 16px;font-size:12px;color:var(--muted)">
									{{ "pages.serviceDetail.noConfigs" | transloco }}
								</div>
							</ng-template>
						</div>
					</div>
				</aside>

				<section class="svc-tables">
					<sb-detail-section
						sectionClass="detail-section--svc-tasks"
						[title]="'pages.serviceDetail.tasks' | transloco"
						icon="tasks"
						[count]="vm.tasks.length"
					>
						<sb-data-table
							[columns]="taskCols()"
							[rows]="vm.tasks"
							[pageSize]="6"
							[searchKeys]="['name', 'node', 'status']"
							[rowRoute]="taskRowRoute"
						>
							<ng-template #cell let-row let-key="key">
								<span *ngIf="key === 'name'" class="link-name mono">{{ row.name }}</span>
								<span *ngIf="key === 'node'" class="mono">{{ row.node }}</span>
								<div *ngIf="key === 'cpu'" class="meter col-hide-narrow">
									<sb-sparkline
										[data]="row.cpuSeries"
										[width]="60"
										[height]="20"
										color="var(--primary-500)"
									></sb-sparkline>
									<span class="meter__value">{{ row.cpu }}%</span>
								</div>
								<div *ngIf="key === 'mem'" class="meter col-hide-narrow">
									<sb-sparkline
										[data]="row.memSeries"
										[width]="60"
										[height]="20"
										color="#3b82f6"
									></sb-sparkline>
									<span class="meter__value">{{ row.mem }}%</span>
								</div>
								<span *ngIf="key === 'updated'" style="color:var(--muted)">{{
									row.updated
								}}</span>
								<sb-status *ngIf="key === 'status'" [status]="row.status"></sb-status>
							</ng-template>
						</sb-data-table>
					</sb-detail-section>

					<sb-detail-section
						[title]="'pages.serviceDetail.networks' | transloco"
						icon="networks"
						[count]="vm.networks.length"
					>
						<sb-data-table
							[columns]="networkCols()"
							[rows]="vm.networks"
							[pageSize]="5"
							[searchKeys]="['name', 'driver', 'subnet']"
						>
							<ng-template #cell let-row let-key="key">
								<span *ngIf="key === 'name'" style="font-weight:600">{{ row.name }}</span>
								<span *ngIf="key === 'driver'" class="badge badge--neutral">{{
									row.driver
								}}</span>
								<span *ngIf="key === 'subnet'" class="mono">{{ row.subnet }}</span>
								<span *ngIf="key === 'gateway'" class="mono">{{ row.gateway }}</span>
							</ng-template>
						</sb-data-table>
					</sb-detail-section>

					<sb-detail-section
						[title]="'pages.serviceDetail.publishedPorts' | transloco"
						icon="networks"
						[count]="vm.ports.length"
					>
						<sb-data-table
							*ngIf="vm.ports.length; else noPorts"
							[columns]="portCols()"
							[rows]="vm.ports"
							[pageSize]="5"
							[searchKeys]="['protocol', 'mode']"
						>
							<ng-template #cell let-row let-key="key">
								<span *ngIf="key === 'container'" class="mono">{{ row.containerPort }}</span>
								<span *ngIf="key === 'protocol'" class="tag">{{ row.protocol }}</span>
								<span *ngIf="key === 'mode'" class="tag tag--info">{{ row.mode }}</span>
								<span
									*ngIf="key === 'host'"
									class="mono"
									style="font-weight:600;text-align:right;display:block"
									>{{ row.hostPort }}</span
								>
							</ng-template>
						</sb-data-table>
						<ng-template #noPorts>
							<div class="t-empty">{{ "pages.serviceDetail.noPorts" | transloco }}</div>
						</ng-template>
					</sb-detail-section>

					<sb-detail-section
						[title]="'pages.serviceDetail.bindMounts' | transloco"
						icon="disk"
						[count]="vm.mounts.length"
					>
						<sb-data-table
							*ngIf="vm.mounts.length; else noMounts"
							[columns]="mountCols()"
							[rows]="vm.mounts"
							[pageSize]="5"
							[searchKeys]="['containerPath', 'hostPath']"
						>
							<ng-template #cell let-row let-key="key">
								<span *ngIf="key === 'container'" class="mono">{{ row.containerPath }}</span>
								<span *ngIf="key === 'host'" class="mono" style="color:var(--muted)">{{
									row.hostPath
								}}</span>
								<span *ngIf="key === 'ro'">
									<span class="tag" [class.tag--warning]="row.readOnly" [class.tag--success]="!row.readOnly">{{
										row.readOnly ? "RO" : "RW"
									}}</span>
								</span>
							</ng-template>
						</sb-data-table>
						<ng-template #noMounts>
							<div class="t-empty">{{ "pages.serviceDetail.noMounts" | transloco }}</div>
						</ng-template>
					</sb-detail-section>

					<sb-detail-section
						[title]="'pages.serviceDetail.volumes' | transloco"
						icon="volumes"
						[count]="vm.volumes.length"
					>
						<sb-data-table
							*ngIf="vm.volumes.length; else noVolumes"
							[columns]="volumeCols()"
							[rows]="vm.volumes"
							[pageSize]="5"
							[searchKeys]="['containerPath', 'volumeName', 'driver']"
						>
							<ng-template #cell let-row let-key="key">
								<span *ngIf="key === 'container'" class="mono">{{ row.containerPath }}</span>
								<span *ngIf="key === 'name'" style="font-weight:600">{{ row.volumeName }}</span>
								<span *ngIf="key === 'ro'">
									<span class="tag" [class.tag--warning]="row.readOnly" [class.tag--success]="!row.readOnly">{{
										row.readOnly ? "RO" : "RW"
									}}</span>
								</span>
								<span *ngIf="key === 'driver'" class="badge badge--neutral">{{
									row.driver
								}}</span>
							</ng-template>
						</sb-data-table>
						<ng-template #noVolumes>
							<div class="t-empty">{{ "pages.serviceDetail.noVolumes" | transloco }}</div>
						</ng-template>
					</sb-detail-section>
				</section>
			</div>
		</ng-container>
	`,
	imports: [
		NgIf,
		NgFor,
		AsyncPipe,
		TranslocoPipe,
		BackLinkComponent,
		IconComponent,
		StatusBadgeComponent,
		SplitButtonComponent,
		DonutComponent,
		DetailSectionComponent,
		DataTableComponent,
		SparklineComponent,
	],
})
export class ServiceDetailPageComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	readonly svcActions = [
		{ id: "edit", label: "Edit", icon: "edit", primary: true },
		{ id: "redeploy", label: "Redeploy", icon: "redeploy" },
		{ id: "rollback", label: "Rollback", icon: "rollback" },
		{ id: "scale", label: "Scale…", icon: "scale" },
		{ id: "delete", label: "Remove", icon: "trash", danger: true, separator: true },
	];

	readonly taskCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.task" },
		{ key: "node", labelKey: "columns.node" },
		{ key: "cpu", labelKey: "dashboard.cpu", width: 130 },
		{ key: "mem", labelKey: "dashboard.memory", width: 130 },
		{ key: "updated", labelKey: "columns.updated" },
		{ key: "status", labelKey: "columns.status" },
	]);

	readonly networkCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "pages.stacks.columns.networks" },
		{ key: "driver", labelKey: "columns.driver" },
		{ key: "subnet", labelKey: "columns.subnet" },
		{ key: "gateway", labelKey: "columns.gateway" },
	]);

	readonly portCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "container", labelKey: "pages.serviceDetail.containerPort" },
		{ key: "protocol", labelKey: "pages.serviceDetail.protocol" },
		{ key: "mode", labelKey: "pages.serviceDetail.mode" },
		{ key: "host", labelKey: "pages.serviceDetail.hostPort", align: "right" as const },
	]);

	readonly mountCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "container", labelKey: "pages.serviceDetail.containerPath" },
		{ key: "host", labelKey: "pages.serviceDetail.hostPath" },
		{ key: "ro", labelKey: "pages.serviceDetail.readOnly", align: "right" as const },
	]);

	readonly volumeCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "container", labelKey: "pages.serviceDetail.containerPath" },
		{ key: "name", labelKey: "pages.serviceDetail.volumeName" },
		{ key: "ro", labelKey: "pages.serviceDetail.readOnly" },
		{ key: "driver", labelKey: "columns.driver" },
	]);

	readonly vm$ = this.route.paramMap.pipe(
		switchMap((params) => {
			const id = params.get("id") ?? "";
			return combineLatest([
				this.apollo.watchQuery<{ service: ServiceDetail | null }>({
					query: QUERY_SERVICE,
					variables: { id },
				}).valueChanges,
				this.apollo.watchQuery<{ tasks: TaskRow[] }>({ query: QUERY_TASKS }).valueChanges,
				this.apollo.watchQuery<{ networks: NetworkRow[] }>({ query: QUERY_NETWORKS })
					.valueChanges,
				this.apollo.watchQuery<{ secrets: NamedRow[] }>({ query: QUERY_SECRETS }).valueChanges,
				this.apollo.watchQuery<{ configs: NamedRow[] }>({ query: QUERY_CONFIGS }).valueChanges,
			]).pipe(
				map(([svcRes, tasksRes, netRes, secRes, cfgRes]) => {
					const svc = svcRes.data?.service ?? null;
					const locale = this.i18n.activeLang();
					const tasks = ((tasksRes.data?.tasks ?? []) as TaskRow[]).filter(
						(t) => t.serviceId === id
					);
					const total = svc?.replicasTotal ?? 0;
					const running = svc?.replicasRunning ?? 0;
					const replicaPct = total > 0 ? Math.round((running / total) * 100) : 0;
					const stack = svc?.stack ?? "";
					const allNetworks = (netRes.data?.networks ?? []) as NetworkRow[];
					const networks = stack
						? allNetworks.filter((n) => resourceBelongsToStack(stack, n.name))
						: allNetworks.slice(0, 2);
					const secretsByName = new Map(
						((secRes.data?.secrets ?? []) as NamedRow[]).map((s) => [s.name, s])
					);
					const configsByName = new Map(
						((cfgRes.data?.configs ?? []) as NamedRow[]).map((c) => [c.name, c])
					);
					return {
						svc,
						tasks,
						stopped: Math.max(0, total - running),
						replicaPct,
						replicaLabel: `${running}/${total}`,
						ports: svc?.publishedPorts ?? [],
						mounts: svc?.bindMounts ?? [],
						volumes: svc?.volumeMounts ?? [],
						networks,
						secretRows: (svc?.secretNames ?? []).map((name) => ({
							name,
							updated: secretsByName.get(name)?.updated ?? "—",
						})),
						configRows: (svc?.configNames ?? []).map((name) => ({
							name,
							updated: configsByName.get(name)?.updated ?? "—",
						})),
						metaFields: svc
							? [
									{ label: "Service ID", value: svc.id, mono: true },
									{ label: "Image", value: svc.image, mono: true },
									{
										label: "Created",
										value: formatRelativeTime(svc.created, locale),
									},
									{
										label: "Last updated",
										value: formatRelativeTime(svc.updated, locale),
									},
									{ label: "Stack", value: svc.stack ?? "—" },
									{ label: "Mode", value: svc.mode },
								]
							: [],
					};
				})
			);
		})
	);

	readonly taskRowRoute = (row: TaskRow) => ["/app/tasks", row.id];

	onAction(_id: string): void {}
}
