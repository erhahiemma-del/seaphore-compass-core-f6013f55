# Map Acceptance Tests

**Seaphore · GIP G5.5.2 · canonical**

`[AUTO]` tests run in CI. Unmarked tests are manual, performed by the
implementing engineer and verified by the product owner.

**Regression rule:** every sprint tag implies the full cumulative suite passed.

**Path note:** the original GIP tests grep `src/gip/`. This repository uses
`src/services/geospatial/` and `src/features/maritime/`. Commands below are
repointed accordingly.

---

## Automated

Run: `bun run test:unit`

| Id   | Assertion                                                                                       | Suite                                  |
| ---- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| A.01 | Event bus delivers, isolates throwing subscribers, supports once/off                            | `geospatial-event-bus`                 |
| A.02 | Registry rejects duplicate ids and empty render-layer lists                                     | `geospatial-layer-registry`            |
| A.03 | `resolveVisibility` returns an entry for **every** render layer, hidden ones explicitly `false` | `geospatial-layer-registry`            |
| A.04 | Mission presets reference only registered layers                                                | `geospatial-layer-registry`            |
| A.05 | Every `pending-source` layer carries a `pendingReason`                                          | `geospatial-layer-registry`            |
| A.06 | SGS does not notify when nothing changed (no render storm on pan)                               | `geospatial-shared-geospatial-service` |
| A.07 | URL round-trips; malformed input degrades safely                                                | `geospatial-shared-geospatial-service` |
| A.08 | Layer opacity round-trips through the URL                                                       | `geospatial-shared-geospatial-service` |
| A.09 | A full refresh forwards **only the delta** to the renderer                                      | `geospatial-update-engine`             |
| A.10 | An unchanged refresh produces **zero** renderer calls                                           | `geospatial-update-engine`             |
| A.11 | A repeated identical position report costs nothing                                              | `geospatial-update-engine`             |
| A.12 | Stale detection, opacity, and icon variant selection                                            | `geospatial-update-engine`             |
| A.13 | Sprite ids match `vesselIconId()` exactly                                                       | `geospatial-renderer-contract`         |
| A.14 | Renderer contract is satisfied by both adapters                                                 | `geospatial-renderer-contract`         |

### [AUTO] Golden Rule

```bash
grep -rn "ice_fused_intelligence\|osint_evidence\|osint_raw" src/services/geospatial/ src/features/maritime/
```

**PASS:** no results.

### [AUTO] No duplicated map state

```bash
grep -rn "create<.*MapState" src/
```

**PASS:** no results — `MapState` has exactly one owner (SGS).

---

## Manual — Foundation

| Id    | Step                            | Pass                                       |
| ----- | ------------------------------- | ------------------------------------------ |
| M1.01 | Open `/maritime`                | Dark basemap within 2 s, no console errors |
| M1.02 | Observe viewport                | Centred on Gulf of Guinea, zoom 6          |
| M1.03 | Pan west                        | Stops at ~lon −10 (`maxBounds` enforced)   |
| M1.04 | Observe top-left                | Zoom and compass controls present          |
| M1.05 | Observe bottom-left             | Scale bar in **nautical miles**            |
| M1.06 | Pan the map                     | URL updates without reload                 |
| M1.07 | Paste a panned URL in a new tab | Map opens at that position                 |
| M1.08 | Click "Terrain Perspective"     | Placeholder shown, no crash                |
| M1.09 | `bun run build`                 | Succeeds; no `window is not defined`       |

## Manual — Geography and layers

| Id    | Step                             | Pass                                                            |
| ----- | -------------------------------- | --------------------------------------------------------------- |
| M2.01 | Observe at zoom 6                | Gold dashed EEZ boundary visible                                |
| M2.02 | Observe at zoom 6                | Five blue port anchor symbols with APA/TIN/WAR/CAL/ONN          |
| M2.03 | Zoom 6 → 11                      | Anchorage extent rings grow and purple anchorage symbols appear |
| M2.04 | Toggle "Ports" off               | Diamonds **and** labels **and** anchorage all disappear         |
| M2.05 | Search "eez" in the layer panel  | Only the EEZ layer listed                                       |
| M2.06 | Set EEZ opacity to 20 %          | Boundary visibly fades; URL gains `opacity=`                    |
| M2.07 | Click a group "None"             | Every layer in that group switches off                          |
| M2.08 | Click "Revenue Investigation"    | vessels, ports, riskHeatmap, revenueHeat active                 |
| M2.09 | Reload after toggling            | Layer state restored from URL                                   |
| M2.10 | Inspect a `pending-source` layer | "No source" badge with a stated reason                          |

## Manual — Vessels _(requires a connected `VesselSource`)_

| Id    | Step                              | Pass                                                                                 |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------ |
| M3.01 | Load with vessels                 | Arrows render, risk-coloured                                                         |
| M3.02 | Vessel with heading 48°           | Arrow points north-east                                                              |
| M3.03 | Zoom 8 → 10                       | Vessel name labels appear at 9                                                       |
| M3.04 | Vessel with position > 10 min old | Keeps its semantic hull colour and renders at ~50 % opacity                          |
| M3.05 | Hover a vessel, wait 500 ms       | Quick Assessment popup appears                                                       |
| M3.06 | Move cursor off                   | Popup dismissed immediately                                                          |
| M3.07 | Click a vessel                    | Marker turns teal; Intelligence Card opens                                           |
| M3.08 | Click bare basemap                | Selection cleared; card closes                                                       |
| M3.09 | Move one vessel                   | Only that marker moves; `incrementalBatches` increments, `fullReplacements` does not |
| M3.10 | Inspect card fields with no data  | Each states **why**, none blank                                                      |

## Cross-phase

| Id   | Assertion                                        |
| ---- | ------------------------------------------------ |
| X.01 | No console errors on load                        |
| X.02 | Golden Rule grep clean                           |
| X.03 | `bun run test:unit` green                        |
| X.04 | No OIE / ICE / IAL file modified by a map sprint |
| X.05 | Usable at a 375 px viewport                      |
| X.06 | First tile within 3 s on 25 Mbps                 |

---

## Known environment blockers

| Blocker                                                                              | Effect                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `@lovable.dev/mcp-js` compares a forward-slash root against a Windows backslash path | `bun run test:unit` **cannot start on Windows**        |
| `typecheck` script calls `tsgo`, not a dependency                                    | `bun run typecheck` fails locally; CI works via `bunx` |

Neither is caused by the geospatial domain. Both block local verification only.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
