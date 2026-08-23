# Seaphore Maritime Intelligence Map — Audit

**Audit only. No code written. Awaiting implementation approval.**

The headline: **a working operational map already exists.** Phase 8 is
largely an extension exercise, not a build. Roughly half the brief's
fourteen phases are partly or wholly implemented, and the two most
expensive pieces — the renderer and the replay engine — are done.

---

## 1. Current map implementation

| Asset                                          | Lines | State                                                                    |
| ---------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `routes/maritime.tsx`                          | 39    | Composition root. Registers GFW source, seeds enabled sources            |
| `features/maritime/MaritimeCommand.tsx`        | 271   | Full-screen shell: toolbar, canvas, layer panel, vessel card, status bar |
| `features/maritime/MapCanvas.tsx`              | 293   | Renderer lifecycle, SGS wiring, layer visibility                         |
| `features/maritime/LayerPanel.tsx`             | 264   | Grouped layer toggles with pending-source notes                          |
| `features/maritime/SourcesSection.tsx`         | 281   | Provider toggles, diagnostics                                            |
| `features/maritime/VesselIntelligenceCard.tsx` | 209   | Selection detail                                                         |

**Verdict: reuse entirely.** The shell already matches the brief's
top/left/centre layout. Missing are the right drawer and the bottom
timeline.

### Four competing map components — a real duplication problem

| Component                                       | Used by                         |
| ----------------------------------------------- | ------------------------------- |
| `features/maritime/MapCanvas`                   | `/maritime` — **canonical**     |
| `components/gulf-of-guinea-map.tsx` (272)       | `MissionControl`, `Compliance`  |
| `components/intel-centre/nigeria-map.tsx` (167) | intel centre                    |
| `components/intelligence/IntelMap.tsx` (165)    | `Ports`, `Vessel`, `Compliance` |

Four map renderings, one canonical engine. This is the single largest
consolidation opportunity in the codebase, and it must be handled
carefully — three of them are in live feature routes, so removing them is
a migration, not a deletion.

---

## 2. Layer registry — reuse, extend

`layer-registry.ts` (370 lines). Logical layers → render layer ids, with
`LayerGroup` (OPERATIONAL · INTELLIGENCE · ANALYSIS), `defaultVisible`,
`status`, `pendingReason`, `order`, and `resolveVisibility()` returning a
complete visibility map so the renderer never reasons about grouping.

**18 layers registered**, including three SAR layers added in the EO
sprint, all `pending-source` with real blockers.

The brief asks for nine groups (Vessels, Ports & Infrastructure, Maritime
Zones, Environment, Trade & Logistics, Risk & Intelligence, Satellite/EO,
Investigations, Government Sources). Current `LayerGroup` has three.
**This is a widening, not a rewrite** — the same pattern used to widen
`Workspace` from 6 to 18 in G6.0.

---

## 3. AIS / GFW services

| Asset                                        | State                                                   |
| -------------------------------------------- | ------------------------------------------------------- |
| `sources/global-fishing-watch-source.ts`     | **Live and working** — the only connected vessel source |
| `vessel-source.ts` (374)                     | Provider registry, `computeIntelligenceMetrics`         |
| `services/eo/ais-providers.ts`               | Datalastic + SeaVantage, `PENDING_CREDENTIALS`          |
| `services/eo/ais-history.ts`                 | Provider-agnostic history + declared coverage           |
| `adapters/ais/{datalastic,spire}.adapter.ts` | Honest stubs                                            |

**GFW is the only source that puts real vessels on the map today.**

---

## 4. Sentinel-1 / SAR services

`services/eo/` — complete and tested: `SarScene`, `ShipDetector` port,
`SarDetection`, correlation with declared coverage, the five-rung event
ladder, `SarDetectionCard`.

**Blockers unchanged:** no ship-detection service configured, no AIS
provider, Copernicus retrieves metadata only.

**Map integration status: layers registered, nothing rendered.** The
three SAR layers exist in the registry with blockers stated. No source
feeds them.

---

## 5. Government-data layers

`services/government/` — NPA adapter, snapshots, change detection, ETA
history, port-call lifecycle, source authority. **All `INTEGRATION_PENDING`.**

**No government layer is registered in the map layer registry.** Ports
exist as a map layer fed from static constants, not from NPA. Wiring NPA
port state into the map is unbuilt.

---

## 6. Copilot / map interaction

**This is the largest genuine gap.**

`grep` for `selectedEntityId` or map context across `services/orchestration`
and `lib/copilot` returns **nothing**. The Copilot does not know what is
selected on the map, and the map does not respond to Copilot output.

What exists to build on: the G6.0 orchestration layer — one intent
classifier, `MissionContext`, `WorkspacePlan`, and 22 intents including
`fleet-intelligence`, `port-intelligence`, `vessel-investigation`.

