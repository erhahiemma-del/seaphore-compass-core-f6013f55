## Goal

Reshape every Copilot response into an **Executive Maritime Intelligence Brief**: answer-first prose, KPI cards, key facts, relationships, timeline, risks, insights, recommendations, and collapsed supporting evidence. No UUIDs, timestamps, JSON, or raw source dumps in the default view.

This is a **presentation-layer** change. The existing pipeline (OIE → IBE → Response Contract → AdaptiveBriefing data) already produces all the inputs we need — we're rewriting how it renders, not how it's computed.

## Approach

Add a new top-level renderer that sits **above** `AdaptiveBriefing` and `IntelligenceProjectionPanel`, synthesising both into an executive brief. Keep the existing components mounted but hidden behind a "Show analyst detail" toggle so nothing regresses and Administrator/analyst modes still have access to the full projection.

### 1. New component: `ExecutiveBriefing`

`src/components/copilot/briefing/ExecutiveBriefing.tsx` — the single source of truth for the redesigned response. Sections in order:

1. **Executive Summary** — 2–4 sentence paragraph. Derived from `briefing.sections.executive` + officer decision header text, rewritten to lead with the direct answer and end with confidence + operational assessment. Falls back to a deterministic template when the model text is empty.
2. **Confidence Panel** — small strip under the summary, 5 mini-bars: Data Completeness, Relationship Confidence, Evidence Quality, Recency, Operational Confidence. Values pulled from `confidence_matrix` + `ibe` propagation.
3. **Intelligence Assessment (KPI cards)** — Overall Risk, Confidence, Operational Status, Compliance, Watchlist, Active Investigation, Revenue Exposure, Last Activity. Status colours: green / amber / red mapped from existing risk + confidence bands.
4. **Key Facts** — humanised label/value pairs derived from the primary entity (vessel/company). Whitelist of business-friendly fields only; UUIDs / `created_at` / FK ids are filtered.
5. **Relationship Intelligence** — condensed graph. Reuse `OwnershipNetworkGraph` when a vessel/company is resolved, else render a compact node-chip cascade (Vessel → Agent → Operator → Parent → Directors → BOs). Clicking a node calls `handleSubmit("Who/what is <label>?")`.
6. **Timeline Intelligence** — vertical timeline of operational events (arrival, departure, manifest, inspection, revenue, detention, ownership change, compliance action) sourced from the ranked evidence; lucide icons per event type.
7. **Risk & Compliance Analysis** — checklist grid; green "No significant risks identified" card when nothing fires.
8. **AI Intelligence Insights** — analyst-style observations pulled from `assessment.observedPatterns` + IBE proactive nudges, rephrased as sentences (no "pattern object" or ids visible).
9. **Recommendations** — from officer-decision recommendation + IBE recommended-next-action, rendered as action rows.
10. **Supporting Evidence (collapsed)** — single accordion with sub-accordions per source category (Manifest, Company Registration, Vessel Registry, Port, AIS, Customs, Revenue, Inspection, Regulatory, Related Intel). Each item shows headline + source + grade chip; UUIDs/hashes only visible inside a nested "Raw" disclosure gated by Administrator role.

Visual system: white bg, `rounded-2xl` (16px) cards, subtle shadow, primary accent `#2563EB` (map to `--primary` variant), 8px spacing grid, `max-w-[1280px]`, lucide icons throughout, Framer-motion-free CSS transitions for expand/collapse.

### 2. New helpers

- `src/lib/copilot/executive-brief/synthesize.ts` — pure functions:
  - `buildExecutiveSummary(briefing, ibe, humanResponse)` → string
  - `buildConfidencePanel(matrix, ibe)` → 5 scored dimensions
  - `buildKpiCards(briefing, ibe)` → typed KPI list w/ status colour
  - `buildKeyFacts(entities, briefing)` → label/value pairs, whitelist-filtered
  - `buildTimelineEvents(evidence)` → sorted event list w/ icon key
  - `buildRiskChecklist(briefing, ibe)` → fired/not-fired items
  - `buildInsights(assessment, ibe)` → sentence-form observations
  - `buildRecommendations(briefing, ibe)` → action list
  - `groupEvidenceForDisclosure(evidence)` → sourceCategory → items[]
- `src/lib/copilot/executive-brief/sanitize.ts` — strips UUIDs, ISO timestamps in raw form, `created_at`/`updated_at`/`*_id` keys, and JSON-looking payloads from any rendered string.

Unit tests: `tests/unit/executive-brief.test.ts` covering summary fallback, sanitiser, KPI colour thresholds, and timeline sort.

### 3. Wire into `/copilot`

In `src/routes/copilot.tsx`:

- Import `ExecutiveBriefing`.
- Replace the current `{briefing ? (...) : null}` block so that by default it renders `ExecutiveBriefing` only.
- Add a small "Show analyst detail" toggle (persisted via `useState`, default off) that reveals the existing `IntelligenceProjectionPanel` + `AdaptiveBriefing` + `EvidenceLineageView` beneath. Administrator role additionally gets a "Raw data" toggle inside supporting-evidence items.
- Follow-up chip strip and composer stay unchanged.

### 4. Compliance guardrails preserved

- Footer "Evidence first. Explainable always. Officer decides." unchanged.
- Every KPI, insight, and recommendation still carries a confidence chip via existing `ExplainableConfidenceChip`.
- Officer decision affordances (Agree / Modify / Dismiss) remain — they move into the Recommendations section rather than disappearing.
- Register the new `executive-brief` artifact in `src/lib/projection-contract/registry.ts` as `PROJECTED` so Backend–Frontend Symmetry stays green; update the contract test snapshot.

## Out of scope

- No changes to OIE / IBE / ICE / IAL / reasoning engine.
- No new backend tables or server functions.
- No changes to Mission Control, Investigate, Decide, Share, or other routes.
- Existing `AdaptiveBriefing` stays intact for analyst detail mode and Storybook.

## Verification

- `tsgo` typecheck clean.
- New unit tests pass.
- Manual: run the same "Who is behind the agent for MV Ocean Pearl?" query — first sentence is a direct answer, no UUIDs/timestamps visible, evidence collapsed by default, "Show analyst detail" reveals the current UI unchanged.
