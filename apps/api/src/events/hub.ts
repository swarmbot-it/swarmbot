import { EventEmitter } from "events";
import { pubsub, SWARM_TOPIC } from "../graphql/pubsub.js";

export type SwarmEvent = { type?: string; message?: unknown; [k: string]: unknown };

const hub = new EventEmitter();
hub.setMaxListeners(200);

const RING_SIZE = 50;
const ring: { time: string; message: string }[] = [];

export function subscribeEvents(handler: (e: SwarmEvent) => void): () => void {
	hub.on("event", handler);
	return () => hub.off("event", handler);
}

/**
 * "exec_*" Docker events carry the full command line (Attributes.execID / .cmd) of whatever
 * was run inside a container, which can include secrets passed as CLI args. Never buffer those
 * for the activity feed, which any authenticated user can read.
 */
function isSafeToSurface(rawMessage: string): boolean {
	try {
		const obj = JSON.parse(rawMessage) as Record<string, unknown>;
		const action = String(obj["Action"] ?? obj["action"] ?? "");
		return !action.startsWith("exec_");
	} catch {
		return false;
	}
}

export function publishEvent(event: SwarmEvent): void {
	hub.emit("event", event);
	const type = event.type ?? null;
	const message =
		event.message !== undefined
			? typeof event.message === "string"
				? event.message
				: JSON.stringify(event.message)
			: null;

	const safe = type !== "event" || !message || isSafeToSurface(message);
	if (safe && type === "event" && message) {
		ring.push({ time: new Date().toISOString(), message });
		if (ring.length > RING_SIZE) ring.shift();
	}

	void pubsub.publish(SWARM_TOPIC, {
		swarmEvent: { type, message },
	});
}

export function recentEvents(limit = 20): { time: string; message: string }[] {
	return ring.slice(-limit).reverse();
}
