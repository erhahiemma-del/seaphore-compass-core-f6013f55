/**
 * Thin server-function wrappers for the Provider Health Dashboard.
 * Only imports and `createServerFn` declarations live here.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  probeAllProviders,
  probeProviderById,
  type ProviderHealthSnapshot,
} from "@/lib/server/providers/health.server";

export type {
  ProviderHealthSnapshot,
  ProviderHealthState,
} from "@/lib/server/providers/health.server";

export const probeProviderHealthFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<ProviderHealthSnapshot[]> => probeAllProviders(),
);

export const probeSingleProviderHealthFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data || typeof data.id !== "string" || data.id.length === 0) {
      throw new Error("id required");
    }
    return { id: data.id };
  })
  .handler(async ({ data }): Promise<ProviderHealthSnapshot | null> =>
    probeProviderById(data.id),
  );
