/**
 * OSINT → IAL Bridge Adapter (Sprint 1A.2 Consolidation).
 *
 * The Seaphore codebase historically carried two connector contracts:
 *   • IAL `Connector` (`src/services/ial/connectors/base.ts`) — the
 *     canonical, query-shaped contract consumed by OIE/ICE.
 *   • OSINT `ConnectorInterface` (`src/lib/osint/types.ts`) — the
 *     scheduler-shaped contract for background ingestion runs.
 *
 * We keep the IAL contract as canonical and expose every production
 * OSINT connector through this adapter. No production connector code
 * is modified — the adapter wraps a `ConnectorInterface` and exposes it
 * to the IAL as a `Connector`.
 */
import type {
  ConnectorInterface as OsintConnector,
  OsintConfidenceLevel,
  OsintEntityType,
  SeaphoreRecord,
} from "@/lib/osint/types";
import { normalizeRecord } from "../normalizer";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  EntityKind,
  EvidenceGrade,
  NormalizedEvidence,
} from "../types";
import type { Connector } from "./base";

function toGrade(level: OsintConfidenceLevel): EvidenceGrade {
  switch (level) {
    case "AUDITED":
    case "VERIFIED":
      return "VERIFIED";
    case "CORROBORATED":
      return "CORROBORATED";
    case "OBSERVED":
      return "OBSERVED";
    case "DECLARED":
      return "REPORTED";
    case "INFERRED":
      return "INFERRED";
    default:
      return "UNKNOWN";
  }
}

function toEntityKind(t: OsintEntityType): EntityKind {
  switch (t) {
    case "VESSEL":
      return "vessel";
    case "PORT":
      return "port";
    case "CARGO":
      return "cargo";
    case "VOYAGE":
      return "voyage";
    case "AGENT":
    case "OWNER":
    case "SANCTION":
    case "ALERT":
    case "WEATHER":
    default:
      return "company";
  }
}

function toKind(entity: OsintEntityType, rec: SeaphoreRecord): NormalizedEvidence["kind"] {
  const raw = String(rec.data?.["kind"] ?? "").toLowerCase();
  if (raw && ["identity","position","voyage","ownership","cargo","sanctions","compliance","port-call","weather","other"].includes(raw)) {
    return raw as NormalizedEvidence["kind"];
  }
  switch (entity) {
    case "SANCTION": return "sanctions";
    case "VOYAGE": return "voyage";
    case "CARGO": return "cargo";
    case "OWNER": return "ownership";
    case "WEATHER": return "weather";
    case "PORT": return "port-call";
    case "VESSEL": return "identity";
    default: return "other";
  }
}

function entityMatches(query: AcquisitionQuery, ev: NormalizedEvidence): boolean {
  if (!query.entity) return true;
  if (query.entity.kind !== ev.entity.kind) return false;
  if (query.entity.id === ev.entity.id) return true;
  // Fuzzy match on label (case-insensitive) for name-based lookups.
  const qLabel = query.entity.label?.toLowerCase();
  const eLabel = ev.entity.label?.toLowerCase();
  return !!qLabel && !!eLabel && (qLabel === eLabel || eLabel.includes(qLabel));
}

/** Canonical entity kinds served by an OSINT connector, inferred from
 *  its declared category. Used by `registry.getByEntityType()`. */
function entityKindsFor(osint: OsintConnector): ReadonlyArray<EntityKind> {
  switch (osint.category) {
    case "AIS": return ["vessel"];
    case "SANCTIONS": return ["vessel", "company", "person"];
    case "REGISTRY": return ["vessel", "company"];
    case "WEATHER": return ["port"];
    case "IMAGERY": return ["vessel", "port"];
    case "TRADE": return ["cargo", "voyage"];
    case "COMPLIANCE": return ["vessel", "company"];
    default: return [];
  }
}

export interface OsintBridgeOptions {
  /** Override the connector id used on the IAL side. Defaults to the
   *  OSINT connector's `name`. */
  readonly id?: ConnectorId;
}

/**
 * Wrap an OSINT connector so it satisfies the canonical IAL contract.
 * The bridge calls `fetch()` on the underlying provider, normalises
 * every record into `NormalizedEvidence`, then filters by the query.
 * Providers that require expensive network I/O are covered by the
 * ConnectorManager cache and per-connector timeout.
 */
export function bridgeOsintConnector(
  osint: OsintConnector,
  opts: OsintBridgeOptions = {},
): Connector & { readonly entityKinds: ReadonlyArray<EntityKind> } {
  const id = (opts.id ?? osint.name) as ConnectorId;
  const displayName = osint.description || osint.name;
  const kinds = entityKindsFor(osint);
  let authed = false;

  async function run(q: AcquisitionQuery): Promise<ConnectorResult> {
    const started = performance.now();
    try {
      const raws = await osint.fetch();
      const records: NormalizedEvidence[] = [];
      for (const raw of raws) {
        try {
          const rec = osint.normalize(raw);
          const kind = toKind(rec.entityType, rec);
          const ev = normalizeRecord({
            source: id,
            sourceName: displayName,
            grade: toGrade(rec.confidenceLevel),
            entity: {
              kind: toEntityKind(rec.entityType),
              nativeId: rec.entityId,
              label: (rec.data?.["name"] as string | undefined) ?? undefined,
            },
            kind,
            fields: Object.fromEntries(
              Object.entries(rec.data ?? {}).filter(([, v]) =>
                v === null ||
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean",
              ),
            ) as Record<string, string | number | boolean | null>,
            observedAt: rec.validFrom || rec.fetchedAt,
            providerRecordId: rec.sourceRef,
            excerpt: (rec.data?.["excerpt"] as string | undefined) ?? undefined,
          });
          if (entityMatches(q, ev)) records.push(ev);
        } catch {
          // Skip malformed raw record — pipeline never throws.
        }
      }
      return {
        connectorId: id,
        ok: true,
        records,
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (err) {
      return {
        connectorId: id,
        ok: false,
        records: [],
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Math.round(performance.now() - started),
      };
    }
  }

  return {
    id,
    displayName,
    entityKinds: kinds,
    async connect() { /* no-op — OSINT connectors are stateless */ },
    async authenticate() {
      try {
        const h = await osint.healthCheck();
        authed = h.status !== "down";
        return authed;
      } catch {
        authed = false;
        return false;
      }
    },
    async search(q) { return run(q); },
    async lookup(q) { return run(q); },
    normalize() { return null; },
    async healthCheck(): Promise<ConnectorHealth> {
      const started = performance.now();
      try {
        const h = await osint.healthCheck();
        return {
          connectorId: id,
          available: h.status === "healthy",
          authenticated: authed,
          latencyMsP50: h.latencyMs ?? Math.round(performance.now() - started),
          failureRate: h.status === "down" ? 1 : 0,
          quotaRemaining: null,
          lastSuccessAt: h.status !== "down" ? new Date().toISOString() : null,
          lastError: h.status === "down" ? (h.message ?? "unavailable") : null,
        };
      } catch (err) {
        return {
          connectorId: id,
          available: false,
          authenticated: false,
          latencyMsP50: Math.round(performance.now() - started),
          failureRate: 1,
          quotaRemaining: null,
          lastSuccessAt: null,
          lastError: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
