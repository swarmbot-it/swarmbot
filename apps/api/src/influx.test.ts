import { describe, it, expect, vi, afterEach } from "vitest";
import { influxPing, influxQuery, createDatabase } from "./influx.js";
import { loadConfig } from "./config.js";

describe("influx helpers", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("influxPing returns true on ok health", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
		expect(await influxPing("http://influx:8086")).toBe(true);
	});

	it("influxPing returns false on network error", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
		expect(await influxPing("http://influx:8086")).toBe(false);
	});

	it("influxQuery throws when influx not configured", async () => {
		const cfg = { ...loadConfig(), influxdbUrl: undefined };
		await expect(influxQuery(cfg, "SELECT 1")).rejects.toThrow(/not_configured/);
	});

	it("createDatabase is no-op without url", async () => {
		const cfg = { ...loadConfig(), influxdbUrl: undefined };
		await expect(createDatabase(cfg)).resolves.toBeUndefined();
	});

	it("createDatabase pings InfluxDB v2 health", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);
		const cfg = { ...loadConfig(), influxdbUrl: "http://influx:8086/" };
		await createDatabase(cfg, "swarmboty");
		expect(fetchMock).toHaveBeenCalled();
		const [url] = fetchMock.mock.calls[0] as [string];
		expect(url).toContain("/health");
	});
});
