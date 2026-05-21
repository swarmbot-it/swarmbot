import { Injectable } from "@angular/core";
import { BehaviorSubject, concat, forkJoin, timer } from "rxjs";
import { retry, tap } from "rxjs/operators";
import { Apollo } from "apollo-angular";

import {
	QUERY_METRICS_SERIES,
	QUERY_NODES,
	QUERY_OVERVIEW,
	QUERY_SERVICES,
	QUERY_STACKS,
} from "./graphql.queries";

/**
 * Tracks the initial data-loading sequence shown by BootLoaderComponent.
 *
 * Queries fire sequentially; on network failure the whole sequence retries
 * from step 0 after 3 s so the loader never dismisses with empty data.
 * Once all four queries succeed the service marks itself as booted and
 * subsequent shell mounts skip the loader entirely.
 */
@Injectable({ providedIn: "root" })
export class BootService {
	private readonly _step$ = new BehaviorSubject<number>(0);
	private readonly _ready$ = new BehaviorSubject<boolean>(false);
	private readonly _refreshing$ = new BehaviorSubject<boolean>(false);
	private _booted = false;

	readonly step$ = this._step$.asObservable();
	readonly ready$ = this._ready$.asObservable();
	/** True while a manual refresh cycle is in progress (background is semi-transparent). */
	readonly refreshing$ = this._refreshing$.asObservable();

	/** Transloco keys — one per step, in order. */
	readonly stepKeys = [
		"boot.steps.connecting",
		"boot.steps.nodes",
		"boot.steps.stacksServices",
		"boot.steps.timeSeries",
		"boot.steps.almostThere",
	] as const;

	get isBooted(): boolean {
		return this._booted;
	}

	advance(): void {
		this._step$.next(Math.min(this._step$.value + 1, this.stepKeys.length - 1));
	}

	complete(): void {
		this._booted = true;
		setTimeout(() => this._ready$.next(true), 200);
	}

	/** Show the semi-transparent overlay immediately (dashboard refresh). */
	startRefresh(): void {
		this._refreshing$.next(true);
		this._ready$.next(false);
	}

	/** Hide the overlay after a refresh cycle is complete. */
	endRefresh(): void {
		this._refreshing$.next(false);
		this._ready$.next(true);
	}

	/**
	 * Fires four seed queries in sequence, advancing the step counter after
	 * each resolves. Results prime Apollo's InMemoryCache so page components
	 * get instant renders on first mount.
	 *
	 * On any network / GraphQL error the entire sequence restarts from step 0
	 * after a 3-second pause — the loader stays visible until real data arrives.
	 */
	boot(apollo: Apollo): void {
		if (this._booted) return;

		concat(
			apollo.query({ query: QUERY_OVERVIEW }).pipe(tap(() => this.advance())),
			apollo.query({ query: QUERY_NODES }).pipe(tap(() => this.advance())),
			forkJoin([
				apollo.query({ query: QUERY_STACKS }),
				apollo.query({ query: QUERY_SERVICES }),
			]).pipe(tap(() => this.advance())),
			apollo.query({
				query: QUERY_METRICS_SERIES,
				variables: { input: { range: "1h", resolution: "medium" } },
			}).pipe(tap(() => this.advance()))
		)
			.pipe(
				retry({
					delay: () => {
						this._step$.next(0);
						return timer(3000);
					},
				})
			)
			.subscribe({ complete: () => this.complete() });
	}
}
