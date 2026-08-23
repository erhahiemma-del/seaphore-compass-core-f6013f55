# Seaphore Government Data Opportunity Matrix

**Verified facts only.** A row marked `UNVERIFIED` means nobody has
checked it — it is not a soft yes.

---

## Verified sources

| Agency     | Dataset                                    | Official URL                  | Data Role                 | Live | Daily | Historical                         | API            | GIS     | Export         | Auth             | Refresh    | Coverage           | License | Commercial | Value        | Capability                   | Status                   | Pri |
| ---------- | ------------------------------------------ | ----------------------------- | ------------------------- | ---- | ----- | ---------------------------------- | -------------- | ------- | -------------- | ---------------- | ---------- | ------------------ | ------- | ---------- | ------------ | ---------------------------- | ------------------------ | --- |
| **NPA**    | Daily Shipping Schedule — Vessels Expected | shippos.nigerianports.gov.ng  | `PORT_CALL_INTELLIGENCE`  | No   | Yes   | Observed                           | Unverified     | No      | **Observed**   | Portal + login   | Unverified | Nigerian ports     | Unread  | Unknown    | **CRITICAL** | `DAILY_SHIPPING_SCHEDULE`    | `INTEGRATION_PENDING`    | 1   |
| **NPA**    | Vessels Awaiting Berth                     | ”                             | `PORT_OPERATIONS`         | No   | Yes   | Observed                           | Unverified     | No      | Observed       | ”                | Unverified | ”                  | Unread  | Unknown    | **CRITICAL** | `PORT_DIGITAL_TWIN`          | `INTEGRATION_PENDING`    | 1   |
| **NPA**    | Vessels At Berth                           | ”                             | `PORT_OPERATIONS`         | No   | Yes   | Observed                           | Unverified     | No      | Observed       | ”                | Unverified | ”                  | Unread  | Unknown    | **CRITICAL** | `PORT_DIGITAL_TWIN`          | `INTEGRATION_PENDING`    | 1   |
| **NPA**    | Departed Vessels                           | ”                             | `PORT_CALL_INTELLIGENCE`  | No   | Yes   | Observed                           | Unverified     | No      | Observed       | ”                | Unverified | ”                  | Unread  | Unknown    | **HIGH**     | `MARITIME_REPLAY`            | `INTEGRATION_PENDING`    | 1   |
| **NPA**    | Historical Daily Shipping Position         | nigerianports.gov.ng          | `PORT_CALL_INTELLIGENCE`  | No   | No    | **Yes — PDFs observed 2017, 2018** | No             | No      | Document       | Crawlers blocked | n/a        | ”                  | Unread  | Unknown    | HIGH         | `MARITIME_REPLAY`            | `AUTHORIZATION_REQUIRED` | 3   |
| **NOSDRA** | Oil spill incidents                        | oilspillmonitor.ng            | `ENVIRONMENTAL_INCIDENTS` | No   | No    | **Yes**                            | No             | **Yes** | **CSV + JSON** | **None**         | Unverified | Niger Delta, coast | Unread  | Unknown    | HIGH         | `ENVIRONMENTAL_INTELLIGENCE` | `PUBLIC`                 | 2   |
| **NOSDRA** | Oil blocks, pipelines, terminals, wetlands | ”                             | `GEOSPATIAL`              | No   | No    | Static                             | No             | **Yes** | Unverified     | None             | n/a        | ”                  | Unread  | Unknown    | MEDIUM       | `LIVE_MARITIME_MAP`          | `PUBLIC`                 | 4   |
| **NBS**    | Foreign Trade in Goods                     | nigerianstat.gov.ng/elibrary  | `TRADE_CUSTOMS`           | No   | No    | Yes                                | No             | No      | Document       | None             | Quarterly  | Nigeria            | Unread  | Unknown    | MEDIUM       | `TRADE_INTELLIGENCE`         | `PUBLIC`                 | 3   |
| **NBS**    | Road / Rail transport                      | ”                             | `ECONOMIC_STATISTICS`     | No   | No    | Yes                                | No             | No      | Document       | None             | Quarterly  | Nigeria            | Unread  | Unknown    | LOW          | `REPORTING`                  | `PUBLIC`                 | 4   |
| **NBS**    | Open Data for Africa portal                | nigeria.opendataforafrica.org | `ECONOMIC_STATISTICS`     | ?    | ?     | ?                                  | **Unverified** | ?       | ?              | ?                | ?          | Nigeria            | Unread  | Unknown    | MEDIUM       | `TRADE_INTELLIGENCE`         | `UNVERIFIED`             | 3   |
| **NBS**    | NADA microdata                             | microdata.nigerianstat.gov.ng | `ECONOMIC_STATISTICS`     | ?    | ?     | Yes                                | ?              | ?       | ?              | ?                | Nigeria    | Unread             | Unknown | LOW        | `REPORTING`  | `UNVERIFIED`                 | 4                        |

