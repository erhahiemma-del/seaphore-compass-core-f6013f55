# G6.0 — Intelligence Operating Layer

**Seaphore · orchestration engine, extended**

G6.0 did not add an orchestration engine. The repository already had a
mature one, and this sprint absorbed the 22-intent understanding model
into it so there is exactly one intent classifier, one context manager,
one workspace planner, one scheduler, one orchestrator and one briefing
pipeline.

---

## Pipeline

```
Officer Question
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ understanding/                                          │
│   intent.ts   22 intents, deterministic, first-match    │
│   entity.ts   extraction only — never a lookup          │
│   scope.ts    scope + CONTEXT POLICY                    │
│   time.ts     named period, or the intent's default     │
│   planner.ts  datasets + risk modules + what's missing  │
│   understand.ts ── composes the above ──▶ QueryUnderstanding
└─────────────────────────────────────────────────────────┘
      │  one authoritative reading
      ▼
┌─────────────────────────────────────────────────────────┐
│ intent-classifier.ts — PROJECTS, never re-classifies    │
│   intent        → mode, capabilities                    │
│   entities      → legacy IAL tag form                   │
│   workspaceMode → workspace                             │
└─────────────────────────────────────────────────────────┘
      │ Intent  (legacy shape + .understanding)
      ▼
  MissionContext ──▶ Context Policy ──▶ Workspace Planner
      │                                        │
      ▼                                        ▼
  Scheduler ──▶ IAL ──▶ Reasoning        WorkspacePlan
      │                                  (panels, collapsed,
      ▼                                   transparency)
  IntelligenceFindings
      │
      ▼
  Executive Brief ──▶ IPEF ──▶ Officer Decision
```

Every arrow points forward. Conversation is the last stage and reads the
understanding; it never runs ahead of it.

---

## Why there is no second classifier

`intent-classifier.ts` calls `understand()` once and derives `mode`,
`capabilities`, `entities` and `workspace` from the result. It does not
pattern-match the query itself.

That is the whole anti-drift mechanism: two classifiers over the same text
can disagree, and a projection cannot. `Intent` keeps every field it had
and gains `understanding` alongside, so existing consumers are untouched.

---

## Unified intent mapping

| Officer intent (22)          | Mode          | Workspace             | Primary capability        |
| ---------------------------- | ------------- | --------------------- | ------------------------- |
| `fleet-intelligence`         | lookup        | fleet-overview        | PATTERN_DETECTION         |
| `vessel-investigation`       | investigation | investigation         | PATTERN_DETECTION         |
| `manifest-intelligence`      | assessment    | manifest-intelligence | MANIFEST_CORRELATION      |
| `cargo-intelligence`         | assessment    | cargo-intelligence    | MANIFEST_CORRELATION      |
| `container-intelligence`     | lookup        | manifest-intelligence | MANIFEST_CORRELATION      |
| `ownership-intelligence`     | assessment    | ownership             | OWNERSHIP_ANALYSIS        |
| `company-intelligence`       | investigation | company-intelligence  | OWNERSHIP_ANALYSIS        |
| `compliance-intelligence`    | assessment    | compliance            | COMPLIANCE_ASSESSMENT     |
| `revenue-intelligence`       | assessment    | revenue               | REVENUE_LEAKAGE_DETECTION |
| `port-intelligence`          | lookup        | port-operations       | PATTERN_DETECTION         |
| `voyage-intelligence`        | lookup        | voyage                | PATTERN_DETECTION         |
| `risk-assessment`            | investigation | investigation         | RISK_SCORING              |
| `operational-recommendation` | assessment    | decision-support      | RECOMMENDATION_ENGINE     |
| `strategic-summary`          | assessment    | executive-briefing    | PATTERN_DETECTION         |
| `executive-brief`            | assessment    | executive-briefing    | RISK_SCORING              |
| `pattern-detection`          | investigation | pattern-analysis      | PATTERN_DETECTION         |
| `trend-analysis`             | forecast      | pattern-analysis      | PATTERN_DETECTION         |
| `historical-replay`          | forecast      | timeline              | PATTERN_DETECTION         |
| `comparison`                 | assessment    | pattern-analysis      | PATTERN_DETECTION         |
| `natural-language-search`    | lookup        | evidence-review       | EVIDENCE_SEARCH           |
| `officer-notes`              | lookup        | evidence-review       | EVIDENCE_SEARCH           |
| `mission-planning`           | investigation | decision-support      | RECOMMENDATION_ENGINE     |
| `unknown`                    | lookup        | evidence-review       | EVIDENCE_SEARCH           |

A question may name an operation **and** a domain — "forecast revenue
leakage" is a forecast whose subject is revenue. The primary intent
carries the operation; the runners-up carry the domain and still reach the
capability list, so the scheduler does not chase the wrong specialist.

