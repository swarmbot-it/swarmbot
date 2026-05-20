import { describe, expect, it } from "vitest";
import { mockSeries, nodeMockHistory, taskMockHistory } from "./series.js";

describe("mockSeries", () => {
	it("returns labels and metrics for each range/resolution", () => {
		const s = mockSeries("1h", "medium");
		expect(s.cpu.length).toBe(s.labels.length);
		expect(s.mem.length).toBe(s.labels.length);
		expect(s.disk.length).toBe(s.labels.length);
		expect(s.cpu.every((v) => v >= 0 && v <= 100)).toBe(true);
	});

	it("low resolution emits fewer points than high", () => {
		const low = mockSeries("24h", "low");
		const high = mockSeries("24h", "high");
		expect(high.cpu.length).toBeGreaterThan(low.cpu.length);
	});

	it("is deterministic across calls", () => {
		const a = mockSeries("15m", "medium");
		const b = mockSeries("15m", "medium");
		expect(a.cpu).toEqual(b.cpu);
	});
});

describe("nodeMockHistory / taskMockHistory", () => {
	it("produces 32 / 16 points respectively", () => {
		expect(nodeMockHistory(1, 40, 50, 30).cpu.length).toBe(32);
		expect(taskMockHistory(2, 20, 30).cpu.length).toBe(16);
	});
});