**No dataset above is classified `LIVE`.** NPA's is a daily snapshot;
NOSDRA's is an incident register; NBS is quarterly. Nothing has been
verified as real-time, so nothing is labelled real-time.

---

## Not yet investigated

Listed so they are not forgotten, with no status claimed. Each needs the
full sequence — discover → verify → classify → assess access → assess
licence → assess value — before it earns a row above.

| Agency                 | Systems to investigate                 | Likely data role                      | Why it could matter             |
| ---------------------- | -------------------------------------- | ------------------------------------- | ------------------------------- |
| NCS                    | National Single Window, B'Odogwu       | `TRADE_CUSTOMS`, `CARGO_INTELLIGENCE` | Cargo and importer intelligence |
| NSC                    | ICTN, Port Process Manual, tariffs     | `SHIPPING_LOGISTICS`                  | Port cost and process           |
| NIWA                   | ERIS, jetties, permits                 | `INLAND_WATERWAYS`                    | Inland vessel movement          |
| Hydrographic authority | ENC, bathymetry, tides, wrecks, NtM    | `HYDROGRAPHY`                         | Navigation, WMS/WFS possible    |
| NUPRC                  | Fields, operators, licences, pipelines | `ENERGY`                              | Energy infrastructure context   |
| NIOMR                  | Oceanography, fisheries, currents      | `OCEANOGRAPHY`                        | Environmental context           |
| NEMA                   | Flooding, coastal hazards              | `DISASTER`                            | Risk context                    |
| NESREA                 | Compliance, permits, incidents         | `ENVIRONMENT`                         | Regulatory context              |

---

## Out of scope

**NIMASA** — excluded by instruction. No connector, no assumed access, no
fabricated data. Seaphore's capabilities do not depend on it.

---

## Reading the columns

- **Live** — verified continuous or near-continuous. Never asserted
  without proof.
- **Export** — _Observed_ means the control was seen by a human;
  _Verified_ would mean Seaphore retrieved a file from it. Nothing is
  Verified yet.
