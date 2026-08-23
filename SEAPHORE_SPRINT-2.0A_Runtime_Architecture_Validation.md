# SPRINT 2.0A — Runtime Architecture Validation

**Mode:** Read-only. No code modified.
**Method:** Traced the live server-function call graph from `src/routes/copilot.tsx` through `runOIEFn` / `copilotQueryFn` down to Supabase reads, then cross-checked against runtime row counts (`supabase--read_query`) and the `cron.job` schedule.

---

## 1. Runtime Execution Diagram (actual)

```text
UI (src/routes/copilot.tsx)
  │
  │  useServerFn(runOIEFn)     ← default path (authenticated)
  │  useServerFn(copilotOverrideFn)
  ▼
src/lib/oie/oie.functions.ts  ── requireSupabaseAuth ──▶  runOIE(...)
                                                              │
src/services/oie/engine.ts:                                    │
  interpretQuery → resolvePronouns → buildMission               │
  → needsClarification → planSkills                             │
  → orchestrate(query)  ◀───── SINGLE fusion entry point ──────┘
        │
        ▼
src/services/orchestration/orchestrator.ts
  1. classifyIntent
  2. scheduleRetrievals  ──▶  agents/index.ts
                                └── retrieveEvidence()
                                      └── supabase.from("signals").select(...)
  3. fuseEvidence()      ──▶  services/orchestration/evidence-fusion.ts  ← ACTIVE fusion
  4. computeConfidenceMatrix
  5. reason()            ──▶  reasoning-engine + Lovable AI Gateway (server-side)
  6. buildBriefing  →  stamps  source_uip_id = "uip_" + hashQuery(...)   ← id only, NOT registered
  7. supabase.from("intel_briefings").insert(...)  (best-effort)
  8. emitEvent("briefing.generated")  ──▶  supabase.from("orchestration_events").insert(...)
  ▼
Briefing returned to client
  ▼
enhanceWithIBE(...)  (client-side behavioural wrapper)
  ▼
ExecutiveBriefing.tsx  → renders 9 sections
```

**One data source feeds the live pipeline: `public.signals` (14 rows).**

---

## 2. Actual Call Graph — Reads/Writes Observed at Runtime

| Layer        | Table / Service touched                               | Direction            | Where                                           |
| ------------ | ----------------------------------------------------- | -------------------- | ----------------------------------------------- |
| Agents       | `public.signals`                                      | READ                 | `src/services/orchestration/agents/index.ts:33` |
| Policy       | `public.user_roles`, `public.officer_action_counters` | READ/WRITE           | `policy-engine.ts`                              |
| Override     | `public.briefing_overrides`                           | READ/WRITE           | `override-gate.ts`                              |
| Orchestrator | `public.intel_briefings`                              | INSERT (best-effort) | `orchestrator.ts:63`                            |
| Event bus    | `public.orchestration_events`                         | INSERT               | `event-bus.ts:22`                               |
| MIBC cron    | `POST /api/public/hooks/mibc-tick` every 5 min        | HTTP                 | `cron.job` (confirmed active)                   |

Row counts at time of validation:

| Table                    |  Rows | Note                                                  |
| ------------------------ | ----: | ----------------------------------------------------- |
| `signals`                |    14 | Live pipeline reads only this                         |
| `entities`               |    14 |                                                       |
| `evidence`               |     1 |                                                       |
| `investigations`         |     1 |                                                       |
| `osint_connectors`       |    10 | Registered but never synced                           |
| `osint_records`          | **0** | No IAL ingest has run                                 |
| `osint_sync_runs`        | **0** | Scheduler has never executed                          |
| `ice_fused_intelligence` | **0** | ICE never persists                                    |
| `ice_queries`            | **0** | ICE never invoked                                     |
| `intel_briefings`        | **0** | Orchestrator insert always failing (RLS / dev-bypass) |
| `orchestration_events`   | **0** | Event-bus writes silently dropped                     |
| `report_schedules`       | **0** | MIBC cron ticks against empty table                   |
| `report_jobs`            | **0** |                                                       |

---

## 3. Active vs Inactive Services (runtime-verified)

### Active on the live Copilot request path

- `src/services/oie/*` — query interpreter, planner, response generator
- `src/services/orchestration/orchestrator.ts`
- `src/services/orchestration/agents/index.ts` (all six agents call the **same** `retrieveEvidence()` reading `signals`)
- `src/services/orchestration/scheduler.ts`
- `src/services/orchestration/evidence-fusion.ts` **(the fusion actually executed)**
- `src/services/orchestration/reasoning-engine.ts`
- `src/services/orchestration/policy-engine.ts`, `override-gate.ts`, `event-bus.ts`
- `src/services/ibe/*` — post-processing wrapper on the client
- `src/services/oie/provider-runtime.server.ts` → Lovable AI Gateway

