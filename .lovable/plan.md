# Sprint: One Pipeline — Canonical UIP Across Seaphore

Consolidate four coexisting fusion implementations into a single canonical Intelligence Fusion Engine (IFE) that emits one Unified Intelligence Package (UIP) per query/investigation. Every downstream capability (MKG, PIE, OSAE, Revenue, NMRSE, OKL, MIW, Mission Planning, Copilot, Executive Briefing, MIBC) consumes that UIP by `unifiedPackageId`. No UI/API surface changes.

## Current state (audit-confirmed)

Four fusion paths coexist:
1. `src/services/ife/*` — declared canonical; has `identity-resolver`, `canonical-builder`, `unified.ts` (UIP shape).
2. `src/services/fusion/*` — parallel "Sprint 7" pipeline (raw → normalize → score → dedupe → conflicts → rank).
3. `src/services/ice/*` — 14-module correlation engine with its own fusion/scoring/explainability.
4. `src/services/orchestration/evidence-fusion.ts` — the path actually used by the live Copilot.

Demo/fixture paths reaching production routes:
- `src/lib/api/mock-dataset.ts` (used by `/api/copilot/query`, `/api/session|entity|evidence|investigation|relationship/$id`)
- `src/services/okl/fixtures.ts` referenced by routes
- `revenue-leakage.tsx`, `predictions.tsx`, `intelligence-evidence.tsx`, `operational-knowledge.tsx` generate their own intelligence.

## Target pipeline

```text
Officer Query
  → Connector Framework (IAL: ConnectorManager.execute by capability)
  → Identity Resolution (ife/identity-resolver — canonical IDs)
  → Canonical IFE  (single fusion module)
  → UIP { unifiedPackageId, canonicalEntities, evidence, conflicts, provenance, confidence }
  → cache/persist by unifiedPackageId
  → MKG · PIE · OKL · OSAE · Revenue · NMRSE · MIW · Mission · Copilot · Brief · MIBC
```

## Plan

### 1. Canonical IFE
- Treat `src/services/ife` as canonical. Keep its public types: `UnifiedIntelligencePackage`, `unifiedPackageId`, `CanonicalEntity`, `FusedEvidence`, `Provenance`.
- Fold missing capabilities from siblings into IFE where absent:
  - Bring `services/fusion/hash.ts` claim-hash + `dedupe`/`rank` semantics into `ife/canonical-builder.ts` (or a new `ife/dedupe.ts`, `ife/rank.ts`).
  - Bring `ice/explainability.ts` reasoning-trace emitter under `ife/explainability.ts` so UIP carries per-field explainability.
- Add `ife/pipeline.ts` exposing one entry: `runIntelligencePipeline(query, manager) → Promise<UIP>`. Internally: plan → collect (via IAL) → identity-resolve → fuse → rank → conflicts → explain → freeze.

### 2. UIP registry (single source of truth at runtime)
- New `src/services/ife/registry.ts`: in-memory Map keyed by `unifiedPackageId` with `set/get/getByQueryHash`. Optional persistence hook (no schema change this sprint).
- Every consumer accepts either `uip: UIP` or `unifiedPackageId: string` and resolves via the registry.

### 3. Retire duplicate fusion paths
- `src/services/fusion/*` → thin re-export shims delegating to IFE, marked `@deprecated`. Delete internal impls once callers migrate (this sprint).
- `src/services/ice/engine.ts` → refactor `runIce` to call `runIntelligencePipeline` and adapt UIP to the existing `IntelligencePackage` return type (preserves callers).
- `src/services/orchestration/evidence-fusion.ts` → replace body with a call to IFE; keep exported function signature.
- `src/services/orchestration/orchestrator.ts` and OIE `engine.ts` → route retrieval + fusion through `runIntelligencePipeline`; stamp resulting `unifiedPackageId` onto the `Briefing`.