- **Historical** — _Observed_ means artefacts exist (e.g. NPA's PDFs);
  systematic access is a separate question.
- **License / Commercial** — _Unread_ everywhere. Publicly downloadable
  is not commercially reusable, and no source may feed commercial output
  until read.
- **Status** — from the registry's thirteen-value vocabulary.

---

## Where this leaves the programme

One source is technically connectable today (NOSDRA), and its licence is
unread. Five NPA datasets have production-ready connectors awaiting a
route. Eight agencies are uninvestigated.

That is a smaller verified surface than the ambition implies, and stating
it plainly is more useful than a matrix full of optimistic cells.

---

---

# Phase 6 additions (verified 20 Aug 2026)

| Agency    | System                 | Dataset                    | URL                                | Access Method          | Auth            | Format     | Data Role          | Freshness           | Historical | License         | Value        | Use Case              | Status                       |
| --------- | ---------------------- | -------------------------- | ---------------------------------- | ---------------------- | --------------- | ---------- | ------------------ | ------------------- | ---------- | --------------- | ------------ | --------------------- | ---------------------------- |
| **NUPRC** | OGISP                  | _(none — permit portal)_   | ogisp.nuprc.gov.ng                 | `AUTHENTICATED_SYSTEM` | Login           | —          | `ENERGY`           | `UNKNOWN`           | —          | Unread          | —            | —                     | `UNVERIFIED`                 |
| **NUPRC** | Website                | Reports & publications     | nuprc.gov.ng/reports               | `DOCUMENT`             | None            | PDF        | `ENERGY`           | `DOCUMENT`          | Unverified | Unread          | LOW          | `REPORTING`           | `PUBLIC`                     |
| **NCS**   | customs.gov.ng         | _(none verified)_          | customs.gov.ng                     | `UNKNOWN`              | Crawler-blocked | —          | `TRADE_CUSTOMS`    | `UNKNOWN`           | Unverified | Unread          | **CRITICAL** | `TRADE_INTELLIGENCE`  | `AUTHORIZATION_REQUIRED`     |
| **NHA**   | Marine Data Repository | _(not launched)_           | nha.gov.ng/marine-data-repository  | `UNKNOWN`              | Unknown         | —          | `HYDROGRAPHY`      | `UNKNOWN`           | —          | Unread          | HIGH         | `LIVE_MARITIME_MAP`   | `UNVERIFIED` — "Coming Soon" |
| **NHA**   | —                      | Notices to Mariners        | nha.gov.ng/notices-to-mariners     | `DOCUMENT`             | None            | Unverified | `HYDROGRAPHY`      | `PERIODIC`          | Unverified | Unread          | MEDIUM       | `LIVE_MARITIME_MAP`   | `PUBLIC`                     |
| **NHA**   | —                      | Tides                      | nha.gov.ng/tides                   | `UNKNOWN`              | None            | Unverified | `HYDROGRAPHY`      | `UNKNOWN`           | Unverified | Unread          | MEDIUM       | `PORT_DIGITAL_TWIN`   | `UNVERIFIED`                 |
| **NHA**   | —                      | Charts / ENC               | nha.gov.ng                         | `MANUAL_ONLY`          | On demand       | Paper/ENC  | `HYDROGRAPHY`      | `PERIODIC`          | Unverified | **Likely paid** | HIGH         | `LIVE_MARITIME_MAP`   | `AUTHORIZATION_REQUIRED`     |
| **NIWA**  | ERIS                   | Inland vessel registration | eris.niwa.gov.ng                   | `AUTHENTICATED_SYSTEM` | Unverified      | —          | `INLAND_WATERWAYS` | `UNKNOWN`           | Unverified | Unread          | MEDIUM       | `VESSEL_INTELLIGENCE` | `UNVERIFIED`                 |
| **NIWA**  | port-log.net           | **Live tide charts**       | niwa.port-log.net/live/display.php | `UNKNOWN`              | None apparent   | Unverified | `HYDROGRAPHY`      | **Possibly `LIVE`** | Unverified | **Third-party** | MEDIUM       | `PORT_DIGITAL_TWIN`   | `UNVERIFIED` — verify next   |

## Not investigated

**NSC · NIOMR · NEMA · NESREA** — no rows. Not reached this session.

## Incremental value

| Source | Adds beyond existing Seaphore capability     | Verdict                                                          |
| ------ | -------------------------------------------- | ---------------------------------------------------------------- |
| NCS    | Customs declarations joinable to a port call | **Unique — highest ceiling**                                     |
| NHA    | Depth, hazards, tides                        | **Unique** (when the repository opens)                           |
| NIWA   | Inland waterways — invisible to maritime AIS | **Unique**                                                       |
| NUPRC  | Licence/operator attribution                 | Unique in principle; nothing published                           |
| NBS    | Aggregate trade statistics                   | `LOW_INCREMENTAL_VALUE` — TradeAtlas is finer-grained            |
| NESREA | Environmental compliance                     | `LOW_INCREMENTAL_VALUE` — overlaps NOSDRA (pending verification) |
