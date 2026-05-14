import { EventEmitter } from "events";
import { pubsub, SWARM_TOPIC } from "../graphql/pubsub.js";

export type SwarmEvent = { type?: string; message?: unknown; [k: string]: unknown };

const hub = new EventEmitter();
hub.setMaxListeners(200);

export function subscribeEvents(handler: (e: SwarmEvent) => void): () => void {
  hub.on("event", handler);
  return () => hub.off("event", handler);
}

export function publishEvent(event: SwarmEvent): void {
  hub.emit("event", event);
  void pubsub.publish(SWARM_TOPIC, {
    swarmEvent: {
      type: event.type ?? null,
      message:
        event.message !== undefined
          ? typeof event.message === "string"
            ? event.message
            : JSON.stringify(event.message)
          : null,
    },
  });
}
