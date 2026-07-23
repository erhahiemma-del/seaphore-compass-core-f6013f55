/**
 * Connector Registry — the canonical, single directory of IAL connectors.
 *
 * Consolidation note (Sprint 1A.2): the OSINT connector registry in
 * `src/lib/osint/registry.ts` is retained only as a code-side lookup for
 * the scheduled ingestion pipeline (scraper-style `fetch()`). All
 * on-demand evidence acquisition (OIE → ICE → IAL) uses THIS registry.
 * The osint-bridge adapter (`osint-bridge.ts`) wraps each OSINT
 * `ConnectorInterface` into an IAL `Connector` and registers it here.
 */
import type { ConnectorId, EntityKind } from "../types";
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

  /** Preferred alias — matches roadmap API. */
  getAll(): ReadonlyArray<Connector> {
    return Array.from(this.items.values());
  }

  /** Kept for backward compatibility with earlier IAL callers. */
  list(): ReadonlyArray<Connector> {
    return this.getAll();
  }

  has(id: ConnectorId): boolean {
    return this.items.has(id);
  }

  /**
   * Return connectors declared to serve a given canonical entity kind.
   * A connector opts in by exposing `entityKinds` (added by the
   * osint-bridge adapter). Connectors that do not declare kinds are
   * returned for every kind — this preserves backward compatibility
   * with the pre-consolidation IAL simulators.
   */
  getByEntityType(kind: EntityKind): ReadonlyArray<Connector> {
    return this.getAll().filter((c) => {
      const kinds = (c as Connector & { entityKinds?: ReadonlyArray<EntityKind> }).entityKinds;
      return !kinds || kinds.length === 0 || kinds.includes(kind);
    });
  }
}
