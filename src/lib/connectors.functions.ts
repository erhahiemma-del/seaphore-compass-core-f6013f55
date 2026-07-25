/**
 * Thin server-function wrappers exposing the authenticated connector
 * registry to the browser. This file follows the tss-serverfn-split
 * rule: only `createServerFn` declarations and imports live here.
 *
 * The browser NEVER reads env vars. To learn which authenticated
 * connectors exist, the browser calls `listAuthenticatedConnectorsFn`.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  bootstrapAuthenticatedConnectors,
} from "@/lib/server/connectors/bootstrap.server";
import {
  listConnectorSnapshots,
  probeConnector,
  probeAllConnectors,
  type ConnectorAdminSnapshot,
} from "@/lib/server/connectors/registry.server";

export type { ConnectorAdminSnapshot } from "@/lib/server/connectors/registry.server";

export const listAuthenticatedConnectorsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConnectorAdminSnapshot[]> => {
    bootstrapAuthenticatedConnectors();
    return listConnectorSnapshots();
  },
);

export const probeAuthenticatedConnectorFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data || typeof data.id !== "string") throw new Error("id required");
    return { id: data.id };
  })
  .handler(async ({ data }): Promise<ConnectorAdminSnapshot | null> => {
    bootstrapAuthenticatedConnectors();
    return probeConnector(data.id);
  });

export const probeAllAuthenticatedConnectorsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<ConnectorAdminSnapshot[]> => {
    bootstrapAuthenticatedConnectors();
    return probeAllConnectors();
  },
);
