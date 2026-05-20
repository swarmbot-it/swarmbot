import { describe, it, expect } from "vitest";
import { publishEvent, subscribeEvents } from "./hub.js";

describe("events hub", () => {
	it("delivers an event to a subscriber", () => {
		const received: unknown[] = [];
		const unsub = subscribeEvents((e) => received.push(e));
		publishEvent({ type: "test", message: "hello" });
		publishEvent({ type: "test", message: { json: true } });
		unsub();
		publishEvent({ type: "test", message: "after-unsub" });
		expect(received).toHaveLength(2);
		expect((received[0] as { type: string }).type).toBe("test");
	});

	it("supports multiple subscribers", () => {
		const a: unknown[] = [];
		const b: unknown[] = [];
		const u1 = subscribeEvents((e) => a.push(e));
		const u2 = subscribeEvents((e) => b.push(e));
		publishEvent({ type: "multi" });
		u1();
		u2();
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
	});
});
