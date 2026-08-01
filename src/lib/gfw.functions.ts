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
  runGfwHealthCheck,
  GfwCredentialsMissingError,
  GfwAuthError,
  GfwUpstreamError,
} from "@/lib/server/gfw.server";
import type { GfwEvidencePackage, GfwHealthPayload } from "@/connectors/global-fishing-watch/types";

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