### 4. Wire downstream capabilities to UIP
Add `fromUip(uip: UIP)` adapters (no behaviour change to their output types):
- `services/mkg/ingest.ts` — build/refresh graph from UIP entities+edges.
- `services/pie/engine.ts` — accept UIP; drop route-side synthetic feeds.
- `services/okl/engine.ts` — accept UIP; remove `fixtures.ts` from production imports.
- `services/osae/*`, `services/revenue-leakage/*`, `services/nmrse/*` — accept UIP.
- `services/mission/*`, `stores/workspace.store.ts` (MIW), MIBC report builders — resolve UIP by `unifiedPackageId`.

### 5. Purge demo/fixtures from production paths
- `src/routes/api/copilot/query.ts` and the five `src/routes/api/*/$id.ts` files: replace `mockDb.*` with real service calls sourced from UIP (or return `404` when unresolved — no fabricated data).
- `src/lib/api/mock-dataset.ts` → moved under `src/mocks/` and referenced only by tests/Storybook.
- Routes `revenue-leakage.tsx`, `predictions.tsx`, `intelligence-evidence.tsx`, `operational-knowledge.tsx`: replace local intelligence generation with hooks that read UIP for the current investigation/query.
- `services/okl/fixtures.ts` → move under `__tests__`.

### 6. Projection Contract + tests
- Add/adjust registry entries in `src/lib/projection-contract/registry.ts`:
  - `capability.unified-intelligence-package` — Officer Projection: Executive Briefing header shows `unifiedPackageId` chip; Evidence Explorer filters by it.
  - Mark deprecated fusion modules as Internal Only with retirement note.
- New tests:
  - `tests/unit/uip-single-source.test.ts` — one query yields exactly one UIP; MKG/PIE/OKL/OSAE/Revenue/NMRSE all reference the same id.
  - Extend `tests/unit/fusion.test.ts` to assert deprecated shims delegate to IFE.
  - `tests/unit/no-demo-in-prod-routes.test.ts` — static grep: no `mock-dataset`, `okl/fixtures`, `seedEvidence` imports from `src/routes/**` or `src/features/**` (excluding `__tests__`, `stories`).

### 7. Non-goals (explicit)
- No new user-facing features.
- No DB migrations.
- No UI redesign. Executive Briefing gains only a small `UIP <id>` chip and existing evidence deep-links keep working.
- Public APIs and component props are preserved; only internals move.

## Technical details

- UIP shape (already in `ife/unified.ts`) is authoritative. Add `unifiedPackageId: string` (uuid v4) and `queryHash: string` if not present; freeze the object.
- `unifiedPackageId` is generated once at pipeline entry, propagated on every derived artifact (predictions, patterns, recommendations, tasks, briefings, reports) via a new `sourceUipId` field. Add this field where missing without breaking existing serialization (optional string).
- MIBC exporters embed `unifiedPackageId` in the report footer alongside the immutable footer text.
- Audit log: every pipeline run inserts one `audit_log` row `{action:'uip.generated', ref: unifiedPackageId}`; every downstream consumer logs `{action:'uip.consumed', ref: unifiedPackageId, by: <module>}` (best-effort; RLS-guarded).
- Deprecated barrels remain to preserve import paths; internals throw at build if the deprecated internal file is imported directly (guarded by an eslint no-restricted-imports rule scoped to `src/services/fusion/*` internals, plus `src/services/orchestration/evidence-fusion` internals).

## Rollout order (single sprint)

1. Freeze UIP shape + add `unifiedPackageId`/registry.
2. Implement `runIntelligencePipeline`; migrate OIE/orchestrator/ICE to call it.
3. Adapters for MKG, PIE, OKL, OSAE, Revenue, NMRSE, MIW, Mission, MIBC.
4. Delete demo-data references from production routes/features.
5. Convert `services/fusion/*` and `orchestration/evidence-fusion.ts` to thin shims.
6. Add tests + Projection Contract updates.
7. Run typecheck, unit tests, and the compliance/e2e specs already in `tests/`.

## Success verification

- `rg "mock-dataset|okl/fixtures|seedEvidence" src/routes src/features` returns no hits outside tests.
- One Copilot query → one `unifiedPackageId` observed on Briefing header, MIBC export footer, Investigation timeline entry, and audit log.
- `bun run typecheck` and `bunx vitest run` green.
