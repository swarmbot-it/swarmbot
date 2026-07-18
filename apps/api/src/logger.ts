import pino from "pino";

/** Structured logger, replacing ad-hoc console.* calls. Level is driven by
 * SWARMBOT_LOG_LEVEL (previously read into config but never wired to anything). */
export const logger = pino({
	level: process.env.SWARMBOT_LOG_LEVEL || "info",
});
