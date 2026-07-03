import pino from "pino";

/** Structured logger, replacing ad-hoc console.* calls. Level is driven by
 * SWARMBOTY_LOG_LEVEL (previously read into config but never wired to anything). */
export const logger = pino({
	level: process.env.SWARMBOTY_LOG_LEVEL || "info",
});
