import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { TranslocoPipe } from "@jsverse/transloco";
import { QUERY_NODE_MAP } from "../../core/graphql.queries";

type NodeMapNode = {
	id: string;
	hostname: string;
	role: string;
	availability: string | null;
	ip: string;
	dockerVersion: string;
	tags: string[];
	cpu: number;
	mem: number;
	disk: number;
	cpuHistory: number[] | null;
	memHistory: number[] | null;
	diskHistory: number[] | null;
};

type NodeMapChip = {
	taskId: string;
	serviceName: string;
	image: string;
	category: string;
	cpu: number;
	mem: number;
	status: string;
};

type NodeMapEntry = {
	node: NodeMapNode;
	services: NodeMapChip[];
};

type ServiceSummaryRow = {
	serviceName: string;
	category: string;
	nodeCount: number;
	taskCount: number;
	avgCpu: number;
	avgMem: number;
};

type ClusterTotals = {
	nodeCount: number;
	distinctServices: number;
	taskCount: number;
	avgCpu: number;
	avgMem: number;
	busiestHostname: string;
	busiestCpu: number;
};

const CATEGORIES = ["data", "identity", "network", "ops", "app"] as const;

/**
 * Node & resource map: masthead with status pills, legend, role rows of node
 * cards with dense service chips, per-service summary, cluster totals + key
 * flows, mono caption footer. Colors/fonts are aliases onto swarmbot.it's own
 * theme tokens (`styles.scss`), so the page follows the app's light/dark mode
 * like every other page. All numbers are live from the `nodeMap` GraphQL
 * query — nothing static.
 */
