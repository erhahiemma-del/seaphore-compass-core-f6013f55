/**
 * Thin server-function wrappers for the Global Fishing Watch gateway.
 *
 * This file intentionally contains ONLY `createServerFn` declarations
 * and imports (per `tanstack-serverfn-splitting`). All logic lives in
 * `src/lib/server/gfw.server.ts`, which is blocked from client bundles.
 * These wrappers are the ONLY public surface the browser connector
 * uses to reach GFW.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  runGfwSearch,
  runGfwAreaSearch,
  runGfwHealthCheck,
  GfwCredentialsMissingError,
  GfwAuthError,
  GfwUpstreamError,
} from "@/lib/server/gfw.server";
import type {
  GfwAreaQuery,
  GfwAreaResult,
  GfwEvidencePackage,
  GfwHealthPayload,
} from "@/connectors/global-fishing-watch/types";

export interface GfwSearchResult {
  package: GfwEvidencePackage | null;
  error?: {
    code: "GFW_CREDENTIALS_MISSING" | "GFW_AUTH_FAILED" | "GFW_UPSTREAM_ERROR";
    message: string;
  };
}

export const gfwSearch = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string }) => {
    if (!data || typeof data.query !== "string") throw new Error("query is required");
    return { query: data.query.slice(0, 200) };
  })
  .handler(async ({ data }): Promise<GfwSearchResult> => {
    try {
      const pkg = await runGfwSearch(data.query);
      return { package: pkg };
    } catch (err) {
      if (err instanceof GfwCredentialsMissingError) {
        return { package: null, error: { code: "GFW_CREDENTIALS_MISSING", message: err.message } };
      }
      if (err instanceof GfwAuthError) {
        return { package: null, error: { code: "GFW_AUTH_FAILED", message: err.message } };
      }
      if (err instanceof GfwUpstreamError) {
        return { package: null, error: { code: "GFW_UPSTREAM_ERROR", message: err.message } };
      }
      console.error("[gfwSearch] unexpected error", err);
      return {
        package: null,
        error: { code: "GFW_UPSTREAM_ERROR", message: "Unexpected upstream failure" },
      };
    }
  });

export const gfwHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<GfwHealthPayload> => {
    return runGfwHealthCheck();
  },
);

/**
 * Area / positions query for the Live Command Map (Sprint G5.5.3).
 *
 * `runGfwAreaSearch` never throws — every failure is a typed status — so
 * this wrapper is a thin pass-through with no error translation. That is
 * deliberate: the map needs to distinguish "no credentials" from "nothing
 * in this box", and collapsing both into a null result would erase that.
 *
 * Input is validated and clamped here so a malformed client request can
 * never reach the upstream provider.
 */
export const gfwAreaSearch = createServerFn({ method: "POST" })
  .inputValidator((data: GfwAreaQuery) => {
    const bbox = data?.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) {
      throw new Error("bbox is required as [west, south, east, north]");
    }
    const numeric = bbox.map((n) => Number(n));
    if (numeric.some((n) => !Number.isFinite(n))) {
      throw new Error("bbox must contain four finite numbers");
    }
    const [west, south, east, north] = numeric;
    if (west >= east || south >= north) {
      throw new Error("bbox must be ordered [west, south, east, north]");
    }
    return {
      bbox: [west, south, east, north] as [number, number, number, number],
      ...(typeof data.since === "string" ? { since: data.since } : {}),
      ...(typeof data.until === "string" ? { until: data.until } : {}),
      ...(typeof data.limit === "number" ? { limit: data.limit } : {}),
    } satisfies GfwAreaQuery;
  })
  .handler(async ({ data }): Promise<GfwAreaResult> => {
    return runGfwAreaSearch(data);
  });
