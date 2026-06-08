import { describe, it, expect } from "vitest";
import { buildMetricsFromFluxPoints, formatChartTimeLabels } from "./chart-series.js";

describe("chart-series", () => {
	it("formats short spans as HH:mm", () => {
		const t0 = Date.parse("2024-06-01T10:00:00Z");
		const labels = formatChartTimeLabels([t0, t0 + 5 * 60_000]);
		expect(labels.length).toBe(2);
		expect(labels[0]).toMatch(/\d{2}:\d{2}/);
	});

	it("returns null when cpu points are empty", () => {
		expect(buildMetricsFromFluxPoints([], [], "medium")).toBeNull();
	});

	it("aligns labels to cpu timestamps", () => {
		const series = buildMetricsFromFluxPoints(
			[
				{ time: "2024-01-01T10:00:00Z", value: 10 },
				{ time: "2024-01-01T10:05:00Z", value: 20 },
			],
			[{ time: "2024-01-01T10:00:00Z", value: 30 }],
			"high"
		);
		expect(series?.labels.length).toBe(2);
		expect(series?.cpu).toEqual([10, 20]);
		expect(series?.mem).toEqual([30, 20]);
	});
});
