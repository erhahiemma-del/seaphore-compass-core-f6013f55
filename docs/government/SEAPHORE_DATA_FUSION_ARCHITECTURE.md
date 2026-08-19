# Seaphore Data Fusion Architecture

**The evidence layer: government + commercial + satellite + OSINT.**

---

## The governing question

Seaphore does not ask _"which provider has everything?"_ — none does. It
asks:

> **What is the strongest evidence available for this particular
> question?**

| Question                                   | Strongest source                 |
| ------------------------------------------ | -------------------------------- |
| What was the vessel expected to do?        | **NPA**                          |
| Where is the vessel actually?              | **AIS** (Datalastic, SeaVantage) |
| Is anything there that isn't transmitting? | **Sentinel-1 SAR**               |
| What trade context exists?                 | TradeAtlas                       |
| What environmental context exists?         | NOSDRA                           |
| Is there sanctions exposure?               | OpenSanctions                    |
| Who is behind the company?                 | OpenCorporates                   |
| What does all of this mean together?       | **Seaphore**                     |

---

## Authority is per claim

Implemented in `src/services/government/authority.ts`. No source is
universally authoritative.

| Source                  | Authoritative for                                   | No authority over                   |
| ----------------------- | --------------------------------------------------- | ----------------------------------- |
| NPA                     | Port operational state (0.98), port schedule (0.95) | Vessel position — it publishes none |
| Datalastic / SeaVantage | Vessel position (0.85–0.9)                          | Port operational state (0.45–0.5)   |
| NOSDRA                  | Oil-spill incidents (0.95)                          | —                                   |
| Sentinel-1              | Physical observation (0.9)                          | **Vessel identity (0.0)**           |

Sentinel-1's zero on identity is deliberate and consistent with
`services/eo`: radar backscatter carries no name, IMO or MMSI, so it can
corroborate that _something_ is there and never _which_ vessel.

Authority is not confidence. Authority asks "how well-placed is this
source to know?"; confidence asks "how sure are we of this conclusion?"
and belongs to `reasoning`. An NPA berth assignment six hours stale is
authoritative and out of date at once.

---

## Conflicts are preserved, never resolved away

Three ETAs for one vessel:

```
NPA         16:30   authority 0.95
Datalastic  16:10   authority 0.45
SeaVantage  15:47   authority 0.50
```

All three are stored as `EtaObservation[]`, ordered by authority. Ordering
is not selection — the intelligence layer decides what to show, and the
officer sees the spread. Collapsing them to one number would discard the
evidence needed to judge which to trust.

---

## Reconciliation produces observations, not errors

| NPA says      | AIS says           | Seaphore records                   |
| ------------- | ------------------ | ---------------------------------- |
| EXPECTED      | No vessel detected | `NPA_AIS_DISCREPANCY`              |
| AT_BERTH      | Outside port       | `PORT_STATUS_POSITION_DISCREPANCY` |
| Not scheduled | Vessel near Lagos  | `UNSCHEDULED_AIS_CONTACT`          |

These are intelligence, not bugs. A vessel NPA lists at berth which AIS
places at sea is exactly the kind of thing an officer should see.

---

## Port call lifecycle — neither source owns the stage

```
EXPECTED ─▶ APPROACHING ─▶ ARRIVED ─▶ AWAITING BERTH ─▶ AT BERTH ─▶ DEPARTED
  NPA          AIS          AIS+NPA        NPA             NPA       NPA+AIS
```

NPA is taken at face value for berth and departure state — it alone knows
a vessel is alongside berth 4. AIS refines `EXPECTED`, which is the one
stage that is a _prediction_ rather than an observation, and therefore
the only one AIS can legitimately improve.

Each transition records which sources supported it.

---

## Multi-sensor compatibility

The EO/SAR architecture stays intact and these distinctions remain
load-bearing:

- `SAR_DETECTION` · `UNMATCHED_SAR` · `POTENTIAL_DARK_CONTACT` ·
  `HIGH_CONFIDENCE_DARK_CONTACT`
- **`NO_AIS_COVERAGE` is not `AIS_GAP`.** One is a hole in our
  collection; the other is a vessel that stopped transmitting. Nothing is
  promoted past `UNMATCHED_SAR` on `no-ais-coverage`.

**Lack of data is never evidence of wrongdoing.** This principle now
appears in three domains — SAR classification, NPA ingestion failure, and
government source status — because it is the same mistake each time:
rendering our blindness as their behaviour.

---

## Entity resolution

Primary: IMO → MMSI → call sign. Secondary, and never a sole merge key:
name, company, port, terminal, dimensions, flag.

`matchAisToSchedule()` abstains when two vessels share a name. Every match
retains `match_confidence`, `match_method` and `match_evidence`.

---

## Provenance, on every record

`source` · `source_url` · `source_dataset` · `source_record_id` ·
`source_timestamp` · `retrieved_at` · `content_hash` · `schema_version` ·
`processing_status`

Four distinct times are tracked and never conflated:

| Time               | Meaning                             |
| ------------------ | ----------------------------------- |
| `observed_at`      | When the fact was true in the world |
| `source_timestamp` | When the source says it was true    |
| `retrieved_at`     | When Seaphore fetched it            |
| `detected_at`      | When Seaphore noticed a change      |

---

## Reused, not rebuilt

| Concern             | Existing asset                                          |
| ------------------- | ------------------------------------------------------- |
| Source registry     | `data_sources`, `data_source_health`                    |
| Acquisition         | `services/ial` — normalizer, validator, hash, cache     |
| Conflict handling   | `services/ice`                                          |
| Freshness           | `services/geospatial/freshness`                         |
| Confidence          | `lib/osint/confidence`, `services/reasoning/confidence` |
| Findings            | `services/intelligence` — `IntelligenceFinding`         |
| Correlation pattern | `services/eo`                                           |
| Provenance          | `NormalizedEvidence`                                    |

No parallel infrastructure was created for the government domain.

---

## Current reality

```
GOVERNMENT      COMMERCIAL        SATELLITE          OSINT
NPA  ⏸ pending   Datalastic ⏸ stub  Sentinel-1 ⏸ no    OpenSanctions ✓
NOSDRA ⏸ licence SeaVantage ⏸ none              detector GFW ✓
```

Most of the fabric is built and unfed. The engines — correlation,
lifecycle, change detection, authority, conflict handling — are complete
and tested. What they lack is data, and every gap is declared rather than
filled with a plausible substitute.
