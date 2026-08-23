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

---
---

# Revision after Phase 6 (20 Aug 2026)

Phase 6 verified **no new connectable dataset**. Four agencies were
investigated; four were not reached. The tiering changes as follows.

## Movements

| Source | From | To | Evidence |
| ------ | ---- | -- | -------- |
| **NUPRC** | Tier 5 | **Tier 5 — confirmed** | OGISP verified as a login-gated permit portal, not a data repository |
| **NCS** | Tier 5 | **Tier 3 — INTEGRATION PENDING** | Crawler policy is a stated access control, not an absence of data. Promoted because an agreement is a realistic route and the payoff is the highest in the programme |
| **NHA** | Tier 5 | **Tier 5 — confirmed, with a date dependency** | Marine Data Repository is "Coming Soon". Nothing to integrate *yet*; re-check quarterly |
| **NIWA** | Tier 5 | **Tier 5, with one Tier 2 candidate** | Live tide feed at `niwa.port-log.net` warrants its own verification |
| NSC, NIOMR, NEMA, NESREA | Tier 5 | **Tier 5 — not investigated** | No evidence either way |

## Standing after Phase 6

| Tier | Members |
| ---- | ------- |
| **1 — CONNECT NOW** | *(none — NOSDRA is technically ready but licence-gated)* |
| **2 — EXPORT / GIS** | NOSDRA incidents (CSV/JSON) · NOSDRA GIS layers · NBS quarterly documents · **NIWA tide feed (candidate)** |
| **3 — INTEGRATION PENDING** | NPA ×5 datasets *(connector built)* · **NCS** *(no connector)* |
| **4 — LICENSE REVIEW** | NOSDRA · NPA · NBS |
| **5 — FUTURE** | NUPRC · NHA *(date-dependent)* · NIWA ERIS · NSC · NIOMR · NEMA · NESREA |
| **6 — REFERENCE** | FMMBE · Nigerian Navy public releases |

## The one thing that changed the picture

Tier 1 is now **empty**. NOSDRA sits in Tier 2/4 rather than Tier 1
because "technically reachable" and "usable in a commercial product" are
different tests, and only the first has been passed.

Prioritisation by value + accessibility + freshness + uniqueness +
complementarity + legal feasibility puts the order at:

1. **NOSDRA licence review** — one document read away from Tier 1
2. **NPA access request** — connector built, longest accumulation lead time
3. **NCS access request** — highest ceiling, no connector yet
4. **NIWA tide feed verification** — cheap, possibly the only live feed
5. **NHA re-check** — calendar-driven, no effort until the repository opens

---
---

# Final tiering after Phase 6B (discovery complete)

Eleven agencies assessed. Prioritised by intelligence value × uniqueness
× freshness × coverage × accessibility × commercial feasibility ×
integration effort — **not** by agency importance.

| Tier | Members | Note |
| ---- | ------- | ---- |
| **1 — CONNECT NOW** | *(empty)* | Nothing is both technically connectable and commercially clear |
| **2 — EXPORT / GIS** | NOSDRA incidents · NOSDRA GIS · NSC tariffs & freight rates (PDF) · NBS quarterly (PDF) | All `LICENSE_BLOCKED` pending review |
| **3 — INTEGRATION PENDING** | NPA ×5 *(connector built)* · NCS *(no connector)* | Authorization conversations |
| **4 — LICENSE REVIEW** | NOSDRA · NSC · NBS · NPA | Blocks commercial use, not development |
| **5 — FUTURE** | NHA *(date-dependent)* · NIWA tide feed *(verify)* · NIWA ERIS · NIOMR-via-OBIS · NUPRC | |
| **6 — REFERENCE ONLY** | NSC Process Manual · NESREA legislation · FMMBE · Navy public releases | Copilot grounding at best |
| **— DO NOT PRIORITISE** | **NEMA** · **NESREA** · NIOMR ocean-state | `NO_VERIFIED_DATASET` |

## Ranked next actions

1. **NOSDRA licence review** — one document read from Tier 1. Highest
   return per hour of effort in the entire programme.
2. **NPA access request** — connector built; **+90-day accumulation lead
   time** makes this the earliest thing to unblock even though it lands last.
3. **NCS access request** — highest ceiling, no connector yet.
4. **NIWA tide feed verification** — cheap; the only live candidate found
   across eleven agencies. Two sets of terms to read (NIWA + port-log.net).
5. **NHA quarterly re-check** — calendar-driven, zero effort until the
   Marine Data Repository opens.

## What discovery settled

Further discovery is **not** the constraint. Eleven agencies produced one
machine-readable open dataset. The constraints are licensing and
authorization, and both are conversations rather than engineering.
