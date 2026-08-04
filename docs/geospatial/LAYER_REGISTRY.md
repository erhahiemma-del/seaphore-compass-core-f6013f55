# Layer Registry

**Seaphore · GIP G5.5.2 · canonical**

Every layer the Live Command Map can display is registered in
`src/services/geospatial/layer-registry.ts`. **No layer may be added to the
renderer without a corresponding `LayerDefinition`.**

---

## Two kinds of id

| Kind                  | Example                                | Owned by                      | Stable?                                  |
| --------------------- | -------------------------------------- | ----------------------------- | ---------------------------------------- |
| **Logical layer key** | `vessels`                              | Layer Registry                | Yes — persisted in SGS state and the URL |
| **Render layer id**   | `vessels-layer`, `vessel-labels-layer` | `LAYER_IDS` in `constants.ts` | Internal to the renderer                 |

One logical layer maps to _many_ render layers. `vessels` drives the markers,
the labels, and (when enabled) the headings. Officers toggle one thing; the
renderer draws several. This indirection is why the renderer's internal layer
structure can change without touching the UI or invalidating a shared link.

`LayerRegistry.resolveVisibility(activeLayers)` performs the translation and
returns a **complete** map of render-layer-id → visible. Layers outside the
active set are explicitly `false`, never omitted — an omitted layer would keep
whatever visibility it last had.

---

## Mission groups

Three groups, in display order:

| Group          | Question it answers          |
| -------------- | ---------------------------- |
| `OPERATIONAL`  | What is happening right now? |
| `INTELLIGENCE` | What does it mean?           |
| `ANALYSIS`     | What patterns are forming?   |

> **Note on group count.** The G5.5.2 sprint brief lists ten mission groups
> (Navigation, Revenue, Compliance, Cargo, Manifest, OSINT, Ownership, Alerts,
> …). This registry implements the **three** groups defined by the GIP Layer
> Registry specification, because that specification assigns every layer to one
> of those three and assigns none of the ten. `LayerGroup` is a union type in
> one file; expanding it is a small, contained change once each layer has a
> group assigned. **This is an open decision, not an oversight.**

---

## Layer status

| Status           | Meaning                        | Panel behaviour                                                                   |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `ready`          | Data path exists               | Normal toggle                                                                     |
| `pending-source` | Catalogued, no connector wired | Toggle works, "No source" badge, `pendingReason` shown instead of the description |

A `pending-source` layer must always carry a `pendingReason`. This is asserted
in the unit tests. Rendering nothing without explanation is how an officer
comes to distrust the map.

---

## Registered layers

### OPERATIONAL

| Key           | Render layers                                                   | Default | Status                                      |
| ------------- | --------------------------------------------------------------- | ------- | ------------------------------------------- |
| `vessels`     | `vessels-layer`, `vessel-headings-layer`, `vessel-labels-layer` | **ON**  | ready                                       |
| `ports`       | `ports-layer`, `port-labels-layer`, `port-anchorage-layer`      | **ON**  | ready                                       |
| `eezBoundary` | `eez-boundary-layer`                                            | **ON**  | ready                                       |
| `weather`     | `weather-layer`                                                 | OFF     | pending-source — awaiting weather connector |

### INTELLIGENCE

| Key           | Render layers                             | Default | Status                                          |
| ------------- | ----------------------------------------- | ------- | ----------------------------------------------- |
| `riskHeatmap` | `risk-heatmap-layer`                      | OFF     | pending-source — awaiting OSAE risk aggregation |
| `revenueHeat` | `revenue-heatmap-layer`                   | OFF     | pending-source — awaiting revenue aggregation   |
| `aisTrack`    | `ais-track-layer`, `ais-track-dark-layer` | OFF     | pending-source — awaiting AIS history connector |

### ANALYSIS

| Key              | Render layers                                  | Default | Status |
| ---------------- | ---------------------------------------------- | ------- | ------ |
| `vesselClusters` | `vessel-clusters-layer`, `cluster-count-layer` | OFF     | ready  |
| `investigArea`   | `investigation-area-layer`                     | OFF     | ready  |

**Default active set:** `vessels`, `ports`, `eezBoundary`.

---

## Mission presets

Preset layer bundles, asserted against the registry in tests so a preset can
never reference a layer that does not exist.

| Preset                | Layers                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| Revenue Investigation | `vessels`, `ports`, `riskHeatmap`, `revenueHeat`                            |
| Compliance Sweep      | `vessels`, `ports`, `riskHeatmap`, `eezBoundary`                            |
| Navigation            | `vessels`, `ports`, `eezBoundary`, `weather`                                |
| Full Intelligence     | `vessels`, `ports`, `eezBoundary`, `riskHeatmap`, `revenueHeat`, `aisTrack` |

Presets are UI affordances, not intelligence: they set which layers are on and
nothing else.

---

## Layer control surface

`src/features/maritime/LayerPanel.tsx` provides:

- **Toggle** per layer → `sgs.toggleLayer(id)`
- **Opacity** per active layer, 0–100 % → `sgs.setLayerOpacity(id, value)`
- **Search** across label, description, and id
- **Group enable / disable** — "All" / "None" per group
- **Mission presets**

All state is written to SGS and serialised to the URL. The panel stores nothing
locally except the search box text, which is deliberately ephemeral.

---

## Adding a layer

1. Add the render layer id(s) to `LAYER_IDS` in `constants.ts`.
2. Add a `LayerDefinition` to `DEFAULT_LAYERS` with a group, order, and status.
3. Create the layer in `MapLibreRenderer.installSourcesAndLayers()`.
4. If it has no data source yet, set `status: "pending-source"` **and** a
   `pendingReason`.
5. Add a row to the tables above.

The registry rejects duplicate ids and definitions with no render layer ids —
silently overwriting would let two features disagree about what `vessels` means.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
