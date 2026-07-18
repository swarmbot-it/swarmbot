import { describe, it, expect, vi, afterEach } from "vitest";
import { startStatsWriter } from "./stats-writer.js";
import { loadConfig } from "../config.js";

describe("startStatsWriter", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("is a no-op when InfluxDB is not configured", () => {
		const write = startStatsWriter({ ...loadConfig(), influxdbUrl: undefined });
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		write({ type: "stats", message: JSON.stringify({ id: "node1", cpu: { used_percentage: 5 } }) });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("posts line-protocol for cpu/memory/disk to InfluxDB", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
		vi.stubGlobal("fetch", fetchSpy);
		const write = startStatsWriter({ ...loadConfig(), influxdbUrl: "http://influx:8086" });
		write({
			type: "stats",
			message: JSON.stringify({
				id: "node1",
				cpu: { used_percentage: 12.5 },
				memory: { used_percentage: 40 },
				disk: { used_percentage: 60, total: 100, used: 60 },
			}),
		});
		await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		const [url, opts] = fetchSpy.mock.calls[0];
		expect(url).toContain("/write?db=swarmbot");
		expect(opts.body).toContain("cpu,node=node1 percent=12.5");
		expect(opts.body).toContain("memory,node=node1 percent=40");
		expect(opts.body).toContain("disk,node=node1 percent=60");
	});

	it("does not throw when the InfluxDB write fails at the network level", async () => {
		const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
		vi.stubGlobal("fetch", fetchSpy);
		const write = startStatsWriter({ ...loadConfig(), influxdbUrl: "http://influx:8086" });
		expect(() =>
			write({ type: "stats", message: JSON.stringify({ id: "node1", cpu: { used_percentage: 1 } }) })
		).not.toThrow();
		await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
	});

	it("ignores non-stats events", () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const write = startStatsWriter({ ...loadConfig(), influxdbUrl: "http://influx:8086" });
		write({ type: "event", message: "{}" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
