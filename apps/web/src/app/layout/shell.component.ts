import { ChangeDetectionStrategy, Component, inject, OnInit } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { AsyncPipe } from "@angular/common";

import { TopbarComponent } from "./topbar.component";
import { SidebarComponent } from "./sidebar.component";
import { QUERY_OVERVIEW } from "../core/graphql.queries";

type OverviewCounts = Record<string, number>;

/**
 * Application shell.
 *
 * Composes the topbar and sidebar around <router-outlet> for the
 * authenticated routes. Eagerly polls cluster overview counts so the
 * sidebar can show per-section badges that stay up to date.
 */
@Component({
	selector: "sb-shell",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="app-shell">
			<div class="app-shell__topbar">
				<sb-topbar></sb-topbar>
			</div>
			<div class="app-shell__sidebar">
				<sb-sidebar [counts]="(counts$ | async) ?? null"></sb-sidebar>
			</div>
			<main class="app-shell__main">
				<router-outlet></router-outlet>
			</main>
		</div>
	`,
	imports: [RouterOutlet, AsyncPipe, TopbarComponent, SidebarComponent],
})
export class ShellComponent implements OnInit {
	private readonly apollo = inject(Apollo);
	counts$!: Observable<OverviewCounts>;

	ngOnInit(): void {
		this.counts$ = this.apollo
			.watchQuery<{ overview: OverviewCounts }>({
				query: QUERY_OVERVIEW,
				pollInterval: 30_000,
			})
			.valueChanges.pipe(map((x) => (x.data?.overview ?? {}) as OverviewCounts));
	}
}
