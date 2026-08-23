# Seaphore Maritime Intelligence Map — Implementation Plan

**Awaiting approval. No implementation has begun.**

Companion to [`SEAPHORE_MAP_AUDIT.md`](./SEAPHORE_MAP_AUDIT.md).

---

## Governing decision

**This is not a rewrite.** `MaritimeCommand`, `MapCanvas`,
`MapLibreRenderer`, `LayerRegistry`, SGS and `ReplayPlayer` are kept and
extended. Two things change shape rather than widen — selection and
operating mode — and both are explained below.

Sequencing follows **data availability**, not the brief's phase numbers.
Building surfaces for sources that are months from connection produces UI
that cannot be tested against anything real.

---

## Two architectural changes

### 1. `MapSelection` replaces the vessel-only pair

Today:

```ts
selectedEntityId: string | null;
selectedEntityImo: string | null;   // assumes vessel
```

Proposed — a discriminated union over the brief's thirteen object types:

```ts
type MapSelection =
  | { kind: "vessel"; id: string; imo: string | null }
  | { kind: "port"; id: string }
  | { kind: "terminal"; id: string; portId: string }
  | { kind: "sar-detection"; id: string; sceneId: string }
  | { kind: "ais-gap"; id: string; mmsi: string }
  | { kind: "incident"; id: string; source: string }
  | { kind: "investigation"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "geofence"; id: string }
  | null;
```

`selectedEntityImo` is retained as a derived getter so existing readers
keep working. This is the only breaking-shaped change proposed, and it is
unavoidable: the brief requires thirteen selectable types and the current
field names encode one.

### 2. `OperatingMode` is a new field, not a renamed `ViewMode`

`ViewMode` means 2D/3D and keeps that meaning. The brief's modes become:

```ts
type OperatingMode =
  | "NATIONAL" | "PORT" | "VESSEL"
  | "INCIDENT" | "INVESTIGATION" | "HISTORY" | "REPLAY";
```

Reusing `ViewMode` would recreate exactly the vocabulary drift G6.0
eliminated in the orchestration layer.

---

## Milestones

Each is independently shippable, tested, and committed separately.

### M1 — Shell completion *(no new data required)*

Right-hand **Intelligence Drawer** and bottom **Timeline bar**, both
collapsible and resizable. Drawer renders `IntelligenceFinding`s through
the existing `FindingEvidenceViewer` and `SarDetectionCard` — no new
detail component.

*Value: makes existing engines visible. Testable today against GFW.*

### M2 — Selection model

`MapSelection` + `OperatingMode` in SGS, URL-serialisable. Renderer emits
typed selection events. Drawer switches on `kind`.

*Unblocks every subsequent milestone.*

### M3 — Layer group widening

`LayerGroup` widened from 3 to the brief's 9. Existing layers keep ids and
groups; new groups added alongside. Same widening pattern as `Workspace`
in G6.0.

### M4 — National operating picture

KPI strip over `fleet-summary.ts` + `computeIntelligenceMetrics`. **Every
metric carries source and freshness**, using `LIVE | RECENT | HISTORICAL |
ACQUIRED | PENDING | UNAVAILABLE | DEMO`.

*Testable today: GFW is live; every other tile reads `PENDING`.*

### M5 — Vessel experience

Tabs over the existing card: Overview · Track · History · Port Calls ·
Risk · Cargo · Ownership · Sanctions · Evidence.

**Tabs whose provider is unconnected render the blocker, not an empty
panel.** Only fields actually supported by connected providers appear —
GFW carries no course, speed or IMO, and the card must say so.

### M6 — Copilot ↔ map context *(the largest gap)*

Bidirectional, over the existing orchestration layer:

```
MapSelection ──▶ QueryUnderstanding.primaryEntity   (map informs Copilot)
QueryUnderstanding ──▶ MapState                     (Copilot transforms map)
```

`WorkspacePlan` already computes panels per intent; this adds a
`MapPlan` — operating mode, layers, viewport, filters — derived from the
same single understanding. **No second classifier.**

*Delivers "show tankers near Lagos" and "why is this vessel here?".*

### M7 — Timeline and replay UI

Wire `ReplayPlayer` to the bottom bar. Extend `ReplaySpeed` to
`1 | 5 | 20 | 100`. **Only offer ranges the source actually supports** —
GFW events lag by days, so a "last 24 hours" control over GFW would be
empty and misleading.

### M8 — Map tools

Measure, bearing, area, polygon, radius, geofence. Requires new tables
(`geofences`, `saved_areas`) with RLS.

### M9 — Search

Universal search over vessel/IMO/MMSI/port/coordinates/zone/investigation.
Natural-language queries route through M6.

### M10 — Multi-select and investigation

Compare, track together, create investigation. Uses the **existing**
evidence system — no second evidence store.

### M11 — Basemap abstraction

`BasemapProvider` interface; OSM default. **Google only via officially
licensed APIs**, never scraped, and never presented as vessel data.
Imagery acquisition date must be distinguishable from vessel position
time.

### M12 — Performance

Clustering, viewport loading, spatial filtering. Deferred deliberately:
GFW returns tens to low hundreds of vessels, and optimising for thousands
before we have thousands is speculative.

### M13 — Port experience *(gated on NPA)*

Port mode over the port-call lifecycle. **Cannot be meaningfully built or
tested until NPA access exists** — until then it renders
`NPA DATA PENDING ACCESS`.

### M14 — SAR / environment rendering *(gated)*

Gated on a ship detector and NOSDRA licence respectively.

---

## Sequencing rationale

M1–M12 are testable against **GFW plus the existing engines**. M13–M14
are gated on external unlocks and are placed last deliberately — building
them now yields untestable UI.

If NPA or NOSDRA access arrives mid-programme, M13/M14 move up. That is a
scheduling decision, not an architectural one.

---

## Tests

Beyond per-milestone coverage, five assertions the brief calls critical.
Each must be **structural**, not wording:

| Guarantee | Enforcement |
| --------- | ----------- |
| STALE cannot render as LIVE | Freshness recomputed at render from `ageMs` |
| DEMO cannot render as LIVE | `provenance.kind: "fixture"` propagated to every surface |
| Missing cannot become fabricated | Absent source → stated blocker |
| AIS absence cannot become DARK CONTACT | `supportsUnmatchedConclusion()` — already enforced |
| SAR detection cannot become identity | `SarDetection` has no identity field — already enforced |

The last two already hold. The first three need map-level tests.

---

## What I recommend

**Approve M1–M6.** They complete the shell, the selection model, the
national picture, the vessel experience and the Copilot integration —
the six that make what already exists usable, all testable against live
GFW data.

Hold M7–M14 for a second approval once M1–M6 land. That keeps the
increment reviewable and avoids committing to fourteen milestones of UI
before the first six are validated against real use.

**One thing to decide before M2:** `MapSelection` changes a public field
shape. I would rather change it once, now, than build five milestones on
`selectedEntityImo` and migrate later.