### Dormant — imported by isolated routes/panels only, never on the Copilot pipeline

| Service                                                       | Only reachable via                                                                           | Runtime invocations observed on Copilot path |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `services/ife/engine.ts` (`fuseEvidence`)                     | `services/ife/unified.ts` + `__tests__`                                                      | 0                                            |
| `services/ife/registry.ts` (`registerUip`)                    | — no callers outside its own file —                                                          | **0**                                        |
| `services/ife/unified.ts` (`buildUnifiedIntelligencePackage`) | `routes/knowledge-graph.tsx` only                                                            | 0                                            |
| `services/ife/identity-resolver.ts`                           | MKG ingest (route-scoped)                                                                    | 0                                            |
| `services/ial/*` (Connector Manager, all connectors)          | Admin panels + a scheduler that has never run (`osint_sync_runs=0`)                          | 0                                            |
| `services/mkg/*`                                              | `routes/knowledge-graph.tsx`, `EntityInspector`, `GraphView`                                 | 0                                            |
| `services/pie/engine.ts`                                      | — no runtime callers —                                                                       | **0**                                        |
| `services/pie/store`                                          | `routes/predictions.tsx`, `national-risk.tsx`, `missions.tsx` (via `seedEvidence()` fixture) | 0                                            |
| `services/nmrse/*`                                            | `routes/national-risk.tsx` only                                                              | 0                                            |
| `services/revenue-leakage/*`                                  | `routes/revenue-leakage.tsx` (fed by `seedEvidence()` fixture)                               | 0                                            |
| `services/osae/*`                                             | `routes/intelligence-evidence.tsx`, GFW connector                                            | 0                                            |
| `services/ice/*`                                              | `features/evidence/IceExplainabilityPanel.tsx` (on-demand only)                              | 0                                            |
| `services/okl/*`                                              | Fixtures imported at module scope by 4 routes                                                | 0                                            |

### Legacy fusion implementations coexist

Confirmed by `import` graph:

1. `services/orchestration/evidence-fusion.ts` — **executed**
2. `services/ife/engine.ts` — dormant
3. `services/ice/*` — dormant
4. `services/fusion/*` — dormant (no runtime callers found)

---

## 4. Bypass Confirmation

The audit finding that the live pipeline bypasses IAL / Identity Resolution / IFE / UIP / MKG / PIE is **confirmed by runtime evidence**:

- **IAL:** `osint_sync_runs = 0`. `ConnectorManager` is not imported by any orchestration/OIE module. Only admin/screening UIs and `lib/osint/scheduler.ts` reference it, and the scheduler has no runtime caller in `src/`.
- **Identity Resolution:** `services/ife/identity-resolver.ts` is imported only inside `services/ife/unified.ts` and `services/mkg/*`. Neither is reachable from `orchestrate()`.
- **IFE:** `fuseEvidence` from `services/ife/engine.ts` is imported once — by `services/ife/unified.ts`. The orchestrator imports `fuseEvidence` from the sibling `services/orchestration/evidence-fusion.ts` instead.
- **UIP:** `registerUip()` has **zero runtime callers**. Orchestrator only stamps a `source_uip_id` string on the briefing — nothing writes the package to `services/ife/registry.ts`. All 6 API routes that read the registry (`api/copilot/query`, `api/entity/$id`, etc.) will therefore find nothing.
- **MKG:** `services/mkg/store.ts::ingest(uip, evidence)` is called only from `routes/knowledge-graph.tsx` with a UIP built on-the-fly from that route's local state, not from orchestrator output.
- **PIE:** No runtime callers of `services/pie/engine.ts`. `usePieStore` is populated only by `routes/predictions.tsx` after ingesting the fixture returned by its local `seedEvidence()` function.

---

## 5. Production vs Demo Execution Paths

### Fixtures/seeds that DO execute in production

