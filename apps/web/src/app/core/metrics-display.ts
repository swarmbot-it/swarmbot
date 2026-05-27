/** Format a utilization percentage or "N/A" when telemetry is unavailable. */
export function pctOrNa(value: number | null | undefined, na = "N/A"): string {
	return value == null ? na : `${value}`;
}

/** Last sample in a metrics series, or null when empty. */
export function lastSample(values: number[] | null | undefined): number | null {
	if (!values?.length) return null;
	return values[values.length - 1] ?? null;
}
