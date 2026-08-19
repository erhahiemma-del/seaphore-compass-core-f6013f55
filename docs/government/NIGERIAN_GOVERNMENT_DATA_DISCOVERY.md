# Nigerian Government Data — Architecture Audit & Discovery Report

**Seaphore · Phase 1 deliverable · no implementation**

Execution order per the brief: audit, discover, register, prioritise —
_then_ build. This document covers steps 1–13. No connector has been
written.

**Every claim below is marked VERIFIED or UNVERIFIED.** Verified means I
retrieved it during this session and quote what came back. Unverified
means I did not check it, and it must not be treated as fact.

---

## Headline finding

**NPA — Priority 1 — is `AUTHORIZATION_REQUIRED`, not `CONNECT NOW`.**

Two independent access controls, both verified:

1. `shippos.nigerianports.gov.ng` returns **HTTP 403** to automated
   requests, and a `/login` route exists (search result title: _"Daily
   Shipping Position - v2 - Log in"_). SHIPPOS v2 is an authenticated
   application.
2. `nigerianports.gov.ng/robots.txt` **explicitly disallows AI crawlers**
   — `ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`,
   `Amazonbot`, `Applebot-Extended`, `meta-externalagent` — and carries
   `Content-Signal: search=yes, ai-train=no, use=reference`.

That is the operator stating how their content may be accessed. I stopped
fetching NPA at that point and did not attempt to work around either
control.

**Consequence for the sprint:** the NPA Daily Shipping Schedule cannot be
acquired by scraping. It requires a data-sharing arrangement with the
Authority. The engineering work is still worth doing — the schema, the
lifecycle and the fusion logic are the hard parts — but it ships as
`CONNECTOR READY — AWAITING ACCESS`, and the UI must say exactly that.

---

## 1. Architecture audit — what already exists

Reuse these. Do not duplicate.

| Concern             | Existing asset                                                                                                      | Verdict for this sprint                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Source registry     | `public.data_sources` + `data_source_health` tables, RLS, admin-write                                               | **Extend** — do not create a new registry table      |
| Connector framework | `src/connectors/framework/BaseEvidenceProvider.ts`, `spec.ts`, `register.ts`, `certification.ts`                    | **Extend** — `GovernmentDataAdapter` derives from it |
| Acquisition layer   | `src/services/ial/` — manager, cache, hash, normalizer, validator, entity-resolver, package-builder                 | Reuse wholesale                                      |
| Provenance          | `NormalizedEvidence` (source, sourceName, grade, observedAt, retrievedAt, freshnessSeconds, hash, providerRecordId) | Already satisfies §16                                |
| Freshness           | `src/services/geospatial/freshness.ts` — bands, recomputed at render                                                | Reuse; already satisfies §20                         |
| Conflict handling   | `src/services/ice/` — conflict, corroboration, correlation, scoring, trust-registry                                 | Already satisfies §18                                |
| Source authority    | `src/services/ice/source-trust.ts`, `trust-registry.ts`                                                             | **Extend** with agency authority                     |
| Confidence          | `src/lib/osint/confidence.ts`, `src/services/reasoning/confidence.ts`                                               | Reuse — do not add a third scale                     |
| Findings model      | `src/services/intelligence/` — `IntelligenceFinding`, `RiskModuleRegistry`                                          | Government modules register here                     |
| Correlation engines | `src/services/eo/` — AIS gap + dark contact                                                                         | Pattern to follow for NPA↔AIS fusion                 |
| Map                 | `src/services/geospatial/` — SGS, layer registry, MapLibre renderer                                                 | New layers register here                             |
| Orchestration       | `src/services/orchestration/` — one intent classifier, workspace planner                                            | Copilot questions route here                         |
| AIS adapters        | `datalastic.adapter.ts` (stub, honest), `spire.adapter.ts`                                                          | Fusion counterparties                                |
| Server secrets      | `.server.ts` pattern (`gfw.server.ts`, `eo.server.ts`)                                                              | Mandatory for any credentials                        |

**Tables that exist:** `ports`, `vessels`, `voyages`, `companies`,
`cargo_items`, `containers`, `manifests`, `agencies`, `evidence`,
`entities`, `signals`, `risk_scores`, `alerts`, plus the ICE/OSINT/OKL
families.

**Tables that do not exist and this domain needs:** `terminals`,
`berths`, `port_calls`, `port_schedules`, `berth_assignments`.

**Nothing found for:** NPA, NCS, NSC, NIWA, NHA, NOSDRA, NUPRC, NIOMR,
NBS, NEMA, NESREA. This is greenfield.

**Note:** `src/adapters/internal/nimasa-levy.adapter.ts` exists.
NIMASA is out of scope per the brief; I have not touched it.

---

## 2. Discovery — verified sources

### NPA — Nigerian Ports Authority · Priority 1

| Field                 | Value                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHIPPOS               | `https://shippos.nigerianports.gov.ng/` — **HTTP 403**, `/login` exists                                                                             |
| Main site             | `https://nigerianports.gov.ng/` — **HTTP 403** to automated fetch                                                                                   |
| Public page           | `https://nigerianports.gov.ng/lagos-port/daily-shipping-position/` (VERIFIED to exist via search; **content not retrieved**)                        |
| Historical artefact   | `https://nigerianports.gov.ng/wp-content/uploads/2017/05/ShipInRivers20Sep17.pdf` — WordPress uploads; Daily Shipping Position published as **PDF** |
| Platform              | WordPress (`/wp-content/`, `/wp-admin/admin-ajax.php` allowed in robots)                                                                            |
| robots.txt            | AI crawlers disallowed; `ai-train=no, use=reference`                                                                                                |
| **Status**            | **`AUTHORIZATION_REQUIRED`**                                                                                                                        |
| Access classification | `AUTHENTICATED_API` (SHIPPOS) / `DOCUMENT` (PDF positions)                                                                                          |

**What I did not do:** I did not probe `/wp-json/`, did not vary user
agent, did not attempt the SHIPPOS login, and did not enumerate the PDF
upload directory. All would be circumvention of a stated control.

**Historical depth:** the 2017 PDF proves positions were published as
documents at least that far back. Whether a complete archive is reachable
is **UNVERIFIED** — enumerating it is exactly what robots.txt forbids.

**Recommended route:** a written request to NPA for either SHIPPOS API
credentials or a scheduled export. This is the single highest-value
unlock in the entire programme.

### NOSDRA — Oil Spill Monitor · Priority 2 — **CONNECT NOW**

| Field          | Value                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL            | `https://oilspillmonitor.ng/`                                                                                                                      |
| Access         | **Public, no authentication** (VERIFIED)                                                                                                           |
| Exports        | **CSV and JSON**, both _filtered_ and _complete dataset_ (VERIFIED — quoted: "Download filtered data as CSV", "Download complete dataset as JSON") |
| Fields         | incident coordinates, dates, operators, volumes                                                                                                    |
| GIS layers     | oil blocks, pipelines, terminals, wetlands, waterbodies, population                                                                                |
| Contact        | `oilspillalerts@nosdra.gov.ng`                                                                                                                     |
| **Status**     | **`EXPORT_CONNECTED` candidate**                                                                                                                   |
| Classification | `OFFICIAL_EXPORT` + `GIS_SERVICE`                                                                                                                  |
| Data class     | `PERIODIC` / `HISTORICAL` — **not** live                                                                                                           |
| Feeds          | Environmental Intelligence, Energy Intelligence, Risk Engine, map layer                                                                            |

**This is the one source ready to build against today.** Exact export URLs
still need capture, and the licence is **UNVERIFIED** → `LICENSE_REVIEW`.

### NBS — National Bureau of Statistics · Priority 3

| Field               | Value                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| E-library           | `https://nigerianstat.gov.ng/elibrary` (VERIFIED)                                     |
| Microdata           | `https://microdata.nigerianstat.gov.ng/` — NADA (VERIFIED, referenced)                |
| Open data           | `https://nigeria.opendataforafrica.org/` (VERIFIED, referenced)                       |
| robots.txt          | **404** — no crawl restrictions published                                             |
| Relevant datasets   | Foreign Trade in Goods (quarterly), Road/Rail Transport Data, Commodity Price Indices |
| Port/shipping stats | **None visible** in the e-library listing                                             |
| API                 | **None advertised** on the e-library                                                  |
| **Status**          | `PUBLIC`                                                                              |
| Classification      | `DOWNLOAD` / `DOCUMENT`                                                               |
| Data class          | `QUARTERLY` → `PERIODIC` / `HISTORICAL`                                               |

Trade statistics are quarterly documents, not an operational feed. Useful
for Trade Intelligence baselines; useless for live awareness. The ODP
portal is the most likely machine-readable route — **UNVERIFIED**.

---

## 3. Discovery — NOT YET VERIFIED

I did not investigate these in this session. **They carry no status
until checked**, and no connector should be scoped against them.

| Agency        | Named systems to investigate                      | Why it matters           |
| ------------- | ------------------------------------------------- | ------------------------ |
| NCS           | National Single Window, B'Odogwu, customs.gov.ng  | Trade/cargo intelligence |
| NSC           | ICTN, Port Process Manual, tariffs, dry ports     | Port cost & logistics    |
| NIWA          | ERIS, inland vessels, jetties, permits            | Inland waterways         |
| NHA           | ENC, bathymetry, tides, wrecks, NtM, WMS/WFS      | Navigation & geospatial  |
| NUPRC         | fields, operators, licences, pipelines, terminals | Energy intelligence      |
| NIOMR         | oceanography, fisheries, waves, currents          | Environmental            |
| NEMA          | flooding, coastal hazards, hazard maps            | Disaster/risk            |
| NESREA        | environmental compliance, permits, incidents      | Compliance               |
| FMMBE         | policy, blue-economy programmes                   | Reference only           |
| Nigerian Navy | publicly released security incidents only         | Maritime security        |

**Excluded by instruction:** NIMASA.

---

## 4. Registry design — extend, do not duplicate

`public.data_sources` already exists with RLS and admin-write policies. Do
**not** create a parallel registry. Add a government extension table
keyed to it, so one source list serves commercial, OSINT and government
alike, and `data_source_health` keeps working unchanged.

```
data_sources (existing)
  id · provider · data_type · kind · status · scope · default_confidence · citation
        │ 1:1
        ▼
government_data_sources (new)
  source_id → data_sources.id
  agency · official_name · system_name
  official_url · documentation_url · api_url · portal_url
  dataset · category · access_method · authentication
  gov_status            ← the 13-value status enum
  live_capability · historical_capability
  refresh_interval · historical_depth · geographic_coverage
  data_format · fields · license
  commercial_use · storage_allowed · redistribution_allowed
  contact · priority · integration_method
  last_checked · last_sync · last_error
```

`scope` on `data_sources` gains `'government'`. Health, freshness and the
existing admin surfaces then work with no change.

---

## 5. Integration priority matrix

| #   | Source                                          | Dataset                                                              | Verified access                        | Status                   | Action                                    |
| --- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- | ------------------------ | ----------------------------------------- |
| 1   | **NOSDRA**                                      | Oil spill incidents                                                  | CSV + JSON export                      | `EXPORT_CONNECTED`       | **CONNECT NOW**                           |
| 2   | **NPA SHIPPOS**                                 | Daily Shipping Schedule, Vessels Expected/Awaiting/At Berth/Departed | Login required; AI crawlers disallowed | `AUTHORIZATION_REQUIRED` | **CONNECTOR READY — AWAITING ACCESS**     |
| 3   | **NPA**                                         | Historical Daily Shipping Position                                   | PDF on WordPress; crawling disallowed  | `AUTHORIZATION_REQUIRED` | Request archive via agreement             |
| 4   | **NBS**                                         | Foreign Trade in Goods, Transport                                    | Public documents                       | `PUBLIC`                 | Connect through export (manual/scheduled) |
| 5   | **NBS ODP**                                     | Open Data for Africa                                                 | Portal exists                          | `UNVERIFIED`             | Verify next                               |
| 6   | NCS, NSC, NIWA, NHA, NUPRC, NIOMR, NEMA, NESREA | —                                                                    | —                                      | `UNVERIFIED`             | Discovery required                        |

### Classification per §13 of the brief

- **CONNECT NOW** — NOSDRA
- **CONNECT THROUGH EXPORT** — NBS (documents), NOSDRA (bulk)
- **CONNECT THROUGH GIS** — NOSDRA map layers; NHA if it publishes WMS/WFS (unverified)
- **AUTHORIZATION REQUIRED** — NPA SHIPPOS, NPA historical
- **FUTURE CONNECTOR** — NCS, NSC, NIWA, NUPRC, NIOMR, NEMA, NESREA
- **NOT AVAILABLE** — none confirmed; absence of verification is not absence of data

---

## 6. NPA data model — build now, connect later

The schema is independent of access, and getting it right is the durable
work. The brief's central constraint:

> Do not flatten this into only a vessel record. It is a PORT SCHEDULE
> EVENT.

So `PortSchedule` is a first-class entity preserving
**VESSEL → EXPECTED → PORT → TERMINAL**, and the port-call lifecycle is a
state machine over observations from several sources:

```
EXPECTED ──▶ APPROACHING ──▶ ARRIVED ──▶ AWAITING BERTH ──▶ AT BERTH ──▶ DEPARTED
   NPA          AIS            AIS+NPA        NPA             NPA          NPA+AIS
```

Each transition keeps the evidence from every contributing source. Per
§18, a conflicting ETA (NPA 16:30, SeaVantage 15:47, Datalastic 16:10) is
stored as three observations, never overwritten — the existing ICE
conflict machinery already does this.

Entity resolution per §17: IMO/MMSI/call-sign primary; name+port+ETA only
as corroboration, never as a sole merge key, with `match_confidence`,
`match_method` and `match_evidence` retained.

---

## 7. What I recommend building first

1. **Registry migration + admin surface** — `government_data_sources`,
   seeded with every source above at its _verified_ status. This makes
   the Control Centre (§26) truthful on day one, including the rows that
   say `AUTHORIZATION_REQUIRED`.
2. **`GovernmentDataAdapter`** over `BaseEvidenceProvider`, with the §15
   interface and CSV/JSON/GeoJSON support.
3. **NOSDRA connector** — the only source that can be exercised
   end-to-end today, which makes it the right one to prove the framework.
4. **NPA schema + lifecycle + fusion**, registered
   `CONNECTOR READY — AWAITING ACCESS`, with tests driven by fixtures
   explicitly labelled `DEMO DATA`.

Sequencing NOSDRA before NPA is deliberate: it validates the adapter
against real bytes rather than against fixtures, so when NPA access
arrives the framework is already proven.

---

## 8. Open questions for you

1. **Does Seaphore have, or can it obtain, an NPA data-sharing
   agreement?** This gates Priority 1 entirely. Everything else in the
   NPA workstream is preparation.
2. **Is there an existing NPA/NCS institutional relationship** I should
   know about before assuming public-only access?
3. **Licence position on NOSDRA** — publicly downloadable is not
   automatically commercially reusable. I have marked it
   `LICENSE_REVIEW`; someone needs to read the terms before it feeds a
   commercial product.
4. **Should I continue discovery** on the ten unverified agencies before
   building, or build the registry + NOSDRA connector first and discover
   in parallel?

---
---

# Phase 6 — Agency Discovery

**Verified 20 August 2026.** Each finding below was retrieved during this
session. Anything not retrieved is marked `UNVERIFIED` and carries no
status.

## Method and its limit

Verification was by permitted retrieval and search only. Two agencies
(NPA, NCS) publish robots.txt files that disallow automated AI agents; I
respected both and did not vary user agent, drive a browser at them, or
otherwise work around the control. Where that blocked verification, the
finding is *"access control observed"* — not *"no data exists"*.

---

## NUPRC — Nigerian Upstream Petroleum Regulatory Commission

| Item | Finding | Basis |
| ---- | ------- | ----- |
| Official site | `https://www.nuprc.gov.ng/` | VERIFIED |
| **OGISP** | `https://ogisp.nuprc.gov.ng/` — **permit application portal, login required.** Not a data repository. No datasets, no map, no WMS/WFS/ArcGIS REST, no export, no API | **VERIFIED** |
| Other portals | `hostcomply.nuprc.gov.ng`, `nogec.nuprc.gov.ng`, `elps.nuprc.gov.ng`, `ems.nuprc.gov.ng` — all transactional | VERIFIED (listed) |
| Reports / publications | `/reports`, `/publications` | VERIFIED (listed) |
| **Datasets** | **None verified** | — |

**Access method:** `AUTHENTICATED_SYSTEM` (OGISP) · `DOCUMENT` (reports)
**Freshness:** `DOCUMENT` · **Status:** `UNVERIFIED` for any dataset

The assumption that a regulator publishes machine-readable asset data did
not survive contact. OGISP is where operators *apply for permits*, not
where the public reads the register.

---

## NCS — Nigerian Customs Service

| Item | Finding | Basis |
| ---- | ------- | ----- |
| Official site | `https://customs.gov.ng/` — **HTTP 403** to automated request | **VERIFIED** |
| robots.txt | Disallows **ClaudeBot, GPTBot, CCBot, Google-Extended, Bytespider, Amazonbot, Applebot-Extended, meta-externalagent, CloudflareBrowserRenderingCrawler**. `Content-Signal: search=yes, ai-train=no, use=reference`. Cites EU Directive 2019/790 Art. 4 | **VERIFIED** |
| Sitemap | `https://customs.gov.ng/sitemap.xml` | VERIFIED |
| National Single Window / B'Odogwu | Not reached | `UNVERIFIED` |
| **Datasets** | **None verified** | — |

**Access method:** `UNKNOWN` · **Status:** `AUTHORIZATION_REQUIRED`

Identical crawler policy to NPA — the same managed configuration.

**Answering the brief's most important question** — *can Seaphore
legitimately obtain a machine-readable customs dataset joinable to
vessel → port → cargo → importer → commodity → value?*

**Not through any route verified in this session.** NBS publishes
quarterly *aggregate* trade statistics, which cannot be joined to a
vessel or a consignment. A per-declaration join requires NCS
authorization, and that is the single highest-value unlock after NPA.

---

## NHA — National Hydrographic Agency

Nigeria's hydrographic authority since **21 February 2022**, when the
role transferred from the Nigerian Navy Hydrographic Office (NNHO).
NNHO material is therefore historical.

| Item | Finding | Basis |
| ---- | ------- | ----- |
| Official site | `https://nha.gov.ng/` | VERIFIED |
| Notices to Mariners | `https://nha.gov.ng/notices-to-mariners/` | VERIFIED (exists) |
| Tides | `https://nha.gov.ng/tides/` | VERIFIED (exists) |
| Crowd Source Bathymetry | `https://nha.gov.ng/crowd-source-bathymetry/` | VERIFIED (exists) |
| **Marine Data Repository** | `https://nha.gov.ng/marine-data-repository/` — **"Coming Soon…". Not launched.** No datasets, no API, no GIS, no registration | **VERIFIED** |
| Charts / ENC | Supplied **on demand** via web link or paper sheet; no open download | SECONDARY_SOURCE |
| GIS services | **None found.** No WMS, WFS, ArcGIS REST or GeoJSON | VERIFIED (absent) |
| Contact | `info@nha.gov.ng`, `msi@nha.gov.ng` | VERIFIED |

**Access method:** `DOCUMENT` / `MANUAL_ONLY` · **Status:** `UNVERIFIED`

The most useful finding is the negative one: the repository that would
serve this data **does not exist yet**. Nothing should be scheduled
against it. The contact addresses are the actionable output.

---

## NIWA — National Inland Waterways Authority

| Item | Finding | Basis |
| ---- | ------- | ----- |
| Official site | `https://niwa.gov.ng/` | VERIFIED |
| **ERIS** | `https://eris.niwa.gov.ng/` — Electronic Registration Information System (vessel registration). Access model not established | VERIFIED (exists) |
| Statistics Portal | Referenced in footer, URL not captured | `UNVERIFIED` |
| **Live tide charts** | `https://niwa.port-log.net/live/display.php` — third-party tide-gauge network. **Possibly the only live Nigerian government-linked feed found.** Terms unverified | VERIFIED (exists) |
| Regulations | Tariff structure, transport regulations, SLA — PDFs | VERIFIED |
| **Datasets** | None with verified access | — |

**Access method:** `AUTHENTICATED_SYSTEM` (ERIS) · `DOCUMENT`
**Status:** `UNVERIFIED`

The tide feed is worth a follow-up: it is hosted on a third-party
platform, so both the data terms and the platform's terms need reading.

---

## Not reached this session

**NSC, NIOMR, NEMA, NESREA** were not investigated. I ran out of
verification budget before reaching them, and I would rather say so than
file four plausible-looking rows.

They keep no status and no tier above Tier 5, and nothing should be
scoped against them.

---

## Phase 6 summary

| Agency | Datasets verified | Status |
| ------ | ----------------- | ------ |
| NUPRC | 0 | Portals are transactional, not data |
| NCS | 0 | Crawler-blocked; `AUTHORIZATION_REQUIRED` |
| NHA | 0 | Repository "Coming Soon" |
| NIWA | 0 | ERIS + a third-party tide feed to follow up |
| NSC, NIOMR, NEMA, NESREA | — | Not investigated |

**Phase 6 verified no new connectable dataset.** NOSDRA remains the only
government source with a confirmed machine-readable export, and its
licence is still unread.

That is a disappointing result, and reporting it accurately is more
useful than eight optimistic rows. The pattern is consistent: Nigerian
agencies publish *transactional portals* for regulated parties and
*documents* for the public. Open machine-readable data is the exception,
and where it exists (NOSDRA) it is worth prioritising heavily.
