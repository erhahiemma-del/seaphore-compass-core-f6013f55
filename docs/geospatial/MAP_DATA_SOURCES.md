# Map Data Sources

**Seaphore · GIP G5.5.2 · canonical**

What feeds the Live Command Map, and what does not.

**Status:** `CONNECTED` (flowing) · `PROTOTYPE` (built, unvalidated) ·
`PLANNED` (specified, unbuilt) · `FUTURE` (under consideration) ·
`TERMS REQUIRED` (feasible, awaiting terms).

---

## Currently feeding the map

| Source                                | Status                             | Layers fed             |
| ------------------------------------- | ---------------------------------- | ---------------------- |
| CARTO Dark Matter (OSM-based)         | **CONNECTED**                      | basemap                |
| Stadia Alidade Smooth Dark            | **CONNECTED** (fallback only)      | basemap on style error |
| `public/geojson/nigeria-eez.geojson`  | **CONNECTED** (static, simplified) | `eezBoundary`          |
| `src/services/geospatial/constants.ts` (port + anchorage registry) | **CONNECTED** (static reference) | `ports`, `anchorages` |

### Vessel positions — NOT CONNECTED

There is **no vessel data source wired to the map**. The default is
`EmptyVesselSource`. The vessel layer, symbology, interaction handlers, and
incremental update path are all implemented and exercised by tests, but no
connector supplies positions.

**Why not:** the Canonical UIP (`@/services/ife/unified`) carries identity,
fused evidence, provenance, freshness, and OSAE assessments — **but no
positional field**. There is no honest UIP → `Vessel` mapping to write.
Inventing one would be fabricated backend data.

**To connect one:** implement `VesselSource` (`list`, and optionally
`subscribe`). A source with a push channel feeds `VesselUpdateEngine.applyPatch`
directly, which is the path that avoids a full re-render per position report.

---

## EEZ boundary accuracy

`public/geojson/nigeria-eez.geojson` is **APPROXIMATE** and self-declares this
in its `metadata` and feature properties. The landward edge follows the Nigerian
coastline; the seaward edge is an approximate 200 nm envelope and **does not**
encode negotiated tri-points with Benin, Cameroon, Equatorial Guinea, or São
Tomé and Príncipe.

**It is not a legal or navigational boundary.** Replace with the official
polygon from VLIZ Maritime Boundaries (marineregions.org) or the Nigerian
Hydrographic Office before any enforcement use.

---

## Planned vessel and AIS sources

| Source               | Status                               | Data                                    | Layers                           |
| -------------------- | ------------------------------------ | --------------------------------------- | -------------------------------- |
| Global Fishing Watch | CONNECTED at IAL, **not to the map** | positions, fishing events, dark periods | `vessels`, `aisTrack`, `fishing` |
| MarineTraffic        | PLANNED                              | real-time AIS, identity, port calls     | `vessels` (primary)              |
| Spire Maritime       | PLANNED                              | satellite AIS, offshore                 | `vessels`, dark activity         |
| Datalastic           | PLANNED                              | voyage history, ETA                     | `aisTrack`                       |

## Identity, sanctions, ownership

| Source          | Status           | Layers                             |
| --------------- | ---------------- | ---------------------------------- |
| OpenSanctions   | CONNECTED at IAL | `sanctions-screen` (layer unbuilt) |
| OFAC SDN        | CONNECTED at IAL | `sanctions-screen`                 |
| UN Consolidated | CONNECTED at IAL | `sanctions-screen`                 |
| OpenCorporates  | CONNECTED at IAL | `ownership-flags`                  |
| IMO GISIS       | TERMS REQUIRED   | card identity fields               |
| Equasis         | TERMS REQUIRED   | compliance, PSC history            |

> "CONNECTED at IAL" means the connector exists and feeds the intelligence
> pipeline. It does **not** mean the map consumes it. No sanctions, ownership,
> or compliance layer is built yet.

## Environment and infrastructure

| Source                   | Status           | Layers                                  |
| ------------------------ | ---------------- | --------------------------------------- |
| NOAA / Open-Meteo Marine | CONNECTED at IAL | `weather` (pending-source)              |
| EMODnet                  | PLANNED          | bathymetry, oil infrastructure          |
| IMB Piracy / MDAT-GoG    | PLANNED          | piracy-security                         |
| NIMASA Portal            | PLANNED          | manifest anomalies, compliance, revenue |
| Sentinel-1 SAR           | FUTURE           | dark-vessel detection                   |

---

## The Golden Rule

No map module may query `ice_fused_intelligence`, `osint_evidence`,
`osint_raw`, or any connector directly. Data enters through a `VesselSource`
implementation that resolves via the Intelligence Orchestrator.

Verify with:

```bash
grep -rn "ice_fused_intelligence\|osint_evidence\|osint_raw" src/services/geospatial/ src/features/maritime/
```

Expected: no results.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
