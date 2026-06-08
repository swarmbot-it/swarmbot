import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { NgFor, NgIf } from "@angular/common";

export type ResourceListItem = { name: string; meta?: string };

@Component({
	selector: "sb-resource-list",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ul class="resource-list" *ngIf="items.length; else empty">
			<li *ngFor="let item of items" class="resource-list__row">
				<span class="resource-list__name mono">{{ item.name }}</span>
				<span class="resource-list__meta" *ngIf="item.meta">{{ item.meta }}</span>
			</li>
		</ul>
		<ng-template #empty>
			<div class="resource-list__empty">{{ emptyLabel }}</div>
		</ng-template>
	`,
	styles: [
		`
			.resource-list {
				list-style: none;
				margin: 0;
				padding: 0;
			}
			.resource-list__row {
				display: flex;
				justify-content: space-between;
				gap: 12px;
				padding: 10px 0;
				border-bottom: 1px solid var(--border);
				font-size: 13px;
			}
			.resource-list__row:last-child {
				border-bottom: none;
			}
			.resource-list__name {
				font-weight: 600;
				color: var(--text);
			}
			.resource-list__meta {
				color: var(--muted);
				font-size: 12px;
				white-space: nowrap;
			}
			.resource-list__empty {
				color: var(--muted);
				font-size: 13px;
				padding: 12px 0;
			}
		`,
	],
	imports: [NgFor, NgIf],
})
export class ResourceListComponent {
	@Input() items: ResourceListItem[] = [];
	@Input() emptyLabel = "—";
}
