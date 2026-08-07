/**
 * Thin server-function wrappers for evidence acquisition.
 *
 * Only imports and `createServerFn` declarations live here (per
 * `tanstack-serverfn-splitting`); every runtime path is in
 * `src/lib/server/acquisition.server.ts`, which is blocked from client
 * bundles. These wrappers are the ONLY way officer surfaces reach
 * authenticated Evidence Providers.
 */
import { createServerFn } from "@tanstack/react-start";
import type { EntityKind } from "@/services/ial";
import type { ServerSanctionsScreening } from "@/lib/server/acquisition.server";

export const screenSanctions = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; kind?: EntityKind; imo?: string }) => {
    if (!data || typeof data.name !== "string" || data.name.trim().length === 0) {
      throw new Error("name is required");
    }
    return {
      name: data.name.trim().slice(0, 200),
      kind: data.kind,
      imo: typeof data.imo === "string" ? data.imo.trim().slice(0, 20) : undefined,
    };
  })
  .handler(async ({ data }): Promise<ServerSanctionsScreening> => {
    const { screenSanctionsOnServer } = await import("@/lib/server/acquisition.server");
    return screenSanctionsOnServer(data);
  });

/**
 * ICE correlation runs server-side so authenticated providers contribute.
 * The package is transported as JSON text because it carries
 * provider-native `unknown` field values the RPC serializer cannot type;
 * the caller parses it back into `IntelligencePackage`.
 */
export const runIceCorrelation = createServerFn({ method: "POST" })
  .inputValidator((data: { text: string }) => {
    if (!data || typeof data.text !== "string" || data.text.trim().length === 0) {
      throw new Error("text is required");
    }
    return { text: data.text.trim().slice(0, 500) };
  })
  .handler(async ({ data }): Promise<{ json: string }> => {
    const { runIceOnServer } = await import("@/lib/server/acquisition.server");
    return { json: JSON.stringify(await runIceOnServer({ text: data.text })) };
  });