The brief's "contextual transformation" is `QueryUnderstanding` →
`MapState`. The understanding half exists; the map-state half does not.

---

## 7. Map state (SGS)

`shared-geospatial-service.ts` (382) + `store.ts` (110). Single source of
truth, `useSyncExternalStore` bindings, URL-serialisable.

`MapState` today: `viewMode` (**2D | 3D only**), center, zoom, pitch,
bearing, `selectedEntityId`, `selectedEntityImo`, `activeLayers`,
`layerOpacity`, `enabledSources`, `filters`, `timelinePosition`,
`timelinePlaying`, investigation area.

### Two findings

**A naming collision.** The brief's "operating modes" (NATIONAL, PORT,
VESSEL, INCIDENT, INVESTIGATION, HISTORY, REPLAY) are not `ViewMode`,
which means 2D/3D. Reusing the name would produce exactly the drift G6.0
eliminated. A distinct `OperatingMode` is needed.

**Selection is vessel-only.** `selectedEntityId` + `selectedEntityImo`
assumes vessels. The brief needs thirteen selectable object types. This
needs a discriminated `MapSelection`, and it is the one part of SGS that
must change shape rather than merely widen.

---

## 8. Evidence / provenance components

| Asset                              | Reuse                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| `FindingEvidenceViewer.tsx`        | Full finding render — three confidence vocabularies kept apart |
| `SarDetectionCard.tsx`             | Sensor, acquisition, age, candidates, provenance               |
| `services/intelligence/`           | `IntelligenceFinding`, registry, aggregator                    |
| `services/geospatial/freshness.ts` | Bands, recomputed at render                                    |
| `services/geospatial/fusion.ts`    | Cross-provider corroboration                                   |

**The drawer should render `IntelligenceFinding`s through the existing
viewers, not a new detail component.**

---

## 9. Supabase structures

Relevant: `ports`, `vessels`, `voyages`, `companies`, `cargo_items`,
`containers`, `manifests`, `evidence`, `entities`, `investigations`,
`signals`, `risk_scores`, `alerts`, `data_sources`, `data_source_health`.

**Absent:** `terminals`, `berths`, `port_calls`, `port_schedules`,
`geofences`, `saved_areas`. The first four were identified in the
government audit; the last two are new for map tools.

RLS and RBAC are in place and must be respected.

---

## 10. Replay

**Already built and unwired.** `replay.ts` (304) has `ReplayRecorder`,
`ReplayPlayer`, `ReplayState`, `ReplayStatus`, `ReplaySink`.
`ReplaySpeed` is `1 | 5 | 10`; the brief asks for 1×/5×/20×/100×.

`MapState` already carries `timelinePosition` and `timelinePlaying`.

**Phase 7 is mostly a UI exercise over an existing engine.**

---

## 11. Basemap

`BASEMAP_STYLE` with a Stadia Maps fallback, hardcoded in
`maplibre-renderer.ts`. Style failure degrades to a usable map rather
than a blank canvas — good behaviour, but there is **no basemap
abstraction**. The brief asks for a replaceable one (OSM, Mapbox, Google,
satellite, terrain).

---

## What can be reused — summary

| Brief phase            | Status                                        |
| ---------------------- | --------------------------------------------- |
| 1 Map shell            | **Built** — needs right drawer + bottom bar   |
| 2 Layer system         | **Built** — needs group widening              |
| 3 Object selection     | **Partial** — vessels only                    |
| 4 Vessel intelligence  | **Partial** — card exists, no tabs            |
| 5 Port intelligence    | **Not built** — engine ready, unwired         |
| 6 National picture     | **Partial** — `fleet-summary.ts` exists       |
| 7 History + replay     | **Engine built**, no UI                       |
| 8 Copilot/map          | **Not built** — the largest gap               |
| 9 SAR / environment    | **Engine built**, layers registered, no data  |
| 10 Risk / intelligence | **Engine built** — `IntelligenceFinding`      |
| 11 Investigation       | **Partial** — store + tables exist            |
| 12 3D / satellite      | **Not built** — no basemap abstraction        |
| 13 Performance         | **Partial** — MapLibre diffing; no clustering |
| 14 Hardening           | —                                             |

---

## Honest constraint

The map can render **one** live data source today: Global Fishing Watch.

Everything else — AIS providers, SAR detections, NPA port state, NOSDRA
incidents — is `PENDING_CREDENTIALS`, `INTEGRATION_PENDING`,
`LICENSE_REVIEW` or has no detector.

A map built to the full brief would be mostly empty panels with honest
"pending access" notices. That is the correct behaviour, and it should
shape sequencing: **build the surfaces that make GFW and the existing
engines legible first**, and add the pending sources as they connect.

Building all fourteen phases now would produce a large amount of UI
waiting for data that may be months away.
