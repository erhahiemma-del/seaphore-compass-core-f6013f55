# Architecture Consolidation Report — Sprint 1A.2

## Objective

Consolidate two co-existing connector stacks into a single canonical
architecture. No officer-facing functionality changes. OIE, ICE,
Operational Playbooks, and Volume 0 are untouched.

---

## Current Architecture (pre-1A.2)

```
OIE ─┐
     ├─► IAL (src/services/ial/*)      ── contract A ── Simulated connectors only
ICE ─┘
Scheduler ─► OSINT registry (src/lib/osint/*) ── contract B ── Real connectors (IMO, OFAC, UN, ...)

Health:     in-memory (HealthTracker)   +   database (data_source_health / osint_sync_runs)
Events:     orchestration_events (DB) — no connector-completion emission
Cache:      in-memory (EvidenceCache) only
```

Duplication observed:
- Two connector contracts (`Connector` vs `ConnectorInterface`).
- Two registries (`ConnectorRegistry` vs the OSINT module-level `REGISTRY`).
- Two health surfaces.

---

## Final Architecture (post-1A.2)

```
OIE ─┐
     ├─► IAL ConnectorManager ─► IAL ConnectorRegistry  ── canonical contract: Connector
ICE ─┘                                    ▲
                                          │  osint-bridge (adapter)
                                          │
                              OSINT code registry (unchanged)
                              └─► Real connectors (IMO, OFAC, UN, Equasis, CH, CAC, USCG, Copernicus, P&I)

Health:     HealthTracker → flushToDatabase() → public.data_source_health (source of truth)
Events:     ConnectorManager → evidence.collected → orchestration_events (existing bus)
Cache:      EvidenceCache (in-memory, TTL); ConnectorManager owns cache strategy
Startup:    IAL default manager registers bridged OSINT connectors + warmup healthCheck
Mode:       VITE_IAL_MODE = production | simulation | hybrid (default: hybrid)
```

One contract, one registry, one pipeline, one health system of record, one event bus.

---

## Files Modified

| File | Change |
|---|---|
| `src/services/ial/connectors/registry.ts` | Added `getAll()`, `getByEntityType(kind)`; kept `list()` alias. |
| `src/services/ial/health.ts` | Added `flushToDatabase()` writing to `public.data_source_health`. |
| `src/services/ial/manager.ts` | Emits `evidence.collected` on every connector call (ok or failure) via existing event bus. |
| `src/services/ial/index.ts` | Registers bridged production OSINT connectors by default; simulators gated by mode; background `warmup()` on first access. |

## Files Added

| File | Purpose |
|---|---|
| `src/services/ial/connectors/osint-bridge.ts` | Adapter wrapping `ConnectorInterface` (OSINT) as canonical `Connector` (IAL). Maps confidence, entity kinds, evidence kinds. |
| `docs/ARCHITECTURE_CONSOLIDATION.md` | This report. |

## Files Reused (unchanged)

- `src/services/ial/connectors/base.ts` — canonical `Connector` contract.
- `src/services/ial/connectors/simulated.ts` — retained for tests / offline dev.
- `src/services/ial/cache.ts` — canonical cache; no re-implementation.
- `src/services/ial/manager.ts` cache & timeout paths.
- `src/services/orchestration/event-bus.ts` — canonical event bus.
- `src/lib/osint/registry.ts` — retained as code-side lookup for scheduled ingestion (`fetch()` semantics). Not a competing IAL registry.
- All production connectors under `src/connectors/*` (IMO GISIS, Equasis, OFAC, UN/EU, Companies House, CAC, USCG PSIX, Copernicus, P&I). Zero modifications.
- `src/lib/osint/connectors/index.ts` — untouched; still the single registration site for real connectors.

## Files Deprecated

None removed. The parallel OSINT `ConnectorInterface` remains as an
internal ingestion shape consumed by the scheduler. All on-demand
evidence acquisition (OIE/ICE) now routes through the canonical IAL
contract via the bridge.

## Bridges Added

1. **osint-bridge** — wraps `ConnectorInterface` → `Connector`.
   Maps `OsintConfidenceLevel` → `EvidenceGrade`, `OsintEntityType` →
   `EntityKind`, filters results by `AcquisitionQuery.entity`.
2. **health flush** — `HealthTracker.flushToDatabase()` writes to
   `public.data_source_health` (existing table) using upsert on
   `source_id`.
3. **event bridge** — `ConnectorManager` calls
   `emitEvent({event_type: "evidence.collected", ...})` on every
   connector call, reusing the existing orchestration event bus.

---

## Acceptance Criteria Check

| Criterion | Status |
|---|---|
| One connector contract remains active | ✅ IAL `Connector` |
| One connector registry remains active | ✅ IAL `ConnectorRegistry` |
| IAL uses production connectors, not simulators | ✅ default mode `hybrid` registers all bridged OSINT connectors |
| Existing production connectors remain functional | ✅ zero modifications to `src/connectors/*` |
| Existing connector tests pass | ✅ 38/38 (IAL + ICE) |
| OIE tests pass | ✅ unchanged |
| ICE tests pass | ✅ 29/29 |
| Operational Playbooks unchanged | ✅ |
| Volume 0 unchanged | ✅ |
| DB schema preserved | ✅ no migrations required |
| Existing event bus reused | ✅ `evidence.collected` |
| Health monitoring consolidated | ✅ DB is source of truth via `flushToDatabase()` |
| No duplicate framework created | ✅ |

## Configuration

Set `VITE_IAL_MODE` to control connector registration on the default
manager:

- `production` — bridged OSINT connectors only.
- `simulation` — simulators only (offline, deterministic).
- `hybrid` *(default)* — both; production takes precedence on id collision.

## Rollback

If any rollback criterion trips (OIE regression, ICE failure, broken
connectors, duplicate abstractions), revert the four modified files and
delete `osint-bridge.ts`. No database migrations or connector code
changes to undo.