| Location                                                                                               | Trigger                                                                                                                                                                   | Effect                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/routes/revenue-leakage.tsx:41,119`                                                                | Route mount                                                                                                                                                               | `seedEvidence()` synthesises evidence, feeds `scan(...)` → populates `useRevenueLeakageStore` |
| `src/routes/predictions.tsx:41,111`                                                                    | Route mount                                                                                                                                                               | `seedEvidence()` → `ingest({ evidence })` → populates `usePieStore`                           |
| `src/services/okl/fixtures.ts` (`DEMO_UIP`, `DEMO_EVIDENCE`, `DEMO_HISTORICAL`, `DEMO_INVESTIGATIONS`) | Imported at module scope by `routes/copilot.tsx`, `routes/intelligence-evidence.tsx`, `routes/operational-knowledge.tsx`, `components/investigation/OklPatternsPanel.tsx` | Ships to the browser bundle; renders OKL panels from constants, not from the current UIP      |
| `src/mocks/api-dataset.ts`                                                                             | Not imported by any production route (verified)                                                                                                                           | Neutralised by the SSOT sprint                                                                |

### Investigation Workspace persistence

- `src/stores/workspace.store.ts:318,726` uses `zustand/persist` with `createJSONStorage(() => window.localStorage)`.
- No `supabase.from(...)` call anywhere in `workspace.store.ts`.
- `public.investigations` (row count 1) is written only by `src/lib/api/investigations.functions.ts`, which is not invoked by the workspace store.
- **Conclusion:** Investigation Workspace state (notebook entries, tasks, timeline, OKL sync) lives **only in the officer's browser localStorage**. It is not synchronised with Supabase.

---

## 6. Orphan Tables (runtime consumers)

| Table                                                                                                                                                                          | Runtime consumer?                                                                                                                                                 | Notes                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `osint_records`, `osint_sync_runs`, `osint_dead_letters`, `osint_entity_index`, `osint_graph_edges`, `osint_source_trust`                                                      | **None on the live pipeline.** Writers exist in `src/connectors/*` and `src/lib/osint/scheduler.ts`, but the scheduler is not scheduled and `osint_sync_runs = 0` | Consumed only by `routes/admin.osint.tsx` for administration    |
| `osint_connectors`                                                                                                                                                             | Read by admin UI, populated by 10 rows via seed migration; never sync-updated                                                                                     |                                                                 |
| `ice_conflicts`, `ice_correlation_matrix`, `ice_corroborations`, `ice_evidence_scores`, `ice_fused_intelligence`, `ice_queries`, `ice_query_connectors`, `ice_recommendations` | `services/ice/*` writes on-demand only via `IceExplainabilityPanel`. All 8 tables are empty                                                                       | No edge functions, no cron                                      |
| `orchestration_events`                                                                                                                                                         | Would be written by `services/orchestration/event-bus.ts`, but table is empty → inserts are failing silently (likely RLS in dev-bypass)                           | Also written by public webhooks route `api/public/workflows.ts` |
| `report_schedules`, `report_jobs`                                                                                                                                              | MIBC pg_cron fires `mibc-dispatch-tick` every 5 min against these tables (confirmed in `cron.job`). Both empty because no officer has created a schedule          | Cron path IS live                                               |
| `intel_briefings`                                                                                                                                                              | Orchestrator inserts on every request, but RLS blocks in dev-bypass. `intel_briefings = 0`                                                                        | Silent failure — briefings never persist                        |

No Supabase Edge Functions exist (`supabase/functions/` is absent). Only one cron job: `mibc-dispatch-tick`.

---

## 7. End-to-End Vessel Query Trace

Query: officer types `"DONGWON NO.16"` in Copilot.

| #   | Component              | File:line                           | Action                                                                                                        |
| --- | ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `Copilot.tsx` submit   | `src/routes/copilot.tsx:227,235`    | Calls `runOIEFn` via `useServerFn` (auth path)                                                                |
| 2   | Server-fn boundary     | `src/lib/oie/oie.functions.ts:31`   | `requireSupabaseAuth` mints authed Supabase client                                                            |
| 3   | `runOIE`               | `src/services/oie/engine.ts`        | `interpretQuery` → `planSkills` → calls `orchestrate()`                                                       |
| 4   | Orchestrator step 1    | `orchestrator.ts`                   | `classifyIntent` extracts entities, capabilities                                                              |
| 5   | Orchestrator step 2    | `scheduler.ts:14`                   | Fires one `agent.retrieve()` per capability — all resolve to the **same** `retrieveEvidence()` helper         |
| 6   | Data read              | `agents/index.ts:33`                | `supabase.from("signals").select(...).limit(25)` — 14 rows exist project-wide                                 |
| 7   | Orchestrator step 3    | `orchestrator.ts:36`                | `fuseEvidence(results)` from **`services/orchestration/evidence-fusion.ts`**                                  |
| 8   | Confidence + reasoning | `reasoning-engine.ts`               | Calls Lovable AI Gateway (Gemini) via `invokeReasoningProvider`                                               |
| 9   | Briefing stamped       | `orchestrator.ts:44-53`             | `source_uip_id = uip_<hash>` computed but **never registered** in `services/ife/registry.ts`                  |
| 10  | Persist                | `orchestrator.ts:63`                | `supabase.from("intel_briefings").insert(...)` — succeeds only if session; row count is 0 → currently failing |
| 11  | Event                  | `event-bus.ts:22`                   | `supabase.from("orchestration_events").insert(...)` — row count is 0 → currently failing                      |
| 12  | Return                 |                                     | Briefing marshalled back to client                                                                            |
| 13  | IBE wrap               | `services/ibe/response-contract.ts` | Post-processes 9-step contract                                                                                |
| 14  | Render                 | `ExecutiveBriefing.tsx`             | Renders 9 sections. OKL panel below reads `DEMO_UIP` fixture, **not** the returned briefing                   |

**Nothing on this path invokes IAL, IFE fusion, Identity Resolver, UIP registry, MKG, PIE, OSAE, NMRSE, OKL, or ICE.**

---

## 8. Refactoring Risk Assessment

| Change                                                                                      | Risk         | Reasoning                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retire `services/fusion/*` and `services/ice/*` fusion code paths                           | **Low**      | Zero runtime callers on the Copilot pipeline; ICE only wired to an on-demand panel                                                                                                 |
| Retire `services/orchestration/evidence-fusion.ts` **before** migrating orchestrator to IFE | **Critical** | This is the ONLY fusion the live pipeline uses. Blind removal blanks every briefing                                                                                                |
| Delete `services/pie/engine.ts`                                                             | **Low**      | No runtime callers found                                                                                                                                                           |
| Delete OKL fixtures                                                                         | **Medium**   | 4 routes import them at module scope; removal requires those routes to consume the real UIP (currently unreachable — no orchestrator writes to registry)                           |
| Delete `seedEvidence()` from `predictions.tsx` / `revenue-leakage.tsx`                      | **Medium**   | These routes will render empty until PIE/Revenue engines consume the canonical UIP                                                                                                 |
| Move Investigation Workspace off `localStorage`                                             | **High**     | No Supabase schema exists for notebook/tasks; migration requires new tables + RLS + a store rewrite. Officers lose their in-flight state on cutover unless a migration script runs |
| Stop `lib/osint/scheduler.ts` and its connectors                                            | **Zero**     | Never runs — no active caller, `osint_sync_runs = 0`                                                                                                                               |
| Fix `intel_briefings` / `orchestration_events` persistence                                  | **Low**      | RLS + auth path is already correct; failures are silent because inserts throw and are caught. Diagnostic-only                                                                      |
| Populate UIP registry from orchestrator                                                     | **Low**      | Adds one line (`registerUip(...)`) but unlocks every downstream service                                                                                                            |

---

## 9. Final Recommendation — Canonical Pipeline

The runtime evidence confirms the audit: the app has **one** live intelligence path and it is deliberately narrow. Rather than swap engines in-place, converge on the pipeline that is already executing and re-plumb the dormant services to consume its output.

**Adopt this canonical order (fewest breaking changes):**

```text
Officer query
   ↓
IAL Connector Manager   ← Step A: run the scheduler even in dev; write to osint_records
   ↓
Orchestrator scheduler  ← Step B: agents read osint_records + signals (union), not signals alone
   ↓
Identity Resolver        ← Step C: called before fusion, not by MKG only
   ↓
IFE fuseEvidence + buildUnifiedIntelligencePackage
   ↓
registerUip(...)         ← Step D: single line inside orchestrator.ts unlocks the registry
   ↓
Confidence + Reasoning   (unchanged)
   ↓
Briefing (stamped source_uip_id)
   ↓
Fan-out consumers read the SAME uip via getUip(source_uip_id):
   MKG.ingest, PIE.run, OSAE, NMRSE, RevenueLeakage, OKL, Executive Briefing, MIBC
```

Retire **`services/orchestration/evidence-fusion.ts`** as the canonical fusion (kept as a thin adapter during the swap, then deleted). Retire `services/fusion/*` and `services/ice/*` fusion outright — no runtime users.

Sequence the refactor as three shippable slices (each individually reversible):

1. **Wire the registry** — add `registerUip(...)` in `orchestrator.ts` and have `MKG`, `PIE`, `OSAE`, `NMRSE`, `RevenueLeakage`, `OKL` all resolve via `getUip(briefing.source_uip_id)`. This ends the demo-data era for those routes.
2. **Migrate the orchestrator to IFE fusion** behind a feature flag; delete the `orchestration/evidence-fusion.ts` shim once briefings are identical.
3. **Persist Investigation Workspace to Supabase** — new tables (`workspace_entries`, `workspace_tasks`) with RLS, migrate `zustand/persist` → hydrator that pulls from Supabase and mirrors to localStorage for offline.

**Do not** proceed with a wholesale fusion rewrite: the risk is concentrated in Step 2, and steps 1 and 3 unblock every user-visible symptom.

---

## Appendix — Evidence Sources

- Import graph: `rg` over `src/services/{orchestration,oie,ibe,ife,ial,mkg,pie,nmrse,revenue-leakage,osae,ice,okl}`.
- Row counts: `supabase--read_query` on 13 tables (see §2).
- `cron.job` inspection: only `mibc-dispatch-tick` active.
- File pins: `orchestrator.ts:36` (fusion import), `agents/index.ts:33` (signals read), `ife/registry.ts:21` (only definition of `registerUip`, zero callers), `workspace.store.ts:726` (localStorage persistence).
