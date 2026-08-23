# Seaphore Source Readiness Matrix

**Discovery complete · 20 August 2026 · eleven agencies assessed**

Two independent dimensions, so "technically accessible" can never be
mistaken for "commercially usable".

```
ACCESS_STATUS × COMMERCIAL_STATUS → PRODUCTION_READINESS

TECHNICALLY_CONNECTABLE + CLEAR           → READY
TECHNICALLY_CONNECTABLE + LICENSE_REVIEW  → LICENSE_BLOCKED
AUTHORIZATION_REQUIRED  + anything        → AUTHORIZATION_BLOCKED
NOT_AVAILABLE           + anything        → TECHNICAL_BLOCKED
UNVERIFIED              + anything        → UNVERIFIED
```

---

## Matrix

| Agency     | Dataset                                    | Source                          | Type          | Freshness           | Hist. depth | Access                                 | Commercial       | **Readiness**             | API          | GIS | Export       | Unique value                                  | Capability                                 | Priority |
| ---------- | ------------------------------------------ | ------------------------------- | ------------- | ------------------- | ----------- | -------------------------------------- | ---------------- | ------------------------- | ------------ | --- | ------------ | --------------------------------------------- | ------------------------------------------ | -------- |
| **NOSDRA** | Oil spill incidents                        | oilspillmonitor.ng              | Register      | `PERIODIC`          | Unverified  | `TECHNICALLY_CONNECTABLE`              | `LICENSE_REVIEW` | **LICENSE_BLOCKED**       | ✗            | ✓   | **CSV+JSON** | **UNIQUE** — statutory spill register         | `ENVIRONMENTAL_INTELLIGENCE`               | **1**    |
| **NOSDRA** | Oil blocks, pipelines, terminals, wetlands | ”                               | Geospatial    | `STATIC`            | —           | `TECHNICALLY_CONNECTABLE`              | `LICENSE_REVIEW` | **LICENSE_BLOCKED**       | ✗            | ✓   | Unverified   | **UNIQUE** — only verified gov GIS            | `LIVE_MARITIME_MAP`, `ENERGY_INTELLIGENCE` | **2**    |
| **NPA**    | Vessels Expected                           | shippos                         | Schedule      | `DAILY`             | PDFs ≥2017  | `AUTHORIZATION_REQUIRED`               | `UNKNOWN`        | **AUTHORIZATION_BLOCKED** | ?            | ✗   | Observed     | **UNIQUE** — no substitute exists             | `DAILY_SHIPPING_SCHEDULE`                  | **3**    |
| **NPA**    | Awaiting Berth / At Berth / Departed       | ”                               | Operational   | `DAILY`             | ”           | `AUTHORIZATION_REQUIRED`               | `UNKNOWN`        | **AUTHORIZATION_BLOCKED** | ?            | ✗   | Observed     | **UNIQUE**                                    | `PORT_DIGITAL_TWIN`                        | **3**    |
| **NCS**    | Customs declarations                       | customs.gov.ng                  | Transactional | `UNKNOWN`           | Unverified  | `AUTHORIZATION_REQUIRED`               | `UNKNOWN`        | **AUTHORIZATION_BLOCKED** | ?            | ✗   | ✗            | **UNIQUE** — highest ceiling                  | `CARGO_INTELLIGENCE`, `TRADE_INTELLIGENCE` | **4**    |
| **NIWA**   | Live tide charts                           | niwa.port-log.net               | Sensor        | **Possibly `LIVE`** | Unverified  | `UNVERIFIED`                           | `UNKNOWN`        | **UNVERIFIED**            | ?            | ✗   | ?            | **COMPLEMENTARY** — only live candidate found | `PORT_DIGITAL_TWIN`                        | **5**    |
| **NSC**    | Freight rates, port tariffs                | shipperscouncil.gov.ng          | Reference     | `PERIODIC`          | 2018–2024   | `TECHNICALLY_CONNECTABLE`              | `LICENSE_REVIEW` | **LICENSE_BLOCKED**       | ✗            | ✗   | **PDF only** | **COMPLEMENTARY** — official tariffs          | `REPORTING`                                | 6        |
| **NSC**    | Annual reports w/ freight statistics       | ”                               | Document      | `PERIODIC`          | 2018–2024   | `TECHNICALLY_CONNECTABLE`              | `LICENSE_REVIEW` | **LICENSE_BLOCKED**       | ✗            | ✗   | PDF          | `LOW_INCREMENTAL_VALUE`                       | `REPORTING`                                | 8        |
| **NSC**    | Nigerian Ports Process Manual, SOP         | ”                               | Document      | `STATIC`            | —           | `TECHNICALLY_CONNECTABLE`              | `LICENSE_REVIEW` | **LICENSE_BLOCKED**       | ✗            | ✗   | PDF          | `REFERENCE_ONLY`                              | `COPILOT`                                  | 9        |
| **NIOMR**  | Species occurrence records                 | **obis.org/organization/15920** | Biodiversity  | `PERIODIC`          | Unverified  | `TECHNICALLY_CONNECTABLE` **via OBIS** | `UNKNOWN`        | **UNVERIFIED**            | **OBIS API** | ✗   | ✓            | **COMPLEMENTARY** — fisheries only            | `ENVIRONMENTAL_INTELLIGENCE`               | 7        |
| **NIOMR**  | Waves, currents, sea state, tides          | niomr.gov.ng                    | —             | —                   | —           | `NOT_AVAILABLE`                        | —                | **TECHNICAL_BLOCKED**     | ✗            | ✗   | ✗            | **NO_VERIFIED_DATASET**                       | —                                          | —        |
| **NHA**    | Marine Data Repository                     | nha.gov.ng                      | —             | —                   | —           | `NOT_AVAILABLE` — "Coming Soon"        | —                | **TECHNICAL_BLOCKED**     | ✗            | ✗   | ✗            | Would be UNIQUE                               | `NAVIGATION_INTELLIGENCE`                  | Re-check |
| **NHA**    | Charts / ENC                               | ”                               | Chart         | `PERIODIC`          | Unverified  | `AUTHORIZATION_REQUIRED`               | Likely paid      | **AUTHORIZATION_BLOCKED** | ✗            | ✗   | On demand    | **UNIQUE**                                    | `NAVIGATION_INTELLIGENCE`                  | Later    |
| **NUPRC**  | OGISP                                      | ogisp.nuprc.gov.ng              | Portal        | —                   | —           | `AUTHENTICATED`                        | —                | **AUTHORIZATION_BLOCKED** | ✗            | ✗   | ✗            | **NO_VERIFIED_DATASET**                       | —                                          | —        |
| **NEMA**   | Disaster / hazard data                     | nema.gov.ng                     | —             | —                   | —           | `NOT_AVAILABLE`                        | —                | **TECHNICAL_BLOCKED**     | ✗            | ✗   | ✗            | **NO_VERIFIED_DATASET**                       | —                                          | —        |
| **NESREA** | Facility registers, permits, monitoring    | nesrea.gov.ng                   | —             | —                   | —           | `NOT_AVAILABLE`                        | —                | **TECHNICAL_BLOCKED**     | ✗            | ✗   | ✗            | **NO_VERIFIED_DATASET**                       | —                                          | —        |
| **NESREA** | Accredited consultants list                | ”                               | Reference     | `STATIC`            | —           | `TECHNICALLY_CONNECTABLE`              | `UNKNOWN`        | **UNVERIFIED**            | ✗            | ✗   | Web list     | `LOW_VALUE`                                   | —                                          | —        |
| **NBS**    | Foreign Trade in Goods                     | nigerianstat.gov.ng             | Statistics    | `QUARTERLY`         | Multi-year  | `TECHNICALLY_CONNECTABLE`              | `LICENSE_REVIEW` | **LICENSE_BLOCKED**       | ✗            | ✗   | Document     | `DUPLICATIVE` — TradeAtlas finer              | `TRADE_INTELLIGENCE`                       | 10       |

