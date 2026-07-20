import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	OnInit,
	signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterOutlet } from "@angular/router";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { AsyncPipe } from "@angular/common";

import { TopbarComponent } from "./topbar.component";
import { SidebarComponent } from "./sidebar.component";
import { QUERY_OVERVIEW, QUERY_PROFILE_ME } from "../core/graphql.queries";
import { BootService } from "../core/boot.service";
import { BootLoaderComponent } from "../shared/boot-loader/boot-loader.component";
import { AuthService, type Profile } from "../core/auth.service";

type OverviewCounts = Record<string, number>;

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
				<sb-sidebar [counts]="(counts$ | async) ?? null"></sb-sidebar>
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
	private readonly auth = inject(AuthService);
	private readonly destroyRef = inject(DestroyRef);

	readonly showBoot = signal(!this.bootService.isBooted);

	counts$!: Observable<OverviewCounts>;

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

		if (!this.bootService.isBooted) {
			this.bootService.boot(this.apollo);
		}

		// Ensure the cached profile (name/role for the topbar + role-gated UI) is
		// populated. The password login page fetches it, but OIDC sign-in only
		// sets the token — without this the topbar falls back to "Administrator"
		// instead of the signed-in user's name.
		if (!this.auth.profile()) {
			this.apollo
				.query<{ me: Profile | null }>({ query: QUERY_PROFILE_ME, fetchPolicy: "network-only" })
				.pipe(takeUntilDestroyed(this.destroyRef))
				.subscribe((r) => {
					if (r.data?.me) this.auth.setProfile(r.data.me);
				});
		}
	}
}
