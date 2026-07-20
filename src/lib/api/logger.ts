/**
 * Structured JSON logger (Pino).
 * Sprint 5 · Layer 5.2 – API observability.
 * Every request/response line is a single JSON object for log aggregators.
 */
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "nimasa-copilot-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