---

## Phase 6B findings

### NSC — the only new source with retrievable content

Publishes **freight rates, haulage rates and port tariffs**, plus annual
reports carrying freight statistics (2018–2024) and the Nigerian Ports
Process Manual. All **PDF**. No CSV/XLSX, no API, no GIS, no data portal.

**Incremental value:** the tariff and freight-rate documents are
`COMPLEMENTARY` — official Nigerian port cost data that NPA, AIS and
TradeAtlas do not carry. The annual reports are `LOW_INCREMENTAL_VALUE`
(aggregate statistics TradeAtlas covers at finer grain). The Process
Manual is `REFERENCE_ONLY` but genuinely useful as Copilot grounding.

**Access:** `TECHNICALLY_CONNECTABLE` (documents) · **Readiness:**
`LICENSE_BLOCKED`

### NIOMR — no ocean-state data; biodiversity via OBIS

The website carries research and news. **No waves, currents, sea state,
temperature or tide datasets were found** — `NO_VERIFIED_DATASET` for
everything the brief prioritised.

One real route exists: NIOMR is a registered data provider to **OBIS**
(`obis.org/organization/15920`), which publishes species-occurrence
records with an open API. That is **fisheries/biodiversity data, not
ocean state**, and must not be presented as the latter.

**Verdict:** `COMPLEMENTARY` for fisheries only. For navigation and
ocean conditions, NOAA/Open-Meteo already in the IAL are the better
route — NIOMR is `DUPLICATIVE` there and worse-covered.

### NEMA — no structured data

News, press releases, relief updates, event announcements. The National
Emergency Operations Centre is described as collating data, but **no
public access mechanism is documented**. No downloads, no GIS, no API.

**`NO_VERIFIED_DATASET`** · `TECHNICAL_BLOCKED`

### NESREA — legislation, not data

The NESREA Act, 35 environmental regulations, service portals (NEIMS,
NICS, NSW — all transactional), news, and a list of accredited
consultants. **No facility register, no permits database, no monitoring
data, no incidents, no GIS.**

**Versus NOSDRA:** `DUPLICATIVE_INFORMATION` in intent and worse in
practice — NOSDRA publishes an actual machine-readable spill register;
NESREA publishes the law. **Do not prioritise.**

---

## Limited verification pass — no material change

| Source | Change                                          |
| ------ | ----------------------------------------------- |
| NPA    | None. `AUTHORIZATION_REQUIRED`, connector ready |
| NOSDRA | None. `LICENSE_REVIEW` stands                   |
| NCS    | None. Crawler-blocked                           |
| NUPRC  | None. OGISP transactional                       |
| NIWA   | None. Tide feed still the open question         |
| NHA    | None. Repository still "Coming Soon"            |

---

## The pattern, now with eleven agencies

Nigerian agencies publish **transactional portals** for regulated parties
and **PDF documents** for the public. Open machine-readable government
data is the exception, not the norm.

Across eleven agencies, exactly **one** publishes a structured, openly
downloadable dataset: **NOSDRA**.

Two of eight agencies investigated across Phases 6 and 6B yielded any
retrievable content at all (NOSDRA, NSC), and only one of those is
machine-readable.

That is the complete evidence base. The engineering decision should be
made against it rather than against the assumption that more discovery
will change it.
