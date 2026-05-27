import {
	ChangeDetectionStrategy,
	Component,
	inject,
	OnInit,
	signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterOutlet } from "@angular/router";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { combineLatest, Observable } from "rxjs";
import { AsyncPipe } from "@angular/common";

import { TopbarComponent } from "./topbar.component";
import { SidebarComponent } from "./sidebar.component";
import { QUERY_OVERVIEW, QUERY_VERSION } from "../core/graphql.queries";
import { BootService } from "../core/boot.service";
import { BootLoaderComponent } from "../shared/boot-loader/boot-loader.component";
import type { SidebarFooter } from "./sidebar.component";

type OverviewCounts = Record<string, number> & {
	clusterStatus?: string;
	managersReady?: number;
	managersTotal?: number;
};

/**
 * Application shell.
 *
 * Composes the topbar and sidebar around <router-outlet> for the
 * authenticated routes. Eagerly polls cluster overview counts so the
 * sidebar can show per-section badges that stay up to date.
 *
 * On first mount the boot loader overlay is shown while seed queries
 * prime Apollo's cache. Subsequent navigations skip the loader.
 * The loader is re-shown whenever BootService.startRefresh() is called
 * (e.g. the dashboard refresh button).
 */
@Component({
	selector: "sb-shell",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (showBoot()) {
			<sb-boot-loader (destroyed)="showBoot.set(false)"></sb-boot-loader>
		}
		<div class="app-shell">
			<div class="app-shell__topbar">
				<sb-topbar></sb-topbar>
			</div>
			<div class="app-shell__sidebar">
				<sb-sidebar
					[counts]="(counts$ | async) ?? null"
					[footer]="(footer$ | async) ?? null"
				></sb-sidebar>
			</div>
			<main class="app-shell__main">
				<router-outlet></router-outlet>
			</main>
		</div>
	`,
	imports: [RouterOutlet, AsyncPipe, TopbarComponent, SidebarComponent, BootLoaderComponent],
})
export class ShellComponent implements OnInit {
	private readonly apollo = inject(Apollo);
	private readonly bootService = inject(BootService);

	readonly showBoot = signal(!this.bootService.isBooted);

	counts$!: Observable<OverviewCounts>;
	footer$!: Observable<SidebarFooter | null>;

	constructor() {
		// Re-show the loader whenever ready$ flips to false (dashboard refresh, etc.)
		this.bootService.ready$.pipe(takeUntilDestroyed()).subscribe((ready) => {
			if (!ready) this.showBoot.set(true);
		});
	}

	ngOnInit(): void {
		this.counts$ = this.apollo
			.watchQuery<{ overview: OverviewCounts }>({
				query: QUERY_OVERVIEW,
				pollInterval: 30_000,
			})
			.valueChanges.pipe(map((x) => (x.data?.overview ?? {}) as OverviewCounts));

		const version$ = this.apollo
			.watchQuery<{ version: { version: string; dockerApi: string } }>({
				query: QUERY_VERSION,
				pollInterval: 60_000,
			})
			.valueChanges.pipe(map((x) => x.data?.version));

		this.footer$ = combineLatest([this.counts$, version$]).pipe(
			map(([overview, version]) => {
				if (!overview) return null;
				return {
					clusterStatus: overview.clusterStatus ?? "unknown",
					managersReady: overview.managersReady ?? 0,
					managersTotal: overview.managersTotal ?? 0,
					dockerApi: version?.dockerApi ?? null,
				};
			})
		);

		if (!this.bootService.isBooted) {
			this.bootService.boot(this.apollo);
		}
	}
}
