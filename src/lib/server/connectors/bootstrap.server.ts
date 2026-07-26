/**
 * Server-only bootstrap for the authenticated connector registry.
 *
 * Every authenticated intelligence provider registers itself here.
 * The client is not involved — it reads a projected snapshot via
 * `createServerFn` wrappers in `src/lib/connectors.functions.ts`.
 */
import {
  registerAuthenticatedConnector,
  type HealthReport,
} from "./registry.server";
import { runGfwHealthCheck, validateGfwCredentials } from "@/lib/server/gfw.server";

let bootstrapped = false;

function toHealthReport(payload: {
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  message?: string;
}): HealthReport {
  const checkedAt = new Date().toISOString();
  if (payload.status === "healthy") {
    return { state: "healthy", httpStatus: 200, latencyMs: payload.latencyMs, checkedAt };
  }
  if (payload.status === "degraded") {
    return {
      state: "degraded",
      httpStatus: null,
      latencyMs: payload.latencyMs,
      message: payload.message,
      checkedAt,
    };
  }
  // "down" — differentiate auth failure vs offline vs missing creds
  const msg = (payload.message ?? "").toLowerCase();
  if (msg.includes("not configured")) {
    return {
      state: "unavailable",
      httpStatus: null,
      latencyMs: payload.latencyMs,
      message: payload.message,
      checkedAt,
    };
  }
  if (msg.includes("authentication")) {
    return {
      state: "auth_failed",
      httpStatus: 401,
      latencyMs: payload.latencyMs,
      message: payload.message,
      checkedAt,
    };
  }
  if (msg.includes("429") || msg.includes("rate")) {
    return {
      state: "rate_limited",
      httpStatus: 429,
      latencyMs: payload.latencyMs,
      message: payload.message,
      checkedAt,
    };
  }
  return {
    state: "offline",
    httpStatus: null,
    latencyMs: payload.latencyMs,
    message: payload.message,
    checkedAt,
  };
}

export function bootstrapAuthenticatedConnectors(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // ── Global Fishing Watch ──
  registerAuthenticatedConnector({
    id: "global-fishing-watch",
    name: "Global Fishing Watch",
    description:
      "Vessel identity, position, movement history, and AIS continuity evidence (Tier-1). Evidence only; OSAE assigns priority.",
    version: "1.0.0",
    secretEnv: "GFW_API_TOKEN",
    supportedEntityTypes: ["VESSEL"],
    probe: async () => {
      const payload = await runGfwHealthCheck();
      return toHealthReport(payload);
    },
  });

  // Startup validation — confirms the GFW token is present AND accepted
  // upstream so Provider Health reports a validated state, not an assumed
  // one. Fire-and-forget: bootstrap must never block on a network probe,
  // and a failed validation is itself the reported state.
  void validateGfwCredentials().catch(() => undefined);

  // Future authenticated providers register here — same contract.
}
