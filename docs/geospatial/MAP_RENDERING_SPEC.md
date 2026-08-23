# Map Rendering Specification

**Seaphore · GIP G5.5.2 · canonical**

Implemented by `src/services/geospatial/renderers/maplibre-renderer.ts`.

---

## Viewport

| Property         | Value                         | Source                   |
| ---------------- | ----------------------------- | ------------------------ |
| Default centre   | `[3.5, 4.5]` (Gulf of Guinea) | `MAP_DEFAULTS.center`    |
| Default zoom     | 6                             | `MAP_DEFAULTS.zoom`      |
| Min / max zoom   | 4 / 18                        | `MAP_DEFAULTS`           |
| `maxBounds`      | `[[-10,-4],[20,14]]`          | `MAP_DEFAULTS.maxBounds` |
| Basemap          | CARTO Dark Matter             | `BASEMAP_STYLE`          |
| Fallback basemap | Stadia Alidade Smooth Dark    | applied on style error   |

`pitchWithRotate` is disabled — pitch belongs to the G7 Terrain Perspective.

### Zoom behaviour

| Zoom | Coverage                  | Vessels        | Labels                  |
| ---- | ------------------------- | -------------- | ----------------------- |
| 4–5  | West African coast        | icon-size 0.45 | port short names        |
| 6    | Nigerian waters (default) | icon-size ~0.5 | port short names        |
| 7–8  | Lagos to Calabar          | growing        | port labels             |
| 9–10 | Single port area          | icon-size 0.75 | **vessel names appear** |
| 11+  | Port approach             | up to 1.2      | full labels             |

Vessel labels use `minzoom: 9`. Anchorage circles interpolate 8 px at zoom 6 to
40 px at zoom 12. The risk heatmap uses `maxzoom: 10` so it yields to individual
markers at operational zoom.

---

## Vessel symbology

Sprites are drawn with the Canvas API at mount and registered via
`map.addImage()` — no sprite sheet, no image files, no network request.
Geometry: 30×30 px elongated teardrop pointing north.

| Sprite id         | Colour    | Used for                 |
| ----------------- | --------- | ------------------------ |
| `vessel-critical` | `#C0392B` | risk CRITICAL            |
| `vessel-high`     | `#C0392B` | risk HIGH                |
| `vessel-medium`   | `#D4890A` | risk MEDIUM              |
| `vessel-low`      | `#1A6B3A` | risk LOW                 |
| `vessel-clean`    | `#1A6B3A` | risk CLEAN               |
| `vessel-unknown`  | `#4A5568` | risk UNKNOWN             |
| `vessel-selected` | `#0E7C7B` | any risk, selected       |
| `vessel-stale`    | `#2D3748` | any risk, stale position |

Sprite ids are produced by `vesselIconId()` and asserted equal to
`VESSEL_SPRITE_VARIANTS` in the unit tests. A mismatch renders **nothing** —
MapLibre silently skips features naming an unregistered sprite — so the
assertion is load-bearing, not cosmetic.

### Selection precedence

`isSelected` → `isStale` → risk band. Selection outranks staleness so an
officer can always see what they clicked.

### Rotation

```
"icon-rotate": ["get", "heading"]
"icon-rotation-alignment": "map"
```

`heading` is degrees clockwise from north. `"map"` alignment keeps the arrow
pointing along the vessel's real course when the officer rotates the map.
Headings are normalised to 0–359 by `normalizeHeading()`; a non-finite heading
becomes 0 rather than breaking the expression.

### Opacity

`icon-opacity` is bound to `["get","opacity"]`, computed by `vesselOpacity()`:

| Condition                                   | Opacity |
| ------------------------------------------- | ------- |
| selected                                    | 1.0     |
| stale (> 10 min)                            | 0.5     |
| unattended while an attention set is active | 0.35    |
| otherwise                                   | 1.0     |

Staleness is a mechanical time comparison. A dimmed marker means "this position
may have changed" — never "this vessel is suspicious".

---

## Interaction

| Gesture              | Behaviour                                                   | Event emitted                   |
| -------------------- | ----------------------------------------------------------- | ------------------------------- |
| Click vessel         | select                                                      | `vessel:click`                  |
| Click basemap        | deselect (verified by `queryRenderedFeatures`)              | `map:click`                     |
| Hover vessel         | Quick Assessment popup after `TIMING.hoverDelayMs` (500 ms) | `vessel:hover`                  |
| Leave vessel         | popup dismissed immediately                                 | `vessel:hover` with `imo: null` |
| Pan / zoom           | camera echoed to SGS                                        | `map:move`                      |
| Enter vessel or port | cursor becomes `pointer`                                    | —                               |

The hover timer resets on each `mousemove`, so sweeping across dense traffic
does not flash a popup per vessel.

Quick Assessment is rendered with MapLibre's own `Popup`, not React — it must
track the map during pan without a React render per frame. All interpolated
text is HTML-escaped.

---

## Incremental rendering

MapLibre 6 exposes `GeoJSONSource.updateData(diff)`, applying per-feature
add/update/remove without re-parsing the collection. This requires stable
feature ids; the source is declared with `promoteId: "imo"` and features carry
`id: imo`.

| Path                        | When                                                   | Cost                                            |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `patchVessels(batch)`       | every incremental change                               | one `updateData` with only the touched features |
| `setVesselData(collection)` | initial load, presentation-wide change (new selection) | full `setData`                                  |

`getRenderStats()` exposes `fullReplacements` and `incrementalBatches` so tests
can assert the incremental path is genuinely taken rather than assumed.

---

## Layers created at mount

| Render layer id            | Type    | Source               |
| -------------------------- | ------- | -------------------- |
| `eez-boundary-layer`       | line    | `nigeria-eez`        |
| `port-anchorage-layer`     | circle  | `ports`              |
| `ports-layer`              | symbol  | `ports`              |
| `port-labels-layer`        | symbol  | `ports`              |
| `risk-heatmap-layer`       | heatmap | `vessels`            |
| `vessels-layer`            | symbol  | `vessels`            |
| `vessel-labels-layer`      | symbol  | `vessels`            |
| `investigation-area-layer` | fill    | `investigation-area` |

Visibility is never set by a component. The Layer Registry resolves logical
layer keys to render layer ids and produces a complete visibility map — layers
not in the active set are explicitly hidden, never merely omitted.

Opacity is applied through `setLayerOpacity`, which selects the correct paint
property per layer type (`icon-opacity`, `circle-opacity`, `line-opacity`,
`fill-opacity`, `heatmap-opacity`, `raster-opacity`).

---

## Performance

- **Redundant-write guard.** `setLayerVisibility` reads the current value first
  and returns early if unchanged, so an SGS tick that changes nothing costs no
  style recalculation.
- **No React render per frame.** Popups are MapLibre-owned; FPS is sampled once
  per second, not per frame.
- **Selector discipline.** React components subscribe to primitives (joined
  strings, counts), never freshly-allocated arrays or objects, so
  `useSyncExternalStore` does not re-render on every tick.
- **Camera loop guard.** `map:move` → SGS → renderer would oscillate; the
  canvas suppresses the echo while applying.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
