# Seaphore Data Source Priority

**Tiering by what can be acted on, not by what sounds valuable.**

A source's tier reflects its **access reality**, not its potential. NPA is
the most valuable government source in the programme and sits in Tier 3,
because value and reachability are different axes and conflating them
produces a roadmap that cannot be executed.

---

## TIER 1 — CONNECT NOW

Verified reachable, no authorization outstanding.

| Source     | Dataset             | Access                     | Blocker                         |
| ---------- | ------------------- | -------------------------- | ------------------------------- |
| **NOSDRA** | Oil spill incidents | Public CSV + JSON, no auth | **Licence unread** → see Tier 4 |

NOSDRA is technically Tier 1 and commercially Tier 4 until its terms are
read. It may be built and tested now; it may not feed commercial output
until question 3 in the discovery report is answered.

---

## TIER 2 — CONNECT THROUGH EXPORT / GIS

Reachable through published files or map services rather than an API.

| Source      | Dataset                                    | Route                | Status       |
| ----------- | ------------------------------------------ | -------------------- | ------------ |
| **NBS**     | Foreign Trade in Goods (quarterly)         | Document download    | `PUBLIC`     |
| **NBS**     | Road / Rail transport statistics           | Document download    | `PUBLIC`     |
| **NBS ODP** | Open Data for Africa portal                | Portal, possible API | `UNVERIFIED` |
| **NOSDRA**  | Oil blocks, pipelines, terminals, wetlands | Map layers           | `UNVERIFIED` |

---

## TIER 3 — INTEGRATION PENDING

**Connector built and tested. Awaiting a legitimate access route.**

| Source          | Dataset                                    | Connector | Awaiting                |
| --------------- | ------------------------------------------ | --------- | ----------------------- |
| **NPA SHIPPOS** | Daily Shipping Schedule — Vessels Expected | ✅ ready  | Export URL / API / feed |
| **NPA SHIPPOS** | Vessels Awaiting Berth                     | ✅ ready  | ”                       |
| **NPA SHIPPOS** | Vessels At Berth                           | ✅ ready  | ”                       |
| **NPA SHIPPOS** | Departed Vessels                           | ✅ ready  | ”                       |
| **NPA**         | Historical Daily Shipping Position         | ✅ ready  | Archive access          |

This tier is the point of the whole design. `NpaShipposAdapter`,
`PortSchedule`, the port-call lifecycle, snapshotting, change detection
and ETA history are all complete and covered by tests. What is missing is
permission, which is not something code can supply.

**Activation is one call:** `npaShippos.configureRoute({ route, url, format })`.

---

## TIER 4 — LICENSE REVIEW

Technically reachable; legally unresolved. **Blocks commercial use, not
development.**

| Source     | Question outstanding                                  |
| ---------- | ----------------------------------------------------- |
| **NOSDRA** | Commercial use, storage, redistribution, derived data |
| **NPA**    | Same, pending the data-sharing conversation           |
| **NBS**    | Terms not read                                        |

Publicly downloadable is not commercially reusable. Every source in the
registry defaults to `LICENSE_UNREVIEWED` until someone reads the terms.

---

## TIER 5 — FUTURE

Not yet investigated. **These carry no status.** No connector should be
scoped against them, and no roadmap commitment should assume they hold
data.

NCS (National Single Window, B'Odogwu) · NSC (ICTN, tariffs) · NIWA
(ERIS) · National Hydrographic Agency (ENC, bathymetry, NtM) · NUPRC ·
NIOMR · NEMA · NESREA

Each needs the full sequence before it earns a tier: discover → verify →
classify → assess access → assess licence → assess value.

---

## TIER 6 — REFERENCE ONLY

| Source                                      | Why                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Federal Ministry of Marine and Blue Economy | Policy and programme reference unless machine-readable datasets are found                           |
| Nigerian Navy                               | Publicly released incidents only; restricted systems are `AUTHORIZATION_REQUIRED` and stay that way |

---

## Out of scope

**NIMASA.** Excluded by instruction. No connector, no assumed access, no
fabricated data, and no Seaphore capability depends on it. Authorized
NIMASA data can be incorporated later if it becomes available.

---

## Movement rules

A source changes tier only on evidence:

- **→ Tier 1** requires a verified, reachable route _and_ an acceptable
  licence.
- **Tier 3 → Tier 1** requires the agency to supply a route. Nothing we
  build moves NPA on its own.
- **→ Tier 5** is where unverified sources start, never where they end.
- Nothing enters the registry as `CONNECTED` without
  `automatedIntegration: "CONNECTED"` — the registry throws otherwise.

---

## Honest summary

| Tier | Count | Can produce data today  |
| ---- | ----- | ----------------------- |
| 1    | 1     | Yes, subject to licence |
| 2    | 4     | Manually                |
| 3    | 5     | No — awaiting access    |
| 4    | 3     | Development only        |
| 5    | 8     | Unknown                 |
| 6    | 2     | Reference               |

**One source can produce data today.** The rest is either awaiting
permission or awaiting investigation, and saying so plainly is more
useful than a roadmap that implies otherwise.
