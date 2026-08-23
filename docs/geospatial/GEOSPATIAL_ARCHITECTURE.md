# Geospatial Intelligence Architecture

**Seaphore · GIP G5.5.2 · canonical**

> **How to read this document.** Sections marked **IMPLEMENTED** describe code
> that exists in this repository today. Sections marked **SPECIFIED** describe
> the target architecture that is not yet built. Where the original GIP
> specification and this repository diverge, the divergence is stated
> explicitly — this document describes _this_ codebase, not an idealised one.

---

## The Fundamental Rule

Neither MapLibre nor Cesium knows anything. They are visualization clients. The
intelligence lives in the pipeline beneath them. **No map module queries
`ice_fused_intelligence`, `osint_evidence`, or `osint_raw` directly.**

Operational data reaches the map only through a `VesselSource` implementation,
which is expected to resolve through the Intelligence Orchestrator.

---

## Implemented layering

```
src/features/maritime/          React surfaces
  MaritimeCommand                 shell, toolbar, status bar
  MapCanvas                       renderer host + service wiring
  LayerPanel                      mission-grouped layer control
  VesselIntelligenceCard          selected-vessel intelligence
        │
src/services/geospatial/        domain
  SharedGeospatialService         canonical MapState + URL serialisation
  LayerRegistry                   logical layers → render layer ids
  MapEventBus                     typed interaction transport
  VesselUpdateEngine              incremental diffing
  vessel.ts                       identity, position, freshness, projection
  vessel-source.ts                data-entry contract
  store.ts                        React bindings + ephemeral session state
        │
  MapRenderer (interface)       ← injection seam
        │
  MapLibreRenderer                2D Operational View  (IMPLEMENTED)
  StubMapRenderer                 headless, for tests and SSR
  CesiumRenderer                  3D Terrain Perspective (SPECIFIED — G7)
```

**Everything above `MapRenderer` is engine-agnostic** and unit-testable without
a canvas, a WebGL context, or a map library.

---

## Divergences from the original GIP specification

These are deliberate and load-bearing. Do not "fix" them without a decision.

| GIP specification                                  | This repository                                       | Why                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/src/gip/…`                                       | `src/services/geospatial/` + `src/features/maritime/` | Matches the repo's domain-driven structure; `gip` is a conceptual namespace, not a folder                             |
| `orchestrator.listPriority({entityType:"VESSEL"})` | Not available                                         | The orchestrator here is a client-side UIP-store facade exposing `getUIP` / `getUIPBatch`                             |
| `uip_snapshots` + Supabase Realtime                | Not wired to the map                                  | No Supabase read path exists in the geospatial domain                                                                 |
| UIP carries vessel position                        | **It does not**                                       | The Canonical UIP exposes identity, fused evidence, provenance, freshness, and OSAE assessments — no positional field |
| `GeoJSONPipeline.getVesselGeoJSON()`               | `VesselSource` + `VesselUpdateEngine`                 | Same role, split into a data contract and a diffing engine so the map never rebuilds wholesale                        |

**Consequence:** there is no honest UIP → `Vessel` mapping to write yet.
Producing one would mean inventing a positional convention and calling it
infrastructure. The seam is defined; the adapter is not.

---

## Data flow — implemented

```
VesselSource.list()            (polling, TIMING.positionRefreshMs)
VesselSource.subscribe()       (push, where the source offers one)
        ↓
VesselUpdateEngine
  diffVessels(current, incoming) → { added, updated, removed, unchanged }
  applyFull()   full list  → forwards only the delta
  applyPatch()  one vessel → empty diff when nothing render-affecting changed
        ↓
MapRenderer.patchVessels(batch)
        ↓
MapLibre GeoJSONSource.updateData({ add, update, remove })
        ↓
GPU — only the touched features are re-uploaded
```

Interaction travels the opposite way and never short-circuits:

```
MapLibre event → MapEventBus → MapCanvas → SharedGeospatialService → subscribers
```

`MapLibreRenderer` holds no reference to React, SGS, or any consumer.

---

## State ownership

| State                                    | Owner                                 | Serialised to URL |
| ---------------------------------------- | ------------------------------------- | ----------------- |
| centre, zoom, pitch, bearing             | SGS                                   | yes               |
| active layers                            | SGS                                   | yes               |
| layer opacity                            | SGS                                   | yes (sparse)      |
| filters                                  | SGS                                   | no (planned)      |
| selection identity (`selectedEntityImo`) | SGS                                   | yes               |
| selected vessel _data_                   | update engine (looked up, not stored) | n/a               |
| renderer id, status, fps, vessel count   | `useMapSessionStore`                  | never — ephemeral |

**There is exactly one map state.** React binds to SGS through
`useSyncExternalStore`; it does not mirror it into a second store. The Zustand
store holds only session-scoped runtime facts that must not appear in a shared
link.

---

## Failure modes

| Failure              | Detection                                           | Behaviour                                                                |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Basemap style fails  | MapLibre `error` event matching style/sprite/glyphs | Falls back to Stadia Alidade Smooth Dark, emits `map:error`              |
| No renderer attached | `rendererDraws === false`                           | Canvas states "Rendering engine unavailable — this is not a data outage" |
| No vessel source     | `EmptyVesselSource`                                 | Map renders basemap, EEZ and ports; vessel count reads 0                 |
| Vessel source throws | `list()` rejects                                    | `map:error` on the bus; previous vessels stay on screen                  |
| Stale position       | `age > TIMING.staleThresholdMs`                     | Marker dims to 50% and switches to the stale sprite                      |
| Subscriber throws    | Caught per-handler in `MapEventBus`                 | Other subscribers still receive the event                                |

---

## Adding a rendering engine

Implement `MapRenderer` and inject it. No consumer changes. Optional methods
(`setLayerOpacity`, `fitBounds`, `flyTo`, `getFps`) are feature-detected by
callers, so a minimal adapter remains valid.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
