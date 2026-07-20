/**
 * In-process registry of connector implementations.
 *
 * The Supabase `osint_connectors` table stores connector *configuration*
 * and health metrics. This registry stores connector *code*. A connector
 * declares itself once at module load; the scheduler then looks up the
 * implementation by name whenever a scheduled run fires.
 *
 * Adding a new connector requires exactly two things:
 *   1. Create a file that exports an object implementing ConnectorInterface.
 *   2. Import it in `src/lib/osint/connectors/index.ts` so `registerConnector`
 *      runs at server startup.
 */
import type { ConnectorInterface } from "./types";

const REGISTRY = new Map<string, ConnectorInterface>();

export function registerConnector(connector: ConnectorInterface): void {
  if (REGISTRY.has(connector.name)) {
    // Idempotent: last registration wins. Useful during hot reload.
    REGISTRY.set(connector.name, connector);
    return;
  }
  REGISTRY.set(connector.name, connector);
}

export function getConnector(name: string): ConnectorInterface | undefined {
  return REGISTRY.get(name);
}

export function listConnectors(): ConnectorInterface[] {
  return Array.from(REGISTRY.values());
}