@Component({
	selector: "sb-node-map-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="entries$ | async as entries">
			<!-- ============ MASTHEAD ============ -->
			<header class="masthead">
				<div class="masthead__brand">
					<div>
						<div class="masthead__eyebrow">{{ "pages.nodeMap.masthead.eyebrow" | transloco }}</div>
						<h1 class="masthead__title">{{ "nav.nodeMap" | transloco }}</h1>
						<div class="masthead__subtitle">
							{{ "pages.nodeMap.masthead.subtitle" | transloco: { total: entries.length } }}
						</div>
					</div>
				</div>
				<div class="masthead__side">
					<div class="masthead__pills">
						<span class="pill pill--orange">
							<span class="pill__dot"></span>
							{{
								"pages.nodeMap.pills.ready"
									| transloco: { ready: readyCount(entries), total: entries.length }
							}}
						</span>
						<span class="pill pill--navy">
							{{ "pages.nodeMap.pills.tasks" | transloco: { count: totalServices(entries) } }}
						</span>
					</div>
					<span class="masthead__caption">{{ "pages.nodeMap.pills.caption" | transloco }}</span>
				</div>
			</header>

			<!-- ============ LEGEND ============ -->
			<div class="legend">
				<div class="legend__group">
					<span class="legend__label">{{ "pages.nodeMap.legend.roles" | transloco }}</span>
					<span class="legend__item">
						<span class="role-badge" style="color:var(--role-manager)">S</span>
						{{ "pages.nodeMap.legend.manager" | transloco }}
					</span>
					<span class="legend__item">
						<span class="role-badge" style="color:var(--role-worker)">W</span>
						{{ "pages.nodeMap.legend.worker" | transloco }}
					</span>
				</div>
				<span class="legend__divider"></span>
				<div class="legend__group">
					<span class="legend__label">{{ "pages.nodeMap.legend.categories" | transloco }}</span>
					<span class="legend__item" *ngFor="let cat of categories">
						<span class="legend__swatch" [style.background]="catVar(cat)"></span>
						{{ "pages.nodeMap.categories." + cat | transloco }}
					</span>
				</div>
				<span class="legend__divider"></span>
				<div class="legend__group">
					<span class="legend__label">{{ "pages.nodeMap.legend.status" | transloco }}</span>
					<span class="legend__item">
						<span class="legend__dot"></span>
						{{ "pages.nodeMap.legend.running" | transloco }}
					</span>
					<span class="legend__item">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--role-drain)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 3 2 20h20L12 3Z"></path>
							<path d="M12 10v4M12 17.5v.01"></path>
						</svg>
						{{ "pages.nodeMap.legend.attention" | transloco }}
					</span>
				</div>
			</div>

			<!-- ============ NODE ROWS ============ -->
			<ng-container *ngFor="let group of groupedEntries(entries)">
				<div
					class="row-label"
					*ngIf="group.entries.length"
					[style.color]="group.key === 'managers' ? 'var(--role-manager)' : 'var(--role-worker)'"
				>
					{{ "pages.nodeMap.groups." + group.key | transloco }}
					<span class="row-label__hosts">· {{ hostList(group.entries) }}</span>
				</div>
				<div class="node-grid" *ngIf="group.entries.length">
					<div
						*ngFor="let entry of group.entries"
						class="node-card"
						[style.border-top-color]="isDrained(entry) ? 'var(--role-drain)' : roleVar(entry.node.role)"
					>
						<div class="node-card__top">
							<span class="node-card__id">
								<span class="role-badge" [style.color]="roleVar(entry.node.role)">
									{{ entry.node.role === "manager" ? "S" : "W" }}
								</span>
								<span class="node-card__hostname">{{ entry.node.hostname }}</span>
								<span class="node-pill node-pill--orange" *ngIf="entry.node.hostname === peakHostname(entries)">PEAK</span>
								<span class="node-pill node-pill--ink" *ngIf="entry.node.tags.includes('LEADER')">
									{{ "dashboard.tags.leader" | transloco }}
								</span>
								<span class="node-pill node-pill--burgundy" *ngIf="isDrained(entry)">
									{{ "dashboard.tags.drain" | transloco }}
								</span>
							</span>
							<span class="node-card__meta">{{ entry.node.ip }} · {{ entry.node.dockerVersion }}</span>
						</div>

						<div class="node-usage">
							<div class="node-usage__row">
								<span>{{ "pages.nodes.labels.memory" | transloco }} {{ entry.node.mem }}%</span>
								<span>
									{{ "pages.nodes.labels.cpu" | transloco }} {{ entry.node.cpu }}% ·
									{{ "pages.nodes.labels.disk" | transloco }} {{ entry.node.disk }}%
								</span>
							</div>
							<div class="node-usage__bar">
								<div
									[style.width.%]="entry.node.mem"
									[style.background]="entry.node.hostname === peakHostname(entries) ? 'var(--nh-orange)' : roleVar(entry.node.role)"
								></div>
							</div>
						</div>

						<div class="chips">
							<div *ngIf="entry.services.length === 0" class="chips__empty">
								{{ "pages.nodeMap.empty" | transloco }}
							</div>
							<div
								*ngFor="let svc of entry.services"
								class="chip"
								[style.border-left-color]="catVar(svc.category)"
								[title]="svc.image"
							>
								<span class="chip__name">{{ svc.serviceName }}</span>
								<svg
									*ngIf="svc.status !== 'RUNNING'"
									class="chip__warn"
									width="12" height="12" viewBox="0 0 24 24" fill="none"
									stroke="var(--role-drain)" stroke-width="2.2"
									stroke-linecap="round" stroke-linejoin="round"
								>
									<path d="M12 3 2 20h20L12 3Z"></path>
									<path d="M12 10v4M12 17.5v.01"></path>
								</svg>
								<span class="chip__stats" [class.chip__stats--hot]="svc.cpu >= 60 || svc.mem >= 60">
									{{ svc.cpu }}% · {{ svc.mem }}%
								</span>
							</div>
						</div>
					</div>
				</div>
			</ng-container>

			<!-- ============ LOWER: summary + totals/flows ============ -->
			<div class="lower">
				<div class="panel panel--summary">
					<div class="panel__title">
						<span class="panel__accent" style="background:var(--nh-orange)"></span>
						{{ "pages.nodeMap.summary.title" | transloco }}
					</div>
					<div class="summary-cols">
						<div class="summary-col" *ngFor="let col of summaryColumns(entries)">
							<div class="summary-row summary-row--head">
								<span>{{ "pages.nodeMap.summary.service" | transloco }}</span>
								<span>{{ "pages.nodeMap.summary.nodes" | transloco }}</span>
								<span class="summary-row__num">{{ "pages.nodeMap.summary.cpuAvg" | transloco }}</span>
								<span class="summary-row__num">{{ "pages.nodeMap.summary.memAvg" | transloco }}</span>
							</div>
							<div class="summary-row" *ngFor="let row of col">
								<span class="summary-row__name" [style.border-left-color]="catVar(row.category)">
									{{ row.serviceName }}
									<span class="summary-row__count">×{{ row.taskCount }}</span>
								</span>
								<span class="summary-row__muted">{{ row.nodeCount }}</span>
								<span class="summary-row__num">{{ row.avgCpu }}%</span>
								<span class="summary-row__num">{{ row.avgMem }}%</span>
							</div>
						</div>
					</div>
				</div>

				<div class="lower__side">
					<div class="panel">
						<div class="panel__title">
							<span class="panel__accent" style="background:var(--role-manager)"></span>
							{{ "pages.nodeMap.totals.title" | transloco }}
						</div>
						<div class="totals-grid" *ngIf="clusterTotals(entries) as totals">
							<div class="totals-tile">
								<div class="totals-tile__value" style="color:var(--role-manager)">{{ totals.nodeCount }}</div>
								<div class="totals-tile__label">{{ "pages.nodeMap.totals.nodes" | transloco }}</div>
							</div>
							<div class="totals-tile">
								<div class="totals-tile__value" style="color:var(--nh-orange-deep)">{{ totals.distinctServices }}</div>
								<div class="totals-tile__label">{{ "pages.nodeMap.totals.services" | transloco }}</div>
							</div>
							<div class="totals-tile">
								<div class="totals-tile__value">{{ totals.taskCount }}</div>
								<div class="totals-tile__label">{{ "pages.nodeMap.totals.tasks" | transloco }}</div>
							</div>
							<div class="totals-tile">
								<div class="totals-tile__value">{{ totals.avgCpu }}%</div>
								<div class="totals-tile__label">{{ "pages.nodeMap.totals.avgCpu" | transloco }}</div>
							</div>
							<div class="totals-tile">
								<div class="totals-tile__value">{{ totals.avgMem }}%</div>
								<div class="totals-tile__label">{{ "pages.nodeMap.totals.avgMem" | transloco }}</div>
							</div>
							<div class="totals-tile">
								<div class="totals-tile__value totals-tile__value--sm" style="color:var(--nh-orange-deep)">
									{{ totals.busiestHostname }}
								</div>
								<div class="totals-tile__label">{{ "pages.nodeMap.totals.busiest" | transloco }}</div>
							</div>
						</div>
						<div class="note" *ngIf="clusterTotals(entries) as totals">
							{{
								"pages.nodeMap.totals.note"
									| transloco: { host: totals.busiestHostname, cpu: totals.busiestCpu }
							}}
						</div>
					</div>

					<div class="panel">
						<div class="panel__title">
							<span class="panel__accent" style="background:var(--nh-orange)"></span>
							{{ "pages.nodeMap.flows.title" | transloco }}
						</div>
						<div class="flow" *ngFor="let f of flows; let i = index">
							<span class="flow__num" [style.background]="f.color">{{ i + 1 }}</span>
							<div class="flow__text">
								<strong>{{ "pages.nodeMap.flows." + f.label | transloco }}</strong>
								— {{ "pages.nodeMap.flows." + f.text | transloco }}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- ============ FOOTER ============ -->
			<footer class="foot">
				<span class="foot__caption">
					{{ "pages.nodeMap.footer.caption" | transloco: { total: entries.length } }}
				</span>
			</footer>
		</ng-container>
	`,
	styles: [
		`
			/* Aliases onto the app's own theme tokens (styles.scss) — same palette as
			   every other page, already dark/light-aware via [data-theme]. */
			:host {
				--nh-orange: var(--primary-500);
				--nh-orange-deep: var(--primary-600);
				--nh-line: var(--border);
				--cat-data: var(--success);
				--cat-identity: var(--warning);
				--cat-network: var(--info);
				--cat-ops: var(--neutral);
				--cat-app: var(--primary-500);
				--role-manager: var(--primary-500);
				--role-worker: var(--muted);
				--role-drain: var(--danger);
				--nm-card: var(--surface);
				--nm-tile: var(--surface-2);
				--nm-strong: var(--text);
				--nm-body: var(--text-2);
				--nm-muted: var(--muted);
				--nm-border: var(--border);
				--nm-shadow: var(--shadow-1);
				--nm-sans: var(--font-sans);
				--nm-mono: var(--font-mono);
				display: block;
				color: var(--nm-strong);
			}
			@keyframes pulse {
				0%,
				100% {
					box-shadow: 0 0 0 0 color-mix(in srgb, var(--nh-orange) 50%, transparent);
				}
				50% {
					box-shadow: 0 0 0 5px transparent;
				}
			}

			/* ── Masthead ─────────────────────────────────────────── */
			.masthead {
				display: flex;
				justify-content: space-between;
				align-items: flex-end;
				gap: 24px;
				margin-bottom: 15px;
			}
			.masthead__brand {
				display: flex;
				align-items: center;
				gap: 15px;
			}
			.masthead__eyebrow {
				font-family: var(--nm-mono);
				font-size: 12px;
				letter-spacing: 3px;
				text-transform: uppercase;
				color: var(--nh-orange);
				font-weight: 700;
			}
			.masthead__title {
				margin: 3px 0 0;
				font-size: 31px;
				font-weight: 900;
				letter-spacing: -1px;
				line-height: 1;
			}
			.masthead__subtitle {
				font-family: var(--nm-mono);
				font-size: 12px;
				color: var(--nm-muted);
				margin-top: 5px;
			}
			.masthead__side {
				display: flex;
				flex-direction: column;
				align-items: flex-end;
				gap: 9px;
			}
			.masthead__pills {
				display: flex;
				gap: 9px;
			}
			.pill {
				display: inline-flex;
				align-items: center;
				gap: 8px;
				font-family: var(--nm-mono);
				font-size: 12px;
				font-weight: 700;
				text-transform: uppercase;
				padding: 7px 13px;
				border-radius: 999px;
				white-space: nowrap;
			}
			.pill--orange {
				background: rgba(255, 92, 0, 0.1);
				color: var(--nh-orange-deep);
				border: 1px solid rgba(255, 92, 0, 0.28);
			}
			.pill--navy {
				background: color-mix(in srgb, var(--role-manager) 8%, transparent);
				color: var(--role-manager);
				border: 1px solid color-mix(in srgb, var(--role-manager) 22%, transparent);
			}
			.pill__dot {
				width: 8px;
				height: 8px;
				border-radius: 999px;
				background: var(--nh-orange);
				animation: pulse 2.2s infinite;
			}
			.masthead__caption {
				font-family: var(--nm-mono);
				font-size: 11px;
				color: var(--nm-muted);
			}

			/* ── Legend ───────────────────────────────────────────── */
			.legend {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 11px 22px;
				padding: 11px 16px;
				border: 1px solid var(--nm-border);
				border-radius: 12px;
				background: var(--nm-card);
				margin-bottom: 15px;
			}
			.legend__group {
				display: flex;
				align-items: center;
				gap: 9px;
				flex-wrap: wrap;
			}
			.legend__label {
				font-family: var(--nm-mono);
				font-size: 11px;
				letter-spacing: 1.5px;
				text-transform: uppercase;
				color: var(--nm-muted);
			}
			.legend__item {
				display: inline-flex;
				align-items: center;
				gap: 5px;
				font-size: 12px;
				color: var(--nm-body);
			}
			.legend__swatch {
				width: 11px;
				height: 11px;
				border-radius: 3px;
			}
			.legend__dot {
				width: 9px;
				height: 9px;
				border-radius: 999px;
				background: var(--nh-orange);
			}
			.legend__divider {
				width: 1px;
				height: 22px;
				background: var(--nm-border);
			}

			/* ── Role rows + cards ────────────────────────────────── */
			.role-badge {
				display: inline-grid;
				place-items: center;
				width: 19px;
				height: 19px;
				border-radius: 6px;
				font-family: var(--nm-mono);
				font-size: 11px;
				font-weight: 700;
				background: color-mix(in srgb, currentColor 14%, transparent);
				flex: none;
			}
			.row-label {
				margin-bottom: 5px;
				font-family: var(--nm-mono);
				font-size: 11px;
				letter-spacing: 1.5px;
				text-transform: uppercase;
				font-weight: 700;
			}
			.row-label__hosts {
				color: var(--nm-muted);
				font-weight: 400;
				letter-spacing: 0;
				text-transform: none;
			}
			.node-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
				gap: 12px;
				margin-bottom: 14px;
				align-items: stretch;
			}
			.node-card {
				display: flex;
				flex-direction: column;
				gap: 7px;
				padding: 11px 12px;
				background: var(--nm-card);
				border: 1px solid var(--nm-border);
				border-top: 3px solid var(--nm-border);
				border-radius: 14px;
				box-shadow: var(--nm-shadow);
			}
			.node-card__top {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 8px;
			}
			.node-card__id {
				display: flex;
				align-items: center;
				gap: 7px;
				min-width: 0;
			}
			.node-card__hostname {
				font-family: var(--nm-mono);
				font-size: 15px;
				font-weight: 700;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.node-pill {
				font-family: var(--nm-mono);
				font-size: 9px;
				font-weight: 700;
				text-transform: uppercase;
				color: #fff;
				border-radius: 999px;
				padding: 1px 6px;
				flex: none;
			}
			.node-pill--orange {
				background: var(--nh-orange-deep);
			}
			.node-pill--ink {
				background: var(--role-worker);
			}
			.node-pill--burgundy {
				background: var(--role-drain);
			}
			.node-card__meta {
				font-family: var(--nm-mono);
				font-size: 10px;
				color: var(--nm-muted);
				white-space: nowrap;
			}
			.node-usage__row {
				display: flex;
				justify-content: space-between;
				font-family: var(--nm-mono);
				font-size: 10px;
				color: var(--nm-muted);
				margin-bottom: 3px;
			}
			.node-usage__bar {
				height: 5px;
				border-radius: 3px;
				background: var(--nh-line);
				overflow: hidden;
			}
			.node-usage__bar > div {
				height: 100%;
				transition: width 0.4s ease;
			}
			.chips {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
				gap: 5px;
			}
			/* When a node has no services, let the placeholder grow to fill the
			   card's stretched height (see .node-grid's align-items: stretch)
			   instead of hugging its own min-height. */
			.chips:has(> .chips__empty:only-child) {
				display: flex;
				flex: 1;
			}
			.chips__empty {
				grid-column: 1 / -1;
				width: 100%;
				min-height: 26px;
				border: 1px dashed var(--nm-border);
				border-radius: 7px;
				display: flex;
				align-items: center;
				justify-content: center;
				font-family: var(--nm-mono);
				font-size: 9.5px;
				color: var(--nm-muted);
				opacity: 0.7;
			}
			.chip {
				display: flex;
				align-items: center;
				gap: 6px;
				padding: 4px 8px;
				background: var(--nm-card);
				border: 1px solid var(--nm-border);
				border-left: 3px solid var(--nm-border);
				border-radius: 7px;
			}
			.chip__name {
				font-family: var(--nm-mono);
				font-size: 11px;
				font-weight: 700;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.chip__warn {
				flex: none;
			}
			.chip__stats {
				font-family: var(--nm-mono);
				font-size: 10px;
				color: var(--nm-muted);
				margin-left: auto;
				white-space: nowrap;
			}
			.chip__stats--hot {
				font-weight: 700;
				color: var(--nh-orange-deep);
			}

			/* ── Lower panels ─────────────────────────────────────── */
			.lower {
				display: flex;
				gap: 16px;
				align-items: stretch;
				flex-wrap: wrap;
				margin-bottom: 16px;
			}
			.panel {
				display: flex;
				flex-direction: column;
				gap: 9px;
				padding: 14px 15px;
				border: 1px solid var(--nm-border);
				border-radius: 16px;
				background: var(--nm-card);
				box-shadow: var(--nm-shadow);
			}
			.panel--summary {
				flex: 1.55;
				min-width: 360px;
			}
			.lower__side {
				flex: 1;
				min-width: 300px;
				display: flex;
				flex-direction: column;
				gap: 14px;
			}
			.panel__title {
				display: flex;
				align-items: center;
				gap: 8px;
				font-family: var(--nm-mono);
				font-size: 12px;
				letter-spacing: 1.5px;
				text-transform: uppercase;
				font-weight: 700;
			}
			.panel__accent {
				width: 4px;
				height: 16px;
				border-radius: 2px;
				flex: none;
			}
			.summary-cols {
				display: flex;
				gap: 18px;
			}
			.summary-col {
				flex: 1;
				display: flex;
				flex-direction: column;
			}
			.summary-row {
				display: grid;
				grid-template-columns: 1.6fr 0.7fr 0.7fr 0.7fr;
				gap: 6px;
				padding: 5px 0;
				border-bottom: 1px solid var(--nm-border);
				font-family: var(--nm-mono);
				font-size: 10.5px;
				align-items: center;
			}
			.summary-row:last-child {
				border-bottom: none;
			}
			.summary-row--head {
				padding: 0 0 5px;
				font-size: 9.5px;
				letter-spacing: 0.5px;
				text-transform: uppercase;
				color: var(--nm-muted);
			}
			.summary-row__name {
				font-weight: 700;
				border-left: 3px solid var(--nm-border);
				padding-left: 7px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.summary-row__count {
				color: var(--nm-muted);
				font-weight: 400;
				font-size: 9.5px;
			}
			.summary-row__muted {
				color: var(--nm-muted);
			}
			.summary-row__num {
				text-align: right;
			}
			.totals-grid {
				display: grid;
				grid-template-columns: 1fr 1fr 1fr;
				gap: 9px;
			}
			.totals-tile {
				padding: 9px 10px;
				background: var(--nm-tile);
				border: 1px solid var(--nm-border);
				border-radius: 10px;
			}
			.totals-tile__value {
				font-family: var(--nm-mono);
				font-size: 19px;
				font-weight: 800;
				line-height: 1;
			}
			.totals-tile__value--sm {
				font-size: 13px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.totals-tile__label {
				font-size: 10.5px;
				color: var(--nm-muted);
				margin-top: 3px;
			}
			.note {
				padding: 9px 11px;
				background: color-mix(in srgb, var(--role-drain) 6%, transparent);
				border: 1px solid color-mix(in srgb, var(--role-drain) 20%, transparent);
				border-radius: 10px;
				font-size: 11px;
				color: var(--nm-body);
				line-height: 1.4;
			}
			.flow {
				display: flex;
				gap: 9px;
				align-items: flex-start;
				padding: 7px 0;
				border-top: 1px solid var(--nm-border);
			}
			.flow:first-of-type {
				margin-top: 4px;
			}
			.flow__num {
				flex: none;
				display: grid;
				place-items: center;
				width: 19px;
				height: 19px;
				border-radius: 999px;
				color: #fff;
				font-family: var(--nm-mono);
				font-size: 10.5px;
				font-weight: 700;
			}
			.flow__text {
				font-family: var(--nm-mono);
				font-size: 10.5px;
				color: var(--nm-muted);
				line-height: 1.4;
			}
			.flow__text strong {
				color: var(--nm-strong);
			}

			/* ── Footer ───────────────────────────────────────────── */
			.foot {
				padding-top: 13px;
				border-top: 1px solid var(--nm-border);
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 16px;
			}
			.foot__caption {
				font-family: var(--nm-mono);
				font-size: 11.5px;
				color: var(--nm-muted);
				line-height: 1.5;
			}
			.foot__brand {
				display: flex;
				align-items: center;
				gap: 8px;
				flex: none;
				font-family: var(--nm-mono);
				font-size: 11px;
				letter-spacing: 2px;
				text-transform: uppercase;
				font-weight: 700;
			}
			@media (max-width: 900px) {
				.masthead {
					flex-direction: column;
					align-items: flex-start;
				}
				.summary-cols {
					flex-direction: column;
				}
			}
		`,
	],
	imports: [NgIf, NgFor, AsyncPipe, TranslocoPipe],
})
export class NodeMapPageComponent {
	private readonly apollo = inject(Apollo);

	readonly categories = CATEGORIES;
	/** Real swarmbot.it data paths, mirroring the reference's numbered "key flows" list. */
	readonly flows = [
		{ label: "f1l", text: "f1t", color: "var(--nh-orange)" },
		{ label: "f2l", text: "f2t", color: "var(--role-manager)" },
		{ label: "f3l", text: "f3t", color: "var(--role-worker)" },
		{ label: "f4l", text: "f4t", color: "var(--role-worker)" },
	];

	private readonly nodeMapQuery = this.apollo.watchQuery<{ nodeMap: NodeMapEntry[] }>({
		query: QUERY_NODE_MAP,
		pollInterval: 30_000,
	});

	readonly entries$: Observable<NodeMapEntry[]> = this.nodeMapQuery.valueChanges.pipe(
		map((x) => (x.data?.nodeMap ?? []) as NodeMapEntry[])
	);

	catVar(category: string): string {
		return CATEGORIES.includes(category as (typeof CATEGORIES)[number])
			? `var(--cat-${category})`
			: "var(--cat-app)";
	}

	roleVar(role: string): string {
		return role === "manager" ? "var(--role-manager)" : "var(--role-worker)";
	}

	isDrained(entry: NodeMapEntry): boolean {
		return entry.node.tags.includes("DRAIN");
	}

	totalServices(entries: NodeMapEntry[]): number {
		return entries.reduce((sum, e) => sum + e.services.length, 0);
	}

	readyCount(entries: NodeMapEntry[]): number {
		return entries.filter((e) => !this.isDrained(e)).length;
	}

	peakHostname(entries: NodeMapEntry[]): string {
		return entries.reduce<NodeMapEntry | null>(
			(max, e) => (!max || e.node.cpu > max.node.cpu ? e : max),
			null
		)?.node.hostname ?? "";
	}

	hostList(entries: NodeMapEntry[]): string {
		return entries.map((e) => e.node.hostname).join(" · ");
	}

	/** Rack-style grouping: managers (control-plane) row first, workers second. */
	groupedEntries(entries: NodeMapEntry[]): { key: "managers" | "workers"; entries: NodeMapEntry[] }[] {
		return [
			{ key: "managers", entries: entries.filter((e) => e.node.role === "manager") },
			{ key: "workers", entries: entries.filter((e) => e.node.role !== "manager") },
		];
	}

	/** Aggregates every node's services by name — the cluster-wide view of one service's footprint. */
	serviceSummary(entries: NodeMapEntry[]): ServiceSummaryRow[] {
		const byName = new Map<
			string,
			{ category: string; nodes: Set<string>; cpuSum: number; memSum: number; count: number }
		>();
		for (const entry of entries) {
			for (const svc of entry.services) {
				const bucket = byName.get(svc.serviceName) ?? {
					category: svc.category,
					nodes: new Set<string>(),
					cpuSum: 0,
					memSum: 0,
					count: 0,
				};
				bucket.nodes.add(entry.node.hostname);
				bucket.cpuSum += svc.cpu;
				bucket.memSum += svc.mem;
				bucket.count += 1;
				byName.set(svc.serviceName, bucket);
			}
		}
		return Array.from(byName.entries())
			.map(([serviceName, b]) => ({
				serviceName,
				category: b.category,
				nodeCount: b.nodes.size,
				taskCount: b.count,
				avgCpu: Math.round(b.cpuSum / b.count),
				avgMem: Math.round(b.memSum / b.count),
			}))
			.sort((a, b) => b.taskCount - a.taskCount);
	}

	/** Splits the summary into the reference's two side-by-side table columns. */
	summaryColumns(entries: NodeMapEntry[]): ServiceSummaryRow[][] {
		const rows = this.serviceSummary(entries);
		if (rows.length === 0) return [];
		if (rows.length <= 5) return [rows];
		const half = Math.ceil(rows.length / 2);
		return [rows.slice(0, half), rows.slice(half)];
	}

	clusterTotals(entries: NodeMapEntry[]): ClusterTotals {
		const nodeCount = entries.length;
		const allServices = entries.flatMap((e) => e.services);
		const distinctServices = new Set(allServices.map((s) => s.serviceName)).size;
		const avgCpu = nodeCount
			? Math.round(entries.reduce((sum, e) => sum + e.node.cpu, 0) / nodeCount)
			: 0;
		const avgMem = nodeCount
			? Math.round(entries.reduce((sum, e) => sum + e.node.mem, 0) / nodeCount)
			: 0;
		const busiest = entries.reduce<NodeMapEntry | null>(
			(max, e) => (!max || e.node.cpu > max.node.cpu ? e : max),
			null
		);
		return {
			nodeCount,
			distinctServices,
			taskCount: allServices.length,
			avgCpu,
			avgMem,
			busiestHostname: busiest?.node.hostname ?? "—",
			busiestCpu: busiest?.node.cpu ?? 0,
		};
	}
}
