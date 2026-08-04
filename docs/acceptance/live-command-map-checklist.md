# Live Command Map — Acceptance Checklist

**Sprint G5.5.2 · verified 2026-08-04**

Status: ✅ verified · ⚠️ implemented but unverifiable in this environment ·
⛔ blocked, with the blocker named.

---

## Rendering

| #   | Item                                 | Status | Evidence                                                    |
| --- | ------------------------------------ | ------ | ----------------------------------------------------------- |
| 1   | CARTO Dark basemap renders           | ⚠️     | Implemented; needs a browser to confirm                     |
| 2   | Basemap failure falls back to Stadia | ⚠️     | `error` handler matches style/sprite/glyphs                 |
| 3   | Nigeria and Gulf of Guinea in view   | ✅     | Default centre `[3.5, 4.5]`, zoom 6                         |
| 4   | EEZ renders                          | ✅     | `nigeria-eez.geojson` + `eez-boundary-layer` (gold, dashed) |
| 5   | Ports render                         | ✅     | 5 NIMASA ports, diamond sprite, short-name labels           |
| 6   | Anchorage circles scale with zoom    | ✅     | Interpolated 8 px @ z6 → 40 px @ z12                        |
| 7   | Vessel layer exists and is styled    | ✅     | `vessels-layer`, 8 sprite variants                          |
| 8   | Vessel heading rotation              | ✅     | `icon-rotate` bound to `heading`, `alignment: map`          |
| 9   | Vessel zoom scaling                  | ✅     | `icon-size` interpolated 0.45 → 1.2                         |
| 10  | Stale vessel styling                 | ✅     | `vessel-stale` sprite at 0.5 opacity                        |
| 11  | Selected vessel styling              | ✅     | `vessel-selected` teal, outranks staleness                  |
| 12  | Risk colour coding                   | ✅     | 6 risk bands from `RISK_COLORS`                             |
| 13  | Vessels actually visible on screen   | ⛔     | **No vessel source connected** — see Blockers               |

## Interaction

| #   | Item                                    | Status | Evidence                                  |
| --- | --------------------------------------- | ------ | ----------------------------------------- |
| 14  | Click vessel → selection                | ✅     | `vessel:click` → `sgs.selectEntity`       |
| 15  | Click basemap → deselect                | ✅     | Guarded by `queryRenderedFeatures`        |
| 16  | Hover → Quick Assessment after 500 ms   | ✅     | Debounced, resets per `mousemove`         |
| 17  | Hover dismiss on leave                  | ✅     | `mouseleave` clears timer and popup       |
| 18  | Cursor feedback on vessels and ports    | ✅     | `pointer` on enter, reset on leave        |
| 19  | Intelligence card opens with all fields | ✅     | Identity, ownership, position, assessment |
| 20  | Unavailable fields state a reason       | ✅     | Never blank, never fabricated             |

## Layers

| #   | Item                                       | Status | Evidence                                 |
| --- | ------------------------------------------ | ------ | ---------------------------------------- |
| 21  | Mission grouping                           | ✅     | 3 groups per Layer Registry spec         |
| 22  | Toggle works                               | ✅     | Unit-tested via `resolveVisibility`      |
| 23  | Hidden layers explicitly hidden            | ✅     | Complete visibility map, never omission  |
| 24  | Opacity control                            | ✅     | Per-layer, per-type paint property       |
| 25  | Layer search                               | ✅     | Label, description, id                   |
| 26  | Group enable / disable                     | ✅     | "All" / "None" per group                 |
| 27  | Mission presets                            | ✅     | 4 presets, asserted against the registry |
| 28  | `pending-source` layers explain themselves | ✅     | Badge + reason, asserted in tests        |

## State and URL

| #   | Item                                | Status | Evidence                            |
| --- | ----------------------------------- | ------ | ----------------------------------- |
| 29  | URL restores camera                 | ✅     | Round-trip test                     |
| 30  | URL restores layers                 | ✅     | Unknown keys dropped                |
| 31  | URL restores opacity                | ✅     | Sparse encoding                     |
| 32  | Malformed URL degrades safely       | ✅     | Out-of-range rejected, zoom clamped |
| 33  | **No duplicated map state**         | ✅     | One `MapState`, owned by SGS        |
| 34  | Session state never reaches the URL | ✅     | Separate ephemeral store            |

## Performance

| #   | Item                                   | Status | Evidence                                   |
| --- | -------------------------------------- | ------ | ------------------------------------------ |
| 35  | Incremental updates                    | ✅     | `GeoJSONSource.updateData`, not `setData`  |
| 36  | One vessel moves → one feature updates | ✅     | Asserted in `geospatial-update-engine`     |
| 37  | No redraw when nothing changed         | ✅     | Zero renderer calls asserted               |
| 38  | No redundant style writes              | ✅     | Visibility read-before-write guard         |
| 39  | No React render per frame              | ✅     | MapLibre-owned popups; FPS sampled at 1 Hz |
| 40  | FPS instrumentation                    | ✅     | `getFps()`, surfaced in the status bar     |
| 41  | 10,000-vessel target                   | ⛔     | Unmeasurable without a vessel source       |

## Quality gates

| #   | Item                         | Status | Evidence                                     |
| --- | ---------------------------- | ------ | -------------------------------------------- |
| 42  | Typecheck: no new errors     | ✅     | 177, identical to baseline                   |
| 43  | Lint clean on new code       | ✅     | ESLint, no warnings                          |
| 44  | Format clean                 | ✅     | Prettier                                     |
| 45  | Tests pass                   | ✅     | See sprint report                            |
| 46  | Route works                  | ✅     | `/maritime` registered in `routeTree.gen.ts` |
| 47  | No G5.5.1 interface replaced | ✅     | `MapRenderer` extended additively only       |

---

## Blockers

1. **No vessel data source.** The Canonical UIP carries no positional field, so
   no honest adapter can be written. Items 13 and 41 cannot be verified until a
   `VesselSource` is connected. Everything downstream of the source is
   implemented and unit-tested.
2. **`bun run test:unit` cannot start on Windows.** `@lovable.dev/mcp-js`
   compares a forward-slash root against a backslash path. Pre-existing;
   unrelated to this sprint. CI on Linux is unaffected.
3. **`bun run typecheck` fails locally.** The script calls `tsgo`, which is not
   a dependency. Verified with the installed `tsc` instead.
4. **EEZ polygon is approximate.** Self-declared in the file. Must be replaced
   with the VLIZ or Nigerian Hydrographic Office boundary before enforcement use.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
