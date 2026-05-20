import { describe, it, expect } from "vitest";
import { createMockDocker } from "./mock.js";

describe("createMockDocker", () => {
	it("lists sample services and nodes", async () => {
		const d = createMockDocker();
		const services = await (
			d as unknown as { listServices(): Promise<unknown[]> }
		).listServices();
		const nodes = await (d as unknown as { listNodes(): Promise<unknown[]> }).listNodes();
		expect(services.length).toBeGreaterThan(0);
		expect(nodes.length).toBeGreaterThan(0);
	});

	it("returns container logs as a Buffer", async () => {
		const d = createMockDocker();
		const c = (
			d as unknown as { getContainer(id: string): { logs(o: unknown): Promise<Buffer> } }
		).getContainer("x");
		const logs = await c.logs({});
		expect(Buffer.isBuffer(logs)).toBe(true);
		expect(logs.toString("utf8")).toMatch(/nginx/);
	});
});
