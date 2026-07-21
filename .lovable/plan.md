# Unified Copilot Platform + Persistent Mission Context

Merge the two Copilot surfaces (NIMASA `/copilot` Intelligence Operations Center and the Seaphore `AskCopilotDialog` / `CentreCopilot` panels) into one system: one orchestration pipeline, one conversation store, one context manager, one Adaptive Briefing renderer, and one shared **Mission Context** that every module reads and updates.

## Outcome

- Every Copilot surface (global modal, `/copilot` page, per-centre panels) calls the same `orchestrate()` pipeline and renders the same `AdaptiveBriefing`.
- Opening Copilot from Manifest / Revenue / Vessel / Ports / Compliance / Ownership / Evidence / Alerts / Memory auto-injects that module's context and biases the agent scheduler toward its specialist agents.
- Conversation history and officer overrides are shared across surfaces in real time.
- A **Mission Context** object per active investigation persists the full operational state (vessel, voyage, manifest, port, companies, alerts, evidence, decisions, tasks, hypotheses, next actions) and is available to every module and to the reasoning engine as grounding input.

## Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│  Mission Context Store (Zustand, per-investigation, persisted)│
│   investigation · vessel · voyage · manifest · port ·         │
│   companies · alerts · evidence · decisions · tasks ·         │
│   conversation · hypotheses · next-actions                    │
└───────────────▲───────────────────────────────▲───────────────┘
                │ read / update                 │ grounding
   ┌────────────┴────────────┐     ┌────────────┴────────────┐
   │ Modules (Manifest,      │     │  Unified Copilot Engine │
   │  Revenue, Vessel, …)    │────▶│  orchestrate({ query,   │
   │  push context on mount  │     │   moduleHint, mission })│
   └─────────────────────────┘     └────────────┬────────────┘
                                                │
              ┌─────────────────────────────────┴────────────────┐
              │ Copilot Surfaces (all render AdaptiveBriefing)   │
              │  • GlobalCopilotLauncher modal                   │
              │  • /copilot Intelligence Operations Center       │
              │  • CentreCopilot panels                          │
              └──────────────────────────────────────────────────┘
```

## Plan

### 1. Mission Context (new)
Create `src/stores/mission-context.store.ts` — a Zustand store keyed by `investigationId` with slices for: `vessel`, `voyage`, `manifest`, `port`, `companies[]`, `alerts[]`, `evidence[]`, `decisions[]`, `tasks[]`, `conversation` (UIMessage-style history of briefings + queries), `hypotheses[]`, `nextActions[]`. Persisted to `localStorage` and (later) mirrored to `intel_briefings` + a new `mission_snapshots` table.

Expose:
- `useMissionContext(investigationId)` — full read
- `useActiveMission()` — active investigation
- `setMissionSlice(id, slice, value)` — patch API used by modules
- `appendConversation(id, entry)` — used by Copilot surfaces

### 2. Unified Copilot Engine
Extend `orchestrate()` in `src/services/orchestration/orchestrator.ts` to accept:
- `moduleHint: CopilotInstanceKey` — biases `scheduleRetrievals()` toward specialist agents (e.g. `manifest` ⇒ manifest + cargo agents first).
- `mission: MissionSnapshot` — flattened Mission Context; passed to `reason()` as grounding evidence and to `intent-classifier` for context-aware classification.

Update `intent-classifier.ts` + `scheduler.ts` to consume `moduleHint`. Extend `evidence-fusion.ts` to include mission-scoped evidence.

### 3. One conversation store
Retire the ad-hoc state in `CopilotWorkspace.tsx`, `/copilot`, and `AskCopilotDialog`. Route every submission through a new `useCopilotSession(instanceKey)` hook (backed by Mission Context's `conversation` slice) so history and the latest briefing are the same object across surfaces.

### 4. One renderer
Replace the `AskCopilotDialog` body with `<CopilotWorkspace instance=… showContextBar autoFocus />`. Kill the mock-intelligence path (`src/lib/ai/mock-intelligence.ts`) in favor of `orchestrate()` — mocks stay only under `VITE_DEV_BYPASS_AUTH` via the existing service-layer path. `CentreCopilot` "Ask" panels also open the same workspace (modal) instead of the legacy dialog.

### 5. Module-awareness wiring
For each Intelligence Centre (Manifest, Revenue, Vessel, Ports, Compliance, Ownership, Evidence, Alerts, Memory, Cargo, Administration):
- On mount, push its current entity/case into Mission Context via `setMissionSlice`.
- Set `useCopilotStore.setContext({ kind, label, detail })` so the Context Bar reflects the module.
- Ensure the `instance` prop (`CopilotInstanceKey`) flows into the launcher; the launcher passes it as `moduleHint` to `orchestrate()`.

### 6. Real-time sync
Use a Zustand `subscribe` bridge + a lightweight `BroadcastChannel("copilot-sync")` so multiple open tabs / split-screen embeds see the same briefings and mission state instantly. Keeps working under `devBypass`.

### 7. Backend (light touch, non-blocking)
New migration for `mission_snapshots` (investigation_id PK, jsonb payload, updated_at, officer_id) with RLS = officer/above sees own agency's rows, GRANTs to `authenticated` + `service_role`. Server function `saveMissionSnapshot` (auth-required) called on debounce; on `devBypass`, snapshots stay client-side only.

### 8. Cleanup / deprecation
- `AskCopilotDialog` becomes a thin wrapper that mounts `CopilotWorkspace` in a `Dialog`.
- Remove now-dead `askCopilot` / `mock-intelligence` code paths after surfaces migrate (keep the file for one release with a deprecation comment to avoid regressions).
- Add a unit test asserting all 13 instance keys map to a scheduler bias.

## Files touched (approx.)

- **New:** `src/stores/mission-context.store.ts`, `src/hooks/use-copilot-session.ts`, `supabase/migrations/*_mission_snapshots.sql`, `src/lib/mission.functions.ts`
- **Modified:** `src/services/orchestration/{orchestrator,intent-classifier,scheduler,evidence-fusion,reasoning-engine,types}.ts`, `src/components/copilot/CopilotWorkspace.tsx`, `src/routes/copilot.tsx`, `src/components/ai/ask-copilot-dialog.tsx`, `src/components/ai/global-copilot-launcher.tsx`, `src/components/intel-centre/centre-copilot.tsx`, each `src/features/*/…` centre (context push on mount)
- **Deprecated:** `src/lib/ai/mock-intelligence.ts`, legacy dialog internals

## Out of scope for this pass

- Cross-user real-time (multi-officer collaboration on one mission) — will follow once single-user unification lands.
- Full replacement of the reasoning model — this pass wires mission grounding into the existing engine, not a model swap.

Approve and I'll implement in the order above (Mission Context store → engine wiring → surface unification → module wiring → backend snapshot → cleanup).
