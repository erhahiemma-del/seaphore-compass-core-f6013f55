# Geospatial (GIP) — Live Command Map Foundation

Sprint **G5.5.1**. Infrastructure for the operational map: shared state, layer
catalogue, vessel domain model, incremental updates, and a typed event
transport. **No intelligence logic lives here.**

Specifications: _GIP Command Edition_ and _GIP Live Map Development Guide_
(G1–G6). The guides use `/src/gip/` as a conceptual namespace; this repository
places domain logic under `src/services/geospatial/` and UI under
`src/features/maritime/`, per its existing domain-driven structure.

## Architecture

```
src/features/maritime/         React surfaces (canvas host, layer panel)
        │
SharedGeospatialService        canonical MapState + URL serialisation
LayerRegistry                  logical layers → render layer ids
MapEventBus                    typed interaction transport
VesselUpdateEngine             incremental diffing
        │
MapRenderer (interface)        ← injection seam
        │
MapLibreRenderer | StubMapRenderer
```

Everything above `MapRenderer` is engine-agnostic and unit-testable without a
canvas, a WebGL context, or a map library.

## What each module owns

| Module                         | Owns                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `constants.ts`                 | Viewport, basemap, palette, ports, EEZ bbox, layer ids, timings |
| `types.ts`                     | `MapState`, coordinates, filters, structural GeoJSON            |
| `vessel.ts`                    | Vessel identity, position, freshness, feature projection        |
| `event-bus.ts`                 | Typed pub/sub with handler isolation                            |
| `layer-registry.ts`            | Layer catalogue, groups, mission presets, visibility resolution |
| `shared-geospatial-service.ts` | Canonical state, subscriptions, URL sync                        |
| `update-engine.ts`             | Diffing and incremental render batches                          |
| `renderer.ts`                  | The engine contract                                             |
| `renderers/`                   | Stub and MapLibre adapters                                      |
| `vessel-source.ts`             | Data-entry contract for future connectors                       |
| `store.ts`                     | React bindings and ephemeral session state                      |

## Deliberate boundaries

**No intelligence.** `riskLevel` and `attentionScore` are carried as fields
populated upstream by OSAE (`@/services/osae`). Nothing here scores, ranks, or
classifies. Staleness is the one derived value, and it is a mechanical time
comparison — "this position may have changed", never "this vessel is
suspicious".

**No direct data reads.** Per the Golden Rule, no map module may query
`ice_fused_intelligence`, `osint_evidence`, `osint_raw`, or any connector.
Vessel data enters through a `VesselSource` implementation.

**No map library.** `maplibre-gl` is not a dependency of this repository. The
`MapLibreRenderer` is a documented stub; the default `StubMapRenderer` keeps
the full stack runnable and testable. See below.

## Extension points

### Adding a rendering engine

Implement `MapRenderer` and inject it. No consumer changes.
`renderers/maplibre-renderer.ts` carries a step-by-step completion guide:
install `maplibre-gl`, replace the stub inheritance, and implement the nine
methods against a `maplibregl.Map`. Sprite ids must match `vesselIconId()`.

### Adding a vessel data source

Implement `VesselSource`:

```ts
class AisVesselSource implements VesselSource {
  readonly id = "ais-spire";
  async list(query?: VesselQuery): Promise<readonly Vessel[]> {
    /* resolve through the Intelligence Orchestrator */
  }
  subscribe(onVessel: (v: Vessel) => void): Unsubscribe {
    /* push each report into engine.applyPatch */
  }
}
```

Sources with a push channel feed `VesselUpdateEngine.applyPatch` directly,
which is the path that avoids a full re-render per position report. Sources
without one fall back to polling `list` on `TIMING.positionRefreshMs`.

> **No orchestrator-backed source ships in G5.5.1.** The Canonical UIP
> (`@/services/ife/unified`) exposes identity, fused evidence, provenance,
> freshness, and OSAE assessments — but no positional field. There is no
> honest UIP → `Vessel` mapping to write yet; inventing one would be
> placeholder intelligence. The seam is defined and documented instead.

### Adding a layer

Register a `LayerDefinition` with the registry. Layers whose data source is
not yet wired declare `status: "pending-source"` with a `pendingReason`; the
panel shows them disabled and explains why, rather than rendering nothing
silently.

### Adding an event

Add a key to `MapEventMap`. `on`/`emit` become type-safe for it immediately.

## Why the update engine exists

A full refresh rebuilds every feature in the source — at national scale, that
is thousands of features redrawn because one AIS report arrived.
`VesselUpdateEngine` diffs incoming data against what is already on screen and
emits only the delta. `applyFull` still accepts the complete list (the
60-second refresh) but forwards only what changed; `applyPatch` handles the
realtime single-vessel path and returns an empty diff when nothing
render-affecting changed, so a stream of identical reports costs nothing.

`hasRenderableChange` defines "changed" as _changed in a way the renderer
would need to redraw_ — provenance and unrendered metadata are ignored on
purpose.

## Testing

```bash
bun run test:unit
```

Covered in `tests/unit/`: `geospatial-shared-geospatial-service.test.ts`,
`geospatial-layer-registry.test.ts`, `geospatial-event-bus.test.ts`,
`geospatial-update-engine.test.ts`.

Construct dedicated instances in tests (`new SharedGeospatialService(...)`,
`new LayerRegistry()`, `new MapEventBus()`) rather than using the exported
singletons, so cases stay isolated.
