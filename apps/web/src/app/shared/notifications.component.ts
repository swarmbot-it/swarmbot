import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	OnDestroy,
	OnInit,
	inject,
	signal,
} from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { Apollo, gql } from "apollo-angular";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { IconComponent } from "./icon.component";

const RECENT_ACTIVITY_QUERY = gql`
	query RecentActivity($limit: Int) {
		recentActivity(limit: $limit) {
			time
			summary
		}
	}
`;

const LAST_SEEN_KEY = "swarmbot.notifications.lastSeen";
const POLL_MS = 20000;

interface ActivityItem {
	time: string;
	summary: string;
}

/**
 * Notification bell — polls recent Docker events and shows them in a popover.
 * Unread state persists in localStorage so the dot clears once opened.
 */
@Component({
	selector: "sb-notifications",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgIf, NgFor, IconComponent, TranslocoPipe],
	template: `
		<div style="position:relative">
			<button
				class="btn btn--ghost btn--icon topbar__bell"
				[title]="'topbar.notifications' | transloco"
				(click)="toggle()"
			>
				<sb-icon name="bell" [size]="18"></sb-icon>
				<span class="topbar__bell-dot" *ngIf="hasUnread()"></span>
			</button>
			<div class="popover" style="width:340px; max-height:400px; overflow-y:auto" *ngIf="open()">
				<div
					class="popover__header"
					style="display:flex; align-items:center; justify-content:space-between"
				>
					<div class="popover__name">{{ "topbar.recentActivity" | transloco }}</div>
					<span style="font-size:11px; color:var(--muted)">{{
						"topbar.liveFromDocker" | transloco
					}}</span>
				</div>
				<div
					*ngIf="items().length === 0"
					style="padding:20px 12px; text-align:center; font-size:12.5px; color:var(--muted)"
				>
					{{ "topbar.noActivity" | transloco }}
				</div>
				<div
					*ngFor="let item of items()"
					class="popover__item"
					style="cursor:default; flex-direction:column; align-items:flex-start; gap:2px"
				>
					<div style="font-size:12.5px; color:var(--text)">{{ item.summary }}</div>
					<div style="font-size:10.5px; color:var(--muted); font-family:var(--font-mono)">
						{{ relativeTime(item.time) }}
					</div>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.topbar__bell {
				position: relative;
			}
			.topbar__bell-dot {
				position: absolute;
				top: 8px;
				right: 9px;
				width: 7px;
				height: 7px;
				border-radius: 50%;
				background: var(--primary-500);
				box-shadow: 0 0 0 2px var(--surface);
			}
			.popover {
				position: absolute;
				right: 0;
				top: 52px;
				min-width: 240px;
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				box-shadow: var(--shadow-3);
				padding: 6px;
				z-index: 30;
			}
			.popover__header {
				padding: 10px 12px 12px;
				border-bottom: 1px solid var(--border);
				margin-bottom: 6px;
			}
			.popover__name {
				font-weight: 700;
				font-size: 13px;
			}
			.popover__item {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 8px 10px;
				border-radius: var(--r-md);
				cursor: pointer;
				font-size: 13px;
			}
			.popover__item:hover {
				background: var(--surface-hover);
			}
		`,
	],
})
export class NotificationsComponent implements OnInit, OnDestroy {
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly host = inject(ElementRef<HTMLElement>);
	private timer: ReturnType<typeof setInterval> | null = null;

	readonly open = signal(false);
	readonly items = signal<ActivityItem[]>([]);
	readonly hasUnread = signal(false);

	ngOnInit(): void {
		this.load();
		this.timer = setInterval(() => this.load(), POLL_MS);
	}

	ngOnDestroy(): void {
		if (this.timer) clearInterval(this.timer);
	}

	private load(): void {
		this.apollo
			.query<{ recentActivity: ActivityItem[] }>({
				query: RECENT_ACTIVITY_QUERY,
				variables: { limit: 15 },
				fetchPolicy: "network-only",
			})
			.subscribe((r) => {
				const items = r.data?.recentActivity ?? [];
				this.items.set(items);
				const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
				this.hasUnread.set(items.length > 0 && (!lastSeen || items[0].time > lastSeen));
			});
	}

	toggle(): void {
		this.open.set(!this.open());
		const items = this.items();
		if (this.open() && items.length > 0) {
			localStorage.setItem(LAST_SEEN_KEY, items[0].time);
			this.hasUnread.set(false);
		}
	}

	relativeTime(iso: string): string {
		const diffMs = Date.now() - new Date(iso).getTime();
		const sec = Math.floor(diffMs / 1000);
		if (sec < 60) return this.transloco.translate("topbar.secondsAgo", { n: sec });
		const min = Math.floor(sec / 60);
		if (min < 60) return this.transloco.translate("topbar.minutesAgo", { n: min });
		const hr = Math.floor(min / 60);
		if (hr < 24) return this.transloco.translate("topbar.hoursAgo", { n: hr });
		return this.transloco.translate("topbar.daysAgo", { n: Math.floor(hr / 24) });
	}

	@HostListener("document:mousedown", ["$event"])
	outsideClick(event: MouseEvent): void {
		if (!this.open()) return;
		if (!this.host.nativeElement.contains(event.target as Node)) {
			this.open.set(false);
		}
	}
}
