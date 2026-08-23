# NPA Progressive Ingestion

**Seaphore · `src/services/government/npa`**

Seaphore builds its own historical NPA dataset one day at a time. Every
retrieval is preserved whole; nothing is ever overwritten.

---

## Why snapshots, not a current-state table

A table of "vessels expected today", updated in place, answers exactly one
question and destroys the answer to every other one. Once today's row
overwrites yesterday's, nobody can ask whether the ETA moved, how long a
vessel waited, or whether the schedule is reliable.

Those are the questions that turn a port schedule into intelligence. So
the schedule is stored as a series of immutable observations, and the
analytics fall out of the diffs.

---

## Pipeline

```
NPA SHIPPOS
   ↓  fetch (route-ordered: export → API → feed → institutional)
FetchResult
   ↓  ingest()  ── health !== UP ──▶ INGESTION_FAILED (no snapshot)
NpaDailySnapshot        immutable, frozen, content-hashed
   ↓
detectChanges(previous, current)
   ↓
NpaChange[]  ──▶ etaHistory()  ──▶ port call lifecycle  ──▶ AIS correlation
```

---

## Immutability

`createSnapshot()` returns a deep-frozen object. There is no update path
and no delete path.

A correction is a **new snapshot**, not an edit. An observation that later
proved wrong is still an observation we made, and erasing it would make
the change history lie about what NPA published and when.

Each record keeps **both** the raw payload and the normalised record. The
raw is the evidence: if normalisation is later found wrong, every past
snapshot can be re-normalised without re-fetching data that no longer
exists upstream.

---

## A failed fetch is never an empty snapshot

The most dangerous bug available in this domain is storing zero records
because the source was unreachable, then rendering it as "no vessels
expected".

`ingest()` refuses structurally:

| Fetch health             | Records | Outcome                                                                |
| ------------------------ | ------- | ---------------------------------------------------------------------- |
| `UP`                     | 12      | `SNAPSHOT` — 12 records                                                |
| `UP`                     | 0       | `SNAPSHOT` — 0 records. **A real observation**: the schedule was empty |
| `NOT_CONFIGURED`         | 0       | `INGESTION_FAILED`                                                     |
| `DOWN` / `AUTH_REQUIRED` | any     | `INGESTION_FAILED`                                                     |

An `INGESTION_FAILED` carries the last successful snapshot, so the UI
renders:

> NPA data unavailable — last successful snapshot 19 Aug (12 records,
> retrieved 06:00Z).

and never:

> No vessels expected.

Those are opposite claims. `describeFailure()` is the only sanctioned
phrasing, and a test asserts it never contains "no vessels".

---

## Cross-snapshot vessel identity

`snapshotVesselKey()`:

1. **IMO** when present — the only stable maritime identifier.
2. Otherwise **name scoped by terminal**. Weaker, but bounded: two
   vessels sharing a name at the same terminal on the same schedule is
   rare enough to accept, and the alternative is losing every un-numbered
   vessel from the change history entirely.

Never fuzzy. A near-miss on a name is a different vessel.

---

## Change detection

`detectChanges(previous, current)` emits twelve types:

`NEW_VESSEL` · `REMOVED_VESSEL` · `ETA_CHANGED` · `ETD_CHANGED` ·
`PORT_CHANGED` · `TERMINAL_CHANGED` · `BERTH_CHANGED` · `STATUS_CHANGED` ·
`CARGO_CHANGED` · `TONNAGE_CHANGED` · `AGENT_CHANGED` ·
`VESSEL_DIMENSION_CHANGED`

Every change retains `oldValue`, `newValue`, both snapshot ids,
`detectedAt` and `source`.

Three deliberate behaviours:

- **Identical content hash ⇒ no changes.** Re-running the same day is a
  no-op rather than a wall of false diffs.
- **First-time enrichment is not a change.** `Agent: null → Acme` is the
  field arriving, not the schedule moving, and reporting it would bury
  the real changes.
- **`REMOVED_VESSEL` states the observation, never the cause.** A vessel
  leaving the expected list usually means it arrived, sometimes means the
  schedule was revised, occasionally means a partial fetch. The engine
  does not guess.

`VESSEL_DIMENSION_CHANGED` is worth its own type because a vessel's
length does not change. Firing it means bad data or two vessels sharing
one identity — a data-quality signal, and the detail text says so.

---

## ETA history

The ETA is never overwritten, so history is read back out of the
snapshots in order:

```
19 Aug 06:00   ETA 16:00        —
20 Aug 06:00   ETA 17:20     +1h 20m
20 Aug 18:00   ETA 18:30     +1h 10m
                            ─────────
               net drift    +2h 30m   ·  2 revisions
```

Both figures matter: **drift** for delay analysis, **revision count** for
schedule reliability. A repeated identical ETA is the same observation
restated and is not counted.

Feeds: ETA reliability · delay analysis · schedule performance · terminal
performance · port congestion · arrival forecasting.

---

## Coverage gating

`hasCoverageFor(snapshots, windowDays)` returns `{ sufficient, have, need }`.

Analytics stay hidden until the data supports them. A "90-day average"
computed over four days of snapshots is a fabricated statistic wearing a
real label. The UI shows `DATA COVERAGE: X days` and withholds any window
longer than `X`.

`coverageDays()` counts **distinct days**, not retrievals — polling twice
on one day is one day of coverage.

---

## Current status

```
NPA SHIPPOS
STATUS: INTEGRATION_PENDING
CONNECTOR: READY — AWAITING ACCESS
SNAPSHOTS RECORDED: 0
```

The ingestion pipeline is complete and tested against fixtures. No
snapshot has been recorded because no acquisition route is configured.
The day NPA supplies an export URL or API, `configureRoute()` turns it on
and the first snapshot lands with no other change.

---

## Access dimensions

Recorded separately, because they are separate facts:

| Dimension                      | Value                                     |
| ------------------------------ | ----------------------------------------- |
| `crawlerAccess`                | `BLOCKED`                                 |
| `portalAccess`                 | `AVAILABLE`                               |
| `authenticatedSystem`          | `AVAILABLE`                               |
| `publicExport`                 | `OBSERVED — FORMAT/ROUTE UNVERIFIED`      |
| `publicApi`                    | `UNVERIFIED`                              |
| `officialFeed`                 | `UNVERIFIED`                              |
| `institutionalIntegration`     | `POSSIBLE — REQUIRES CONFIRMATION`        |
| `automatedProductionIngestion` | `PENDING OFFICIAL ACCESS ROUTE`           |
| `historicalOfficialData`       | `AVAILABLE WHERE LEGITIMATELY ACCESSIBLE` |

A blocked crawler does not mean Seaphore cannot integrate NPA data.
