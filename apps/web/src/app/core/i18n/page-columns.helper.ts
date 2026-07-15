import { computed, type Signal } from "@angular/core";
import type { TranslocoService } from "@jsverse/transloco";
import type { ColumnDef } from "../../shared/data-table.component";

export type ColumnDefInput<R> = Omit<ColumnDef<R>, "label"> & { labelKey: string };

/** Builds table column definitions with labels resolved from Transloco on language change. */
export function translatedColumns<R>(
	transloco: TranslocoService,
	activeLang: Signal<unknown>,
	defs: ColumnDefInput<R>[]
) {
	return computed(() => {
		activeLang();
		return defs.map(({ labelKey, ...rest }) => ({
			...rest,
			label: transloco.translate(labelKey),
		}));
	});
}
