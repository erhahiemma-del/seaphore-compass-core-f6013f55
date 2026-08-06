# Live Data Pipeline

**Seaphore · G5.6 · verified against the live GFW API 2026-08-06**

Every number here was measured, not assumed.

---

## Flow

```
GFW v3  POST /v3/events  (5 datasets, POST body geometry)
   ↓  runGfwAreaSearch      normalise + dedupe + cache (60s)
   ↓  GlobalFishingWatchVesselSource.normalize()   → canonical Vessel
   ↓  validateBatch()       accepted / warning / rejected
   ↓  VesselUpdateEngine    incremental diff
   ↓  MapLibreRenderer      GeoJSONSource.updateData()
   ↓  /maritime
```

## Verified request contract

| Property       | Value                                   | How established                                   |
| -------------- | --------------------------------------- | ------------------------------------------------- |
| Endpoint       | `POST /v3/events`                       | GET returns data too, but cannot filter spatially |
| Spatial filter | **geometry in POST body**               | `bbox` query param returns HTTP 422               |
| Auth           | `Authorization: Bearer <GFW_API_TOKEN>` | 200 on `/v3/vessels/search`                       |
| Success status | **201** (not 200)                       | observed on every POST                            |

### Datasets

`public-global-events:latest` **does not exist** and returns HTTP 404. The
five real event datasets, with global 30-day totals as probed:

| Dataset                                   | Total     |
| ----------------------------------------- | --------- |
| `public-global-fishing-events:latest`     | 587,823   |
| `public-global-gaps-events:latest`        | 23,575    |
| `public-global-encounters-events:latest`  | 77,386    |
| `public-global-loitering-events:latest`   | 778,201   |
| `public-global-port-visits-events:latest` | 2,415,359 |

### Window — the critical finding

GFW event data lags. Over the Gulf of Guinea bbox `[2.5, 3.0, 9.5, 8.5]`:

| Window                     | Events (fishing) |
| -------------------------- | ---------------- |
| 24 hours                   | **0**            |
| 7 days                     | 277              |
| 30 days                    | 1,824            |
| 90 days                    | 5,753            |
| 30 days, all five datasets | **13,943**       |

The default window is **30 days**. A 24-hour window renders an empty map.

## Response shape

```
entries[]: { start, end, id, type, position, regions, boundingBox,
             distances, vessel, <fishing|gap|encounter|loitering|port_visit> }
position:  { lat, lon }
vessel:    { id, name, ssvid, flag, type, publicAuthorizations, nextPort }
```

Two absences the parser must handle, and does:

- **No `imo`.** Identity keys fall back IMO → MMSI (`ssvid`) → GFW `id`.
- **No top-level `speed`/`course`.** Both default to 0, never invented.

## Live result

481 vessels for the Gulf of Guinea, e.g. `ELOBEY 7` (GNQ), `ST ILHAAM`
(NGA), `MV ORITSELAJU 10` (NGA), `MV STEFAN` (NGA), `MT BARWASA` (NGA).

| Metric              | Value                 |
| ------------------- | --------------------- |
| Vessels normalised  | 481                   |
| Validation warned   | 481                   |
| Validation rejected | 8                     |
| Confidence          | 0.60 — `INFERRED`     |
| Round trip          | ~20 s (five datasets) |

All 481 warn because GFW carries no IMO — `missing-mmsi` does not apply, but
the age warning does: these are event-derived observations, correctly banded
**Stale**. They reach the map; their age is shown, not hidden.

## Configuration

`GFW_API_TOKEN` — server-side only. **Never** `VITE_`-prefixed: that would
publish the secret in the client bundle. Read inside the execution boundary
in `gfw.server.ts`; the Authorization header never leaves that module.
