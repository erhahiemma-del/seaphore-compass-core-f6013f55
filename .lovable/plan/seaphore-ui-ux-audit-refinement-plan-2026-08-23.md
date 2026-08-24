# Seaphore UI/UX Audit & Refinement Plan

Presentation-layer only. No changes to data ingestion, intelligence orchestration, truth/confidence/freshness models, provider adapters, validation, auth or routing. No mock data, no fabricated "live" claims.

One factual note before the plan: the geospatial layer today is a provider abstraction (`src/lib/maps/` with mock/Mapbox/Google providers) plus a stylised SVG surface (`gulf-of-guinea-map.tsx`). There is no MapLibre package installed. The plan refines the _shell_ around that surface (controls, layer UI, popovers, zoom behaviour) and leaves the provider lifecycle and selection contract untouched, so a real provider can drop in without UI rework.

## 1. Key UI problems

1. **Navigation is an index, not an operating model.** 30 destinations across 5 sidebar groups, each with a subtitle. The officer scans a directory instead of following a task.
2. **Screens are dashboards of equal-weight cards.** Mission Control assembles ~10 panels (KPI ribbon, map, feed, priorities, ports, compliance, briefings, cargo, readiness, coverage) with no dominant focus. Nothing recedes; everything competes.
3. **No selection-driven focus.** Clicking a vessel fires a callback but the surrounding UI does not adapt. There is no shared "current subject" (vessel / port / cargo / company / risk event) that the workspace reorganises around.
4. **Chrome noise.** TopBar carries a static "All systems operational" string, a 30-second clock, a theme toggle, a bell with a permanently-red dot, and a full email address — four of these are decoration or unverified.
5. **Hardcoded colour outside the token system.** `#C0392B`, `#1E6B3A`, `#0D2A4A`, `#123a63` and similar literals appear in the map, TopBar and elsewhere; the token JSON says something different (`--red: #DC2626`). Two competing palettes.
6. **Badge inflation.** Confidence chips, risk pills, state chips, LIVE/DELAYED pills, centre-state chips and filter chips share one visual register, so nothing reads as important.
7. **Typography carries no hierarchy.** Body-weight text at 10–13px in many densities; headings are only marginally larger. Premium products earn calm through _scale contrast_, not more chrome.
8. **Map controls are toy-grade.** Four stacked 24px icon buttons on a translucent black square, additive zoom (`z + 0.25`), no wheel/trackpad zoom, no cursor anchoring, `Layers` is a no-op, no popover on marker click.
9. **Dark/light modes fight.** `AppShell` mutates `document.documentElement` per section while a persisted user theme store also exists — the mode can flip out from under the user.
10. **Depth is flat.** A single `shadow-card` at 4% opacity for every surface, so overlays, popovers and panels sit on the same visual plane.

## 2. What to remove or simplify

**Remove**

- Static "All systems operational" (asserts health without a source), the always-red bell dot, and the seconds-less clock from the TopBar.
- The always-visible `LIVE` pill inside the map; freshness belongs to one honest status element, not per-panel.
- Nav subtitles in the expanded sidebar (keep them as tooltips).
- The `Layers` button until it opens a real layer panel.

**Collapse**

- 5 nav groups → 3: **Operate** (Mission Control, Copilot, Detect), **Investigate** (Investigate, Decide, Share, Memory), **Reference** (Centres + System, in a searchable overflow). Same 30 routes, same URLs — grouping and disclosure only.
- Mission Control: map + priorities become the primary surface; ports, compliance, briefings, cargo, readiness and coverage move into a right-hand context rail and collapsed sections.
- KPI ribbon: 6 tiles → 4 primary + "more" disclosure.

**Make contextual**

- Confidence chips: always present, but full explainer only on hover/focus (rule stays: every number wears a chip).
- Filters, legends and the confidence legend: reveal on demand from a single control, not permanently docked.

**Keep untouched**

- Footer line, confidence-chip-per-number rule, "system recommends, officer decides" copy, all projection-contract registrations.

## 3. Interaction improvements

