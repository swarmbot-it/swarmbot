import { describe, it, expect, afterEach } from "vitest";
import {
	__clearContainerStoreForTests,
	getStackLoadSeries,
	ingestContainerSample,
} from "./container-store.js";

describe("getStackLoadSeries", () => {
	afterEach(() => __clearContainerStoreForTests());

	it("returns top stacks from in-memory history", () => {
		const at = Date.now();
		ingestContainerSample("t1", "swarmbot", 40, 30);
		ingestContainerSample("t2", "other", 10, 20);
		// backdate second point for swarmbot so range filter keeps both
		const rows = getStackLoadSeries("1h", "medium");
		expect(rows.length).toBeGreaterThanOrEqual(1);
		expect(rows[0]?.stack).toBe("swarmbot");
		expect(rows[0]?.cpu.length).toBeGreaterThan(0);
		expect(at).toBeLessThanOrEqual(Date.now());
	});
});