---

## MissionContext lifecycle

```
        openMission(A)          openMission(B)         close
  null ───────────────▶ A ────────────────────▶ B ──────────▶ null
   ▲                                                            │
   └────────────────────────────────────────────────────────────┘

  null is the NORMAL state, not an error state.
```

Opening **replaces**; it never stacks. A second subject means the officer
moved on, and keeping the first is the contamination this removed.

Before G6.0 the console booted with `useState("inv-ocean-pearl")` and four
render paths fell back to `"MV Ocean Pearl"`. There was no such state as
"no investigation", so every question was asked against a subject and an
officer looking at the whole fleet was silently looking at one vessel.

---

## Context policy — the contamination gate

`MissionContext` is **offered** to a query, never imposed. `scope.ts`
decides:

| Query                              | Policy    | Effect                            |
| ---------------------------------- | --------- | --------------------------------- |
| "What vessels are live today?"     | `passive` | fleet-overview; ambient ignored   |
| "Show vessels owned by Maersk Ltd" | `passive` | company mode; ambient ignored     |
| "Investigate Ocean Pearl"          | `passive` | names its own subject             |
| "and her compliance history?"      | `inherit` | genuine follow-up; adopts subject |

A question that names its own subject, or asks about the whole fleet,
never sees the open investigation. Only a subject-less follow-up inherits
one.

---

## Workspace mapping

`Workspace` widened from six ids to eighteen. The original six keep their
exact ids, so persisted briefings and `intel_briefings.workspace` still
resolve. The twelve new ones share their ids with `WorkspaceMode`, so the
planner's output is a contract key directly — one vocabulary, no
translation layer.

Contracts now declare `panels`. That is what makes a workspace adaptive:

| Workspace              | Mounts                                                      | Notably collapses          |
| ---------------------- | ----------------------------------------------------------- | -------------------------- |
| `fleet-overview`       | summary · kpis · map · table · alerts                       | vessel-snapshot, ownership |
| `investigation`        | summary · vessel-snapshot · timeline · evidence · reasoning | fleet-map, revenue-chart   |
| `company-intelligence` | summary · ownership-graph · company-fleet · risk-card       | fleet-map, timeline        |
| `port-operations`      | summary · port-traffic · port-congestion · fleet-table      | ownership-graph            |
| `decision-support`     | summary · decision-queue · recommended-actions · top-alerts | fleet-map                  |

Capped at five panels by convention. An officer weighing more than five
things is not deciding in a minute, and a layout that needs more is
usually two questions wearing one coat.

---

## Executive Brief

Built **from `IntelligenceFinding`s**, never from raw connector output.
Every recommended action cites the finding that justifies it; an action
with no finding is not offered.

| Section             | Source                                    |
| ------------------- | ----------------------------------------- |
| Executive Summary   | counted from the finding set — not prose  |
| Key Findings        | `byPriority`, OSAE's ordering             |
| Evidence Summary    | `collectEvidence`, grouped by grade       |
| Confidence          | bands copied from `reasoning`             |
| Recommended Actions | one per prioritised finding               |
| Unknowns            | module blockers + dataset gaps + `gaps[]` |
| Counter Hypotheses  | copied from `reasoning`                   |
| Next Best Action    | the most urgent action, or `null`         |

Nothing is computed here. Priority is OSAE's, bands are `reasoning`'s,
grades are the OSINT engine's, freshness is recomputed from `ageMs`
because a cached band makes a stale finding look fresh.

`nextBestAction` is `null` when nothing warrants action. An officer told
to do something when nothing warrants it learns to ignore the field.

---

## What this sprint did **not** change

Deliberately preserved, because duplicating them was the failure mode:

- Scheduler, Capability Registry, Policy Engine, Briefing Builder — untouched
- `ice/planner.ts` — reused via `toIceIntent`, not reimplemented
- `reasoning`, OSAE, validation, freshness, fusion, IPEF, `VesselProvenance`
- `RiskModuleRegistry` and the finding model from G5.7A
- The original six workspace contracts

---

## Testing

| Suite                                 | Covers                                                              | Tests |
| ------------------------------------- | ------------------------------------------------------------------- | ----- |
| `orchestration-understanding.test.ts` | intent, entity, scope, time, planning                               | 46    |
| `orchestration-absorb.test.ts`        | unified intent, mission lifecycle, contamination, workspaces, brief | 33    |
| `orchestration.test.ts`               | pre-existing engine contracts — still green                         | 13    |

Run with a temporary vitest config; on Windows `bun run test:unit` cannot
start because `@lovable.dev/mcp-js` compares a forward-slash parent against
a `resolve()`d child using the native separator.