- **Subject focus.** A presentation-only `useFocusSubject()` store holds `{ kind, id }` set by existing selection callbacks (`onVesselClick`, port/cargo/company clicks). Related panels raise contrast; unrelated ones drop to a `.is-receded` state (reduced opacity/saturation, non-interactive until hovered). No data flow changes.
- **Focus rail.** Selecting a subject slides in a right-hand rail: identity, confidence, freshness, evidence links, officer actions — sourced entirely from existing projections.
- **Map zoom done properly.** Continuous exponential zoom scaled by wheel delta with `deltaMode` normalisation, cursor-anchored pan offset, non-passive native wheel listener, trackpad pinch (`ctrlKey`) handled, `+`/`−` anchored at viewport centre. Clamp 0.75–8.
- **Marker popover.** Click a marker → compact popover (name, IMO, risk, confidence chip, freshness, "Open in workspace"), not just a title attribute.
- **Layer panel.** A real popover listing available layers with checkboxes, driven by whatever the active map provider reports; disabled with an honest reason when a provider does not supply a layer.
- **Command palette.** `⌘K` over existing routes and the existing search entry point, so the sidebar stops being the only way to reach 30 destinations.
- **One theme authority.** `AppShell` sets a section mode via a scoped attribute; the persisted user preference owns `<html>`. No more cross-mutation.

## 4. Proposed component / workspace hierarchy

```text
AppShell
├── RailNav            3 groups, icon-first, hover-expand, ⌘K entry
├── WorkspaceHeader    subject breadcrumb · one honest status element · officer
├── WorkspaceBody
│   ├── PrimarySurface   map / graph / case / list  (owns the screen)
│   ├── ContextRail      focus subject → identity, evidence, actions (collapsible)
│   └── DetailSheet      drill-down over the surface, never a route change
└── Footer             immutable line
```

Primitives to add (presentation only): `SurfaceShell`, `ContextRail`, `FocusSubjectProvider`, `Recede`, `MapLayerPanel`, `MapMarkerPopover`, `MetricLine` (number + chip + freshness in one calm row), `SectionDisclosure`.

## 5. Motion strategy

Calm, short, purposeful — motion signals state change, never decorates.

- Tokens: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`; durations 120ms (hover/press), 200ms (panel/rail), 320ms (surface transition).
- Rail and sheet: transform + opacity only, no layout thrash.
- Recede/focus: 200ms opacity + saturation cross-fade.
- Map: transform-based zoom easing, marker hover ring at 120ms; no bouncing, no infinite pulses except one honest freshness indicator.
- Every animation respects `prefers-reduced-motion` via the existing `use-reduced-motion` hook.

## 6. Premium light design system

- Base: near-white background with a faint cool cast, true-white surfaces, hairline borders at ~8% ink.
- Accent: restrained deep-sea teal for action/focus; navy for structure; semantic colours reserved _only_ for risk and confidence.
- Depth: a 3-step elevation scale (surface / raised / overlay) replacing the single card shadow.
- Type: heading font at genuine scale contrast (28/22/18), body at 14/13, tabular mono for every metric.
- Badges: two registers only — _confidence/risk_ (semantic, filled) and _metadata_ (neutral, outline).
- All literal hex values in components migrate to tokens defined in `tokens.json` + `styles.css`. Token values become the single palette.

## 7. Prioritized implementation plan

| Phase | Scope                                                                                                             | Outcome                       |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| P1    | Token + depth + typography pass; purge hardcoded hex from presentation components; single theme authority         | Visual foundation is coherent |
| P2    | Shell rework: RailNav (3 groups), WorkspaceHeader cleanup, ⌘K palette, footer preserved                           | Chrome stops competing        |
| P3    | FocusSubject store + ContextRail + Recede; wire existing selection callbacks                                      | Adaptive workspace            |
| P4    | Map refinement: proper wheel/pinch zoom with cursor anchoring, control redesign, marker popover, real layer panel | Map feels professional        |
| P5    | Mission Control recomposition: primary surface + context rail + disclosures; badge de-escalation                  | Less dashboard, more OS       |
| P6    | Motion tokens applied across rail/sheet/map; reduced-motion verified; visual regression pass on key routes        | Calm futuristic feel          |

Each phase ships independently and leaves architecture, routes and contracts unchanged.

## Technical notes

- New state is a small Zustand store (`src/stores/focus-subject.store.ts`) holding a subject reference only — no fetching, no derived intelligence.
- Map changes are contained to `gulf-of-guinea-map.tsx` and new sibling components; `src/lib/maps/*` provider contracts and the selection lifecycle are not edited.
- Projection-contract registry entries are added for any new officer-facing projection (Backend–Frontend Symmetry rule), and existing entries are left intact.
- No new packages expected beyond what is already installed.
