# Mission Control — Composition Contract

Engineering guardrail for anyone changing this surface, and the handoff
brief for a visual enhancement pass.

Enforced by `tests/unit/mission-control-contract.test.ts`. That file is
the executable half of this document; if the two ever disagree, the test
is right and this needs updating.

---

## 1. What is actually here

Every file in `src/features/mission-control/`, verified against the code
rather than a design.

| File                             | Owns                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MissionControl.tsx`             | Page composition and reading order. Also holds `Ribbon` and the panel components.                                |
| `modes.ts`                       | The eight lenses as pure configuration — KPI order, panel order, map layer recommendations, recommended actions. |
| `useMissionMode.ts`              | The active lens (the layer's only store) and `contextualEmphasis`.                                               |
| `MissionModeSelector.tsx`        | The lens control. Presentation only.                                                                             |
| `OperationalOrientation.tsx`     | Lens purpose, focus subject, coverage summary.                                                                   |
| `recommended-action.ts`          | Pure derivation of the single next action.                                                                       |
| `RecommendedNextActionPanel.tsx` | Renders that decision. Makes none.                                                                               |
| `hierarchy.ts`                   | KPI tiering and supporting-panel selection rules. Pure.                                                          |
| `SupportingIntelligence.tsx`     | Progressive disclosure switcher over four existing panels.                                                       |
| `map-recommendation.ts`          | Advisory layer comparison. Pure, holds no state.                                                                 |
| `MapRecommendationNotice.tsx`    | The only place `setActiveLayers` is called.                                                                      |
| `MyWorkspaceSummary.tsx`         | Read-only aggregation over three existing stores.                                                                |
| `useCopilotContextBinding.ts`    | Feeds route/mode/focus into the existing Copilot context.                                                        |

`CommandCenter.tsx` shares this directory and is **not** part of Mission
Control. It is a separate route and is excluded from the contract tests.

## 2. Reading order

Conceptual hierarchy, not a DOM requirement — the map and priority
intelligence sit side by side, and that is fine.

```
Institutional context   (TopBar — role, workspace, alerts)
        ↓
Mission orientation     (lens purpose · focus · coverage)
        ↓
Mission mode            (the lens control)
        ↓
Recommended next action (one thing, derived)
        ↓
Primary operational surface   ── map ── priority intelligence
        ↓
Tiered KPI intelligence (lead → secondary → background)
        ↓
Supporting intelligence (one panel, three tabs)
        ↓
My workspace
```

The order encodes the questions an officer asks: _where am I → from what
perspective → what needs doing → what is happening → what do the numbers
say → what else → what do I own_.

## 3. Non-negotiable behaviour

### Modes reorder; they never conceal

A mode may reorder KPIs and panels, change emphasis, change recommended
actions and recommend map layers. It may **not** hide a panel, carry a
value, or write to officer state. Every mode carries the full panel list
so a lens cannot drop the compliance panel and let a watchlist match go
unseen.

### Data honesty

No fabricated vessel count, revenue figure, confidence percentage, risk
score, alert, activity figure or provider connection. Unavailable
intelligence uses the existing `KpiCoverage` state model —
`AWAITING_CREDENTIALS`, `PARTIAL`, `NO_EVIDENCE`, `PROVIDER_OFFLINE` —
and keeps its path back to the provider that explains it.

The reference design for this surface shows populated counters. In this
deployment no AIS provider is connected, so most of those are
`AWAITING_CREDENTIALS`. **A visual pass may not resolve that tension by
inventing the number.**

### KPI tiering is prioritisation, not filtering

One lead, two secondary, the rest background — all six rendered, always.
`KpiCoverageCard` is shared with other surfaces: wrap it, do not replace
or restyle it globally without a separate audit.

### Progressive disclosure

Four supporting panels, one visible, all reachable. The lens picks the
default; the officer's choice wins and is remembered per lens. Do not
flatten this back into a stack.

### Map precedence

```
system default → mode recommendation → officer choice (authoritative)
```

`setActiveLayers` is called from exactly one file, behind one explicit
button. Applying is additive and never removes a chosen layer. Switching
lens never writes layers.

### Focus × Mode independence

Two stores, two questions. Mode is _how the officer is reading_; focus is
_what they are examining_. Combining them is a reader's job
(`contextualEmphasis`), not a merge.

### Copilot truthfulness

Context may report route, mode, focus and wired state. It may not imply
the assistant has reached data, completed analysis, or connected to a
system it has not.

## 4. Visual enhancement boundary

### Safe to change

Layout · spacing · typography · visual weight · component proportions ·
card and surface treatment · borders · iconography · transitions ·
hover and focus states · responsive behaviour · information density.

Use the existing semantic tokens (`--state-verified`, `--state-attention`,
`--state-critical`, `--state-active`, `--state-neutral`,
`--state-authority`). Colour is semantic, never decorative. Do not
introduce a palette — the token layer already carries the meaning.

### Preserve

Routes · stores · the mode engine · `KpiCoverage` and
`getIntelligenceCoverage` · `KpiCoverageCard` · the source availability
model · `focus-subject.store` · officer map precedence · supporting
panel selection behaviour · workspace stores · the Copilot context
contract · every real and unavailable data state.

Keep the `data-testid` landmarks. They are the only runtime handle on
whether the composition still works: `operational-orientation`,
`recommended-next-action`, `mission-mode-selector`, `mission-kpi-ribbon`,
`supporting-intelligence`, `my-workspace-summary`, `map-recommendation`.
Restyle them freely; do not delete them.

### Do not

Rebuild Mission Control · add a parallel state system · add fabricated
metrics or placeholder intelligence · create duplicate routes · write map
layers outside the explicit apply action · replace dynamic modes with
static tabs · remove progressive disclosure · make AI capability claims
the application cannot support.

## 5. Visual direction

Authoritative, calm, legible, intelligence-led, operational,
institutional. Dense without clutter, and appropriate for national
maritime administration.

White and off-white ground, deep navy structure, slate typography,
restrained surfaces, subtle borders.

Avoid generic SaaS dashboards, excessive cards, decorative gradients,
fake charts and visual noise.

## 6. How to check your work

```
bun run vitest run tests/unit/mission-control-contract.test.ts
bun run vitest run tests/unit/mission-modes.test.ts
bun run vitest run tests/unit/mission-hierarchy.test.ts
bun run vitest run tests/unit/mission-composition.test.ts
bun run typecheck && bun run test:unit && bun run build
```

A failure in the contract test is not a test to update. It is a
behavioural regression the visual pass introduced.
