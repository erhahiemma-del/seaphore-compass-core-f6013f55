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

| Zoom | Coverage                  | Vessels        | Labels & geography                          |
| ---- | ------------------------- | -------------- | ------------------------------------------- |
| 4–5  | West African coast        | icon-size 0.38 | port short names; 10° graticule only        |
| 6    | Nigerian waters (default) | ~0.45          | port short names; EEZ fill at its strongest |
| 7–8  | Lagos to Calabar          | growing        | 5° graticule fades in; coastline thickens   |
| 9–10 | Single port area          | icon-size 0.8  | **vessel names appear**; full port names    |
| 11+  | Port approach             | up to 1.3      | street detail returns; 1° graticule; rivers |

Vessel labels use `minzoom: 8.5` and fade in to 9.2 rather than popping.
Anchorage circles are drawn at their **real radius in kilometres** — see
`PIXELS_PER_KM` — so a 2 km ring is sub-pixel at strategic zoom and simply is
not there, which is the honest result. The risk heatmap uses `maxzoom: 10` so it
yields to individual markers at operational zoom.

---

## Vessel symbology

Sprites are drawn with the Canvas API at mount and registered via
`map.addImage()` — no sprite sheet, no image files, no network request.
Geometry: 30×30 px, drawn pointing north. 8 colours × 4 silhouettes × 2
directionalities = **64 sprites**, about 230 KB, built once at mount.

| Colour key | Colour    | Used for                             |
| ---------- | --------- | ------------------------------------ |
| `critical` | `#C0392B` | risk CRITICAL                        |
| `high`     | `#C0392B` | risk HIGH                            |
| `medium`   | `#D4890A` | risk MEDIUM                          |
| `low`      | `#1A6B3A` | risk LOW                             |
| `clean`    | `#1A6B3A` | risk CLEAN                           |
| `unknown`  | `#25B36B` | risk UNKNOWN                         |
| `selected` | `#0E7C7B` | any risk, selected                   |
| `stale`    | `#25B36B` | legacy id only; staleness is opacity |

The table above is the **colour** axis only. A full sprite id also carries a
silhouette and a directionality suffix:

    vessel-{colour}-{silhouette}[-nodir]

- **Colour** comes from risk, or from selection, which outranks it. Staleness
  changes opacity only; it must not turn a vessel into a generic grey marker.
- **Silhouette** comes from the reported hull type (`classifyVessel`):
  `wedge` for tankers and bulk carriers, `block` for container and vehicle
  carriers, `disc` when no type was reported.
- **`-nodir`** marks a vessel whose course nobody reported. It is the same
  hull family drawn with a blunt bow, and the renderer leaves it unrotated.
  Both halves matter: an unrotated _pointed_ sprite still points north.

Ids are composed by `vesselSpriteId()` and enumerated by `vesselSpriteIds()`,
which is exactly what `loadVesselIcons()` registers and what `icon-image`
reads back off the feature. A mismatch renders **nothing** — MapLibre silently
skips features naming an unregistered sprite — so the unit-test assertion that
every id `vesselIconId()` can produce is registered is load-bearing, not
cosmetic.

### Selection precedence

`isSelected` → risk band. Selection outranks risk so an officer can always see
what they clicked; stale position is shown by opacity, not by changing the hull
colour or silhouette.

### Rotation

```
"icon-rotate": ["case", ["==", ["get", "headingKnown"], true], ["get", "heading"], 0]
"icon-rotation-alignment": "map"
```

`heading` is degrees clockwise from north. `"map"` alignment keeps the hull
pointing along the vessel's real course when the officer rotates the map.

Rotation is applied **only** to a bearing someone reported. `heading` is a
required number upstream, so a provider with no course still yields `0`, which
rotated is a vessel steaming due north. `headingKnown` — derived by
`resolveHeading()` from the source's `headingReported` flag — is what separates
that from a real northerly course. Out-of-range values are wrapped (370° is an
upstream wrapping bug, not an absence of information); `NaN` and `Infinity` are
treated as absent, because they carry no bearing.

Rotation is only half the guarantee: an unrotated _pointed_ sprite still points
north, which is why an unreported course also selects the blunt-bowed `-nodir`
silhouette.

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

Declared as `INSTALLED_RENDER_LAYERS`, in install order. The renderer checks
itself against that list at mount (`verifyInstalledLayers`) and reports any
layer the engine declined — `addLayer` does not throw on an invalid expression,
it drops the layer and carries on looking healthy.

| Render layer id               | Type    | Source               |
| ----------------------------- | ------- | -------------------- |
| `graticule-layer`             | line    | `graticule`          |
| `eez-fill-layer`              | fill    | `nigeria-eez`        |
| `eez-boundary-layer`          | line    | `nigeria-eez`        |
| `port-anchorage-layer`        | circle  | `ports`              |
| `port-anchorage-symbol-layer` | symbol  | `ports`              |
| `ports-layer`                 | symbol  | `ports`              |
| `port-labels-layer`           | symbol  | `ports`              |
| `risk-heatmap-layer`          | heatmap | `vessels`            |
| `vessel-selection-layer`      | circle  | `vessels`            |
| `vessels-layer`               | symbol  | `vessels`            |
| `vessel-labels-layer`         | symbol  | `vessels`            |
| `incident-reports-layer`      | symbol  | `incident-reports`   |
| `weather-layer`               | symbol  | `weather-alerts`     |
| `investigation-area-layer`    | fill    | `investigation-area` |

Before these go on, `applyMaritimeStyle()` retunes the basemap — land as a
solid mass, ocean as the subject, an explicit coastline, street furniture
deferred to zoom 11. It matches CARTO layers by `source-layer`, never by id,
and is total: an unrecognised style costs colour, not the mount.

**Zoom expressions must be outermost.** MapLibre rejects a `["zoom"]` nested
inside `*` or `case`, and rejects it _quietly_ — the layer is simply not added.
Four layers were lost this way during M1B; the runtime check above exists
because of it.

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
