import {
	ChangeDetectionStrategy,
	Component,
	ContentChild,
	Input,
	TemplateRef,
	computed,
	signal,
} from "@angular/core";
import { NgFor, NgIf, NgTemplateOutlet } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { TableModule } from "primeng/table";
import { TranslocoPipe } from "@jsverse/transloco";

/**
 * Shared, design-system-styled data table.
 *
 * The component wraps PrimeNG's <p-table> but exposes a single shape:
 *   - `columns` describe how to display & sort each field
 *   - `rows`     are the data
 *   - `searchKeys` enables a full-text filter over selected fields
 *
 * Per-cell rendering uses Angular templates: callers declare a
 * `<ng-template pTemplate="cell" let-row let-key="key">` once and switch
 * on the column key inside. This mirrors the design's generic table API.
 */

export type ColumnDef<R = Record<string, unknown>> = {
	/** Field name used for default rendering, sorting and key matching in the cell template. */
	key: string;
	/** Column header. */
	label: string;
	/** Disable sort header for this column (default false). */
	sortable?: boolean;
	/** Optional sort accessor; defaults to row[key]. */
	sortFn?: (row: R) => string | number;
	/** Text alignment for the column. */
	align?: "left" | "right" | "center";
	/** Fixed column width hint (px or %). */
	width?: string | number;
};

@Component({
	selector: "sb-data-table",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="dt-toolbar">
			<input
				*ngIf="searchable"
				class="input input--search"
				[placeholder]="searchPlaceholder || ('table.search' | transloco)"
				[ngModel]="query()"
				(ngModelChange)="query.set($event)"
			/>
			<span *ngIf="query() && rows" class="dt-toolbar__count">
				{{
					"table.count"
						| transloco: { filtered: filteredRows().length, total: rows.length }
				}}
			</span>
			<span class="dt-toolbar__spacer"></span>
			<ng-content select="[dt-toolbar-end]"></ng-content>
		</div>

		<div class="card dt-card">
			<p-table
				[value]="filteredRows()"
				[paginator]="filteredRows().length > pageSize"
				[rows]="pageSize"
				[rowsPerPageOptions]="[10, 20, 50]"
				[sortField]="sortField()"
				[sortOrder]="sortOrder()"
				(sortFunction)="onSort($event)"
				[customSort]="true"
				[globalFilterFields]="searchKeysAsStrings"
				sortMode="single"
				[responsiveLayout]="'scroll'"
				styleClass="sb-table"
			>
				<ng-template pTemplate="header">
					<tr>
						<th
							*ngFor="let c of columns"
							[pSortableColumn]="c.sortable === false ? undefined : c.key"
							[style.text-align]="c.align ?? 'left'"
							[style.width]="widthOf(c)"
						>
							{{ c.label }}
							<p-sortIcon *ngIf="c.sortable !== false" [field]="c.key"></p-sortIcon>
						</th>
					</tr>
				</ng-template>
				<ng-template pTemplate="body" let-row>
					<tr>
						<td *ngFor="let c of columns" [style.text-align]="c.align ?? 'left'">
							<ng-container
								*ngIf="cellTemplate; else fallback"
								[ngTemplateOutlet]="cellTemplate"
								[ngTemplateOutletContext]="{ $implicit: row, row: row, key: c.key }"
							>
							</ng-container>
							<ng-template #fallback>{{ row[c.key] }}</ng-template>
						</td>
					</tr>
				</ng-template>
				<ng-template pTemplate="emptymessage">
					<tr>
						<td [attr.colspan]="columns.length" class="dt-empty">
							{{ emptyText || ("table.empty" | transloco) }}
						</td>
					</tr>
				</ng-template>
			</p-table>
		</div>
	`,
	styles: [
		`
			:host {
				display: block;
			}
			.dt-toolbar {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-bottom: 14px;
			}
			.dt-toolbar__spacer {
				flex: 1;
			}
			.dt-toolbar__count {
				font-size: 12px;
				color: var(--muted);
			}
			.dt-card {
				overflow: hidden;
			}
			:host ::ng-deep .sb-table .p-datatable-header,
			:host ::ng-deep .sb-table .p-datatable-thead > tr > th {
				background: var(--surface-2);
				border-color: var(--border);
				color: var(--muted);
				font-size: 11.5px;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				font-weight: 600;
			}
			:host ::ng-deep .sb-table .p-datatable-tbody > tr {
				background: var(--surface);
				color: var(--text);
				border-color: var(--border);
				transition: background 0.1s;
			}
			:host ::ng-deep .sb-table .p-datatable-tbody > tr > td {
				border-color: var(--border);
				padding: 14px 16px;
			}
			:host ::ng-deep .sb-table .p-datatable-tbody > tr:hover {
				background: var(--surface-2);
			}
			:host ::ng-deep .sb-table .p-paginator {
				background: var(--surface-2);
				border-color: var(--border);
				color: var(--muted);
				font-size: 12.5px;
			}
			:host ::ng-deep .sb-table .p-paginator .p-paginator-page.p-highlight {
				background: var(--primary-500);
				color: white;
			}
			.dt-empty {
				padding: 40px;
				text-align: center;
				color: var(--muted);
				font-size: 13px;
			}
		`,
	],
	imports: [NgFor, NgIf, NgTemplateOutlet, FormsModule, TableModule, TranslocoPipe],
})
export class DataTableComponent<R extends Record<string, unknown> = Record<string, unknown>> {
	@Input() columns: ColumnDef<R>[] = [];
	@Input() rows: R[] = [];
	@Input() searchKeys?: (keyof R)[];
	@Input() pageSize = 10;
	@Input() searchable = true;
	@Input() searchPlaceholder = "Search…";
	@Input() emptyText = "No results";

	@ContentChild("cell", { static: false })
	cellTemplate?: TemplateRef<{ $implicit: R; row: R; key: string }>;

	readonly query = signal("");
	readonly sortField = signal<string | undefined>(undefined);
	readonly sortOrder = signal<number>(1);

	get searchKeysAsStrings(): string[] {
		return (this.searchKeys ?? []).map((k) => String(k));
	}

	filteredRows = computed(() => {
		const q = this.query().trim().toLowerCase();
		let rows: R[] = this.rows ?? [];
		if (q && this.searchKeys && this.searchKeys.length) {
			rows = rows.filter((r) =>
				this.searchKeys!.some((k) => {
					const v = (r as Record<string, unknown>)[k as string];
					return v !== undefined && v !== null && String(v).toLowerCase().includes(q);
				})
			);
		}
		const field = this.sortField();
		const order = this.sortOrder();
		if (!field) return rows;
		const col = this.columns.find((c) => c.key === field);
		const sortFn = col?.sortFn;
		return [...rows].sort((a, b) => {
			const av = sortFn ? sortFn(a) : (a as Record<string, unknown>)[field];
			const bv = sortFn ? sortFn(b) : (b as Record<string, unknown>)[field];
			const sa = typeof av === "string" ? av.toLowerCase() : av;
			const sb = typeof bv === "string" ? bv.toLowerCase() : bv;
			if ((sa ?? "") < (sb ?? "")) return -1 * order;
			if ((sa ?? "") > (sb ?? "")) return 1 * order;
			return 0;
		});
	});

	onSort(event: { field: string; order: number }): void {
		this.sortField.set(event.field);
		this.sortOrder.set(event.order);
	}

	widthOf(c: ColumnDef<R>): string | undefined {
		if (c.width === undefined) return undefined;
		return typeof c.width === "number" ? `${c.width}px` : c.width;
	}
}
