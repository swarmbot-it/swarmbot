/** Time-range options shared by dashboard, load, and detail charts. */
export type ChartRange = "15m" | "1h" | "6h" | "24h";

export const CHART_RANGE_OPTIONS: { value: ChartRange; labelKey: string }[] = [
	{ value: "15m", labelKey: "dashboard.ranges.15m" },
	{ value: "1h", labelKey: "dashboard.ranges.1h" },
	{ value: "6h", labelKey: "dashboard.ranges.6h" },
	{ value: "24h", labelKey: "dashboard.ranges.24h" },
];

/** Colors for top-7 stack lines on the Load page. */
export const LOAD_STACK_COLORS = [
	"#F97316",
	"#3b82f6",
	"#10b981",
	"#a855f7",
	"#f59e0b",
	"#ec4899",
	"#06b6d4",
] as const;
