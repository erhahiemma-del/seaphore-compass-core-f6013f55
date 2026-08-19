# Sentinel-1 SAR — Non-Cooperative Maritime Sensing

**Seaphore · `src/services/eo`**

AIS is cooperative: the vessel transmits its own identity. SAR is not. A
Sentinel-1 scene measures radar backscatter, and a bright return over
water means _something metallic is there_. That is the whole of what the
sensor knows.

Everything in this domain follows from that.

---

## Two rules

### 1. A detection is never identified as a specific vessel

`SarDetection` has **no identity field**. No name, no IMO, no MMSI, no
flag — none of them are recoverable from radar backscatter, and adding a
field for them would invite something to fill it.

Identity exists only as `CandidateIdentity`: a ranked hypothesis with its
own confidence and its own signed evidence, produced by correlating
against AIS. Even a `matched` status is a hypothesis about two
observations, and the UI says so.

### 2. Sentinel-1 is not a live feed

The exact-repeat cycle is about **6 days** with two spacecraft, 12 with
one. Every scene, detection and event carries `acquiredAt`, `dataAgeMs`
is recomputed at read time rather than cached, and an empty result is
reported as a **revisit gap**, never as an empty sea.

---

## Pipeline

```
polygon + window
      │
      ▼
CopernicusProvider (STAC, metadata only)   ← server-only, OAuth here
      │  NormalizedEvidence
      ▼
normalizeScene ──▶ SarScene[]  (acquiredAt, footprint, productHref)
      │
      ▼
detectShips ──▶ DetectionRun   ← PORT. No model ships in this repo.
      │  SarDetection[]
      ▼
correlateDetections ◀── AisReport[]  (SeaVantage / Datalastic / Spire / GFW)
      │  CorrelationResult[]
      ▼
classifyDetection ◀── findAisGaps ──▶ AisGap[]
      │
      ▼
MaritimeEvent[]  ──▶ API ──▶ map + SarDetectionCard
```

Scenes are processed in `Promise.all` — they are independent, and a
serial loop would make the slowest scene the floor for the sweep.

---

## The detector is a port, not an implementation

Detecting ships in SAR imagery means CFAR thresholding over a sea-clutter
model, land masking, azimuth-ambiguity rejection, then classification. It
needs the raw pixels — hundreds of MB per scene — and a GPU. None of that
belongs in a Cloudflare Worker, and **no such model or service exists in
this repository**.

So `detector.ts` declares the contract and registers whichever service is
configured. The default returns nothing and says why:

> No SAR ship-detection service is configured. Scene metadata was
> retrieved, but the imagery has not been processed, so absence of
> detections says nothing about what was present.

Synthesising plausible detections so the pipeline had something to show
would put fabricated vessels on an officer's map. The port also refuses
scenes whose mode the model is not calibrated for — an IW-trained model
run on WV produces confident false detections rather than none.

To wire a real service: implement `ShipDetector`, call
`registerShipDetector()` at the composition root. It fetches
`scene.assetHref` itself; Seaphore never proxies imagery.

---

## Event classification

A ladder. No rung can be skipped.

| Event                          | Requires                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| `AIS_GAP`                      | A vessel that was transmitting stopped                           |
| `SAR_DETECTION`                | Something was detected                                           |
| `UNMATCHED_SAR`                | + AIS coverage existed and did not explain it                    |
| `POTENTIAL_DARK_CONTACT`       | + a known AIS gap's reachable area covers the position           |
| `HIGH_CONFIDENCE_DARK_CONTACT` | + detection ≥ 0.8 **and** position in the inner 50% of that area |

**Nothing reaches `UNMATCHED_SAR` on `no-ais-coverage`.** If we could not
see the cooperative picture, an unexplained return is unexplained _by
us_, and promoting it converts our blind spot into the vessel's guilt.

Every event carries `promotionRequires` — what would have to be true to
move it up — so an officer sees the ladder rather than a verdict.

### Why the top rung needs tight geometry

The reachable circle grows fast: 20 kn for four hours is 148 km across,
and almost anything falls inside it. Requiring the detection in the inner
half keeps `HIGH_CONFIDENCE_DARK_CONTACT` meaningful.

---

## The distinction that matters most

`unmatched` and `no-ais-coverage` both produce an empty candidate list.
Conflating them is the most consequential error available in this domain.

| Status            | Means                              | Is it about the vessel? |
| ----------------- | ---------------------------------- | ----------------------- |
| `matched`         | A candidate cleared 0.75           | Yes                     |
| `ambiguous`       | Candidates exist, none conclusive  | Yes                     |
| `unmatched`       | Coverage existed, nothing was near | **Yes** — interesting   |
| `no-ais-coverage` | We had no AIS to compare against   | **No** — about us       |

The UI colours `no-ais-coverage` neutrally for the same reason.

---

## Correlation scoring

Weighted, signed, and shown in full on the card.

| Factor             | Weight | Note                                                          |
| ------------------ | ------ | ------------------------------------------------------------- |
| Spatial proximity  | 0.50   | Dominant, against a radius that grows with uncertainty        |
| Temporal proximity | 0.20   | Decays over the hour either side of acquisition               |
| Length agreement   | +0.30  | Weak as confirmation                                          |
| Length conflict    | −0.40  | **Strong as exclusion** — a 60 m return is not a 300 m tanker |
| Heading agreement  | +0.10  | Treated as an **axis**: SAR cannot resolve bow from stern     |

Thresholds: `MATCH_THRESHOLD` 0.75, `CANDIDATE_FLOOR` 0.15. The match
threshold is high deliberately — briefing that a named vessel was
somewhere it never was costs far more than an extra "ambiguous".

AIS positions are dead-reckoned to acquisition time when needed, the
search radius widens with how far we extrapolated, and
`positionExtrapolated` is surfaced so a separation measured against an
estimate is never read as one measured against a fix.

---

## Security boundary

Copernicus is reachable **only** from `src/lib/server/eo.server.ts`.

- `COPERNICUS_USERNAME` / `COPERNICUS_PASSWORD` are read server-side, per call
- The CDSE token and STAC endpoint never cross the RPC boundary
- The browser sends a polygon and a window, and receives normalised
  `SarScene` / `MaritimeEvent` objects. It cannot address Copernicus
- Raw imagery is never proxied — `productHref` is passed through so a
  processing service fetches it directly, which also keeps provenance checkable

`src/lib/eo.functions.ts` holds only `createServerFn` declarations, per
the repo's server-fn splitting rule.

---

## Current status

| Component                  | Status                                                      |
| -------------------------- | ----------------------------------------------------------- |
| Scene search               | Ready — needs `COPERNICUS_*` env vars                       |
| Ship detection             | **Port only.** No service configured                        |
| AIS Gap Engine             | Ready                                                       |
| Dark Contact Correlation   | Ready                                                       |
| Event classification       | Ready                                                       |
| `SarDetectionCard`         | Ready                                                       |
| Map layers                 | Registered `pending-source` with real blockers              |
| AIS source for correlation | **None wired.** Datalastic returns empty; SeaVantage absent |

Two of these mean the pipeline cannot yet produce a dark contact from
live data: there is no detector, and no AIS history source. Both are
declared rather than stubbed, so the map states the gap instead of
showing an empty sea.
