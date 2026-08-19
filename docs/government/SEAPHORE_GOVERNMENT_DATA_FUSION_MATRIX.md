# Seaphore Government Data Fusion Matrix

**What each combination produces that no single source can.**

Availability is stated per row. `NOW` means every input is verified
reachable today. Anything else names the specific blocker.

---

## PORT CALL INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NPA SHIPPOS | Datalastic / SeaVantage | Sentinel-1 | EXPECTED → APPROACHING → ARRIVED → AWAITING BERTH → AT BERTH → DEPARTED |

**Unique output:** the full lifecycle. AIS alone gives position but never
knows a vessel was *expected*, which terminal it was assigned, or that it
is alongside berth 4. NPA alone gives the schedule but never whether the
vessel actually came.

**Availability:** `AFTER AUTHORIZATION` — NPA route pending; AIS provider
also unwired (Datalastic returns empty by design).

---

## SCHEDULE RELIABILITY & PORT CONGESTION

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NPA daily snapshots (accumulated) | AIS dwell time | — | ETA drift, berth waiting time, terminal throughput, schedule reliability per agent |

**Unique output:** nobody sells Nigerian ETA-reliability data. It only
exists if someone records the schedule daily and diffs it — which is
exactly what `NpaChangeDetectionService` and `etaHistory()` do.

**Availability:** `AFTER AUTHORIZATION`, then **+90 days of accumulation**
before any window is statistically meaningful. This is the longest lead
time in the programme and the reason to secure NPA access early.

---

## ENVIRONMENTAL MARITIME INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NOSDRA oil-spill incidents | AIS | Sentinel-1 | Which vessels were near a spill site at the incident time |

**Unique output:** spatio-temporal correlation between an official spill
record and vessel presence. NOSDRA knows *where and when*; AIS knows *who
was there*. Neither answers the joint question.

**Availability:** `AFTER LICENSING` — NOSDRA data is technically
reachable now; its reuse terms are unread.

**Caveat that must survive to the UI:** proximity is not causation. A
vessel near a spill is a vessel near a spill. This must never render as
attribution.

---

## ENERGY INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NUPRC (assets, operators, licences) | TradeAtlas | AIS + Sentinel-1 | Vessel → terminal → asset → operator → licence → cargo |

**Unique output:** attributing a tanker call to a licensed operator and a
specific upstream asset.

**Availability:** `FUTURE` — **no NUPRC dataset is verified**. OGISP was
checked and is a permit-application portal behind login, not a data
repository. NOSDRA's map layers include oil blocks, pipelines and
terminals, and are currently the *only* verified route to this geometry.

---

## NAVIGATION INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NHA charts, tides, bathymetry | AIS | NIOMR ocean conditions | Vessel → depth → hazard → tidal window |

**Unique output:** whether a vessel's draught and the tidal window are
compatible with the channel it is entering — a genuine navigation-risk
signal.

**Availability:** `FUTURE` — NHA's Marine Data Repository is
**"Coming Soon"** (verified). Charts are supplied on demand, not as open
data. NIOMR unverified.

---

## TRADE / CARGO INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NCS declarations | TradeAtlas | AIS | Vessel → cargo → importer/exporter → commodity → value |

**Unique output:** joining a physical vessel call to a customs
declaration. This is the highest-value fusion in the entire programme and
the least accessible.

**Availability:** `FUTURE` — **no NCS dataset verified**. customs.gov.ng
returns 403 to automated agents and its robots.txt blocks nine AI
crawlers. NBS quarterly trade statistics are aggregate only: they cannot
be joined to a vessel.

---

## MARITIME DISASTER INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NEMA flood/hazard | AIS | Sentinel-1 | Port disruption forecasting, coastal hazard exposure |

**Availability:** `FUTURE` — NEMA unverified.

---

## INLAND WATERWAYS INTELLIGENCE

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NIWA ERIS, tide gauges | — | Sentinel-1/2 | Inland vessel → waterway → jetty → inland port |

**Unique output:** inland movement is invisible to conventional maritime
AIS. This is genuinely uncovered ground.

**Availability:** `FUTURE` — ERIS exists at `eris.niwa.gov.ng`; access
model unverified. A live tide display was observed at
`niwa.port-log.net/live/display.php` (third-party network, terms
unverified).

---

## DARK CONTACT ATTRIBUTION

| Government | Commercial | Satellite/OSINT | Produces |
| ---------- | ---------- | --------------- | -------- |
| NPA schedule | AIS | Sentinel-1 SAR | A SAR return that matches no AIS track *and* no scheduled call |

**Unique output:** a third independent check. Today a `HIGH_CONFIDENCE_DARK_CONTACT`
rests on SAR + AIS gap. Adding NPA answers "was anything even due here?",
which materially changes how an officer reads it.

**Availability:** `AFTER TECHNICAL DEVELOPMENT` — needs a SAR detection
service (none exists), plus NPA and AIS access.

---

## Complementarity assessment

What each source adds that Seaphore does not already have:

| Source | Adds | Verdict |
| ------ | ---- | ------- |
| NPA | Port schedule, berth state, terminal assignment | **Unique — no substitute** |
| NCS | Customs declarations joinable to a call | **Unique — no substitute** |
| NHA | Depth, hazards, tides | **Unique** |
| NIWA | Inland waterways | **Unique** |
| NOSDRA | Official spill register + oil/pipeline geometry | **Unique** |
| NUPRC | Licence/operator attribution | Unique, but unverified |
| NIOMR | Ocean conditions | Partly duplicated by NOAA/Open-Meteo → **assess before building** |
| NEMA | Coastal hazard | Partly duplicated by commercial weather → **assess** |
| NESREA | Environmental compliance | Overlaps NOSDRA → `LOW_INCREMENTAL_VALUE` pending verification |
| NBS | Aggregate trade statistics | Duplicated by TradeAtlas at finer grain → `LOW_INCREMENTAL_VALUE` |

---

## Honest position

Of nine fusion products above, **none is available today**. One
(environmental) is a licence review away; one (port call) is an
authorization away. The remaining seven need sources that are unverified
or systems that do not exist.

The engines are built. The inputs are not.
