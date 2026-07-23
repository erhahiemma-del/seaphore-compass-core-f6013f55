/**
 * Connector Registry — pluggable directory of connectors.
 *
 * Adding a provider is a `register()` call; the OIE never needs to change.
 */
import type { ConnectorId } from "../types";
import type { Connector } from "./base";

export class ConnectorRegistry {
  private readonly items = new Map<ConnectorId, Connector>();

  register(connector: Connector): void {
    this.items.set(connector.id, connector);
  }

  unregister(id: ConnectorId): void {
    this.items.delete(id);
  }

  get(id: ConnectorId): Connector | undefined {
    return this.items.get(id);
  }

  list(): ReadonlyArray<Connector> {
    return Array.from(this.items.values());
  }

  has(id: ConnectorId): boolean {
    return this.items.has(id);
  }
}
