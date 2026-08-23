# IntelligenceFinding — Canonical Contract

**Seaphore · G5.7A Phase 2 · specification only, no implementation**

`IntelligenceFinding` is the single object every intelligence surface
consumes. It **composes** the existing pipeline and owns almost nothing.

Its one job: carry a conclusion together with everything needed to
challenge that conclusion — evidence, provenance, inference chain, data
quality — so that no statement reaches an officer unsupported.

---

## The governing rule

> The finding **never computes** confidence, priority, evidence grade or
> freshness. It records what the owning engine decided, and where.

Three layers stay separate, because each answers a different question and
each has exactly one owner:

| Layer           | Question                                   | Owner                                              |
| --------------- | ------------------------------------------ | -------------------------------------------------- |
| **Observation** | What was seen, and how good is the source? | AISBehaviourAnalyzer, connectors, OSINT confidence |
| **Inference**   | How sure is the conclusion drawn from it?  | `reasoning`                                        |
| **Judgement**   | What should an officer do about it?        | **OSAE only**                                      |

---

## Resolving the three confidence vocabularies

They are **not** three ways of saying one thing. They are two distinct
meanings plus one alias, and the finding keeps them in separate fields.

| Vocabulary                                                                             | Means                                                                | Field              | Owner                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------ | ----------------------------------- |
| `OsintConfidenceLevel` — AUDITED, VERIFIED, CORROBORATED, INFERRED, DECLARED, OBSERVED | **Evidence grade** — how trustworthy is this _source or observation_ | `evidence[].grade` | OSINT confidence engine             |
| `reasoning.ConfidenceBand` — high, medium, low, insufficient                           | **Assessment confidence** — how sure is this _conclusion_            | `assessment.band`  | `reasoning.bandOf`                  |
| `adapters/status.ConfidenceLabel`                                                      | Same six values as the first; belongs to the non-functional matrix   | —                  | **Alias. Deprecated. Not carried.** |

**Never collapsed, never averaged.** A CORROBORATED observation can yield a
`low` assessment when the inference from it is weak, and a single OBSERVED
data point can support a `high` assessment when the inference is trivial.
Merging them destroys that distinction.

Numeric confidences are kept apart for the same reason:
`evidence[].observationConfidence` is the analyzer's 0–1 confidence _in the
observation_; `assessment.confidence` is `reasoning.propagate`'s value at
the assessment rung. Different numbers about different things.

---

## Contract

```ts
interface IntelligenceFinding {
  // ── Identity ──────────────────────────────────────────────
  id: string;
  subject: FindingSubject; // vessel | company | area
  module: RiskModuleId; // which module produced it
  kind: FindingKind; // "ais-gap", "ownership-change", …

  // ── Statement ─────────────────────────────────────────────
  statement: string; // evidence-phrased, never "High Risk"
  producedAt: string;
  observedAt: string | null; // when the underlying event occurred

  // ── Observation layer (authoritative elsewhere, held by reference)
  evidence: readonly EvidenceRef[];

  // ── Inference layer (derived by `reasoning`) ──────────────
  assessment: FindingAssessment | null;

  // ── Judgement layer (OSAE only) ───────────────────────────
  priority: OperationalPriority | null;
  priorityRationale: string | null;

  // ── Quality ───────────────────────────────────────────────
  dataQuality: FindingDataQuality;

  // ── Provenance ────────────────────────────────────────────
  provenance: FindingProvenance;

  // ── Lifecycle ─────────────────────────────────────────────
  status: FindingStatus;
  unavailableReason: string | null;
}

type FindingStatus =
  | "supported" // evidence present, assessment made
  | "insufficient-evidence" // evidence present but too weak to assess
  | "pending-source" // module registered, data source not connected
  | "not-applicable"; // module ran, condition absent

interface EvidenceRef {
  id: string;
  type: string; // "AIS_DARK", …
  grade: OsintConfidenceLevel; // evidence grade
  observationConfidence: number; // 0–1, confidence in the observation
  summary: string; // analyzer's officer-safe explanation
  observedAt: string;
  provenance: VesselProvenance;
  payloadRef: string; // pointer to the full record
}

interface FindingAssessment {
  statement: string;
  confidence: number; // reasoning.propagate, assessment rung
  band: ConfidenceBand;
  propagation: ConfidencePropagation; // full ladder, for the Evidence Viewer
  whyChain: readonly WhyChainStep[];
  counterHypothesis: CounterHypothesis | null; // REQUIRED for high | medium
}

interface FindingDataQuality {
  validation: ValidationVerdict; // accepted | warning | rejected
  validationReasons: readonly ValidationReason[];
  freshness: FreshnessBand;
  ageMs: number | null;
  gaps: readonly string[]; // "no course reported", …
}

interface FindingProvenance {
  sources: readonly VesselProvenance[]; // where the data came from
  pipeline: readonly IpefContributorRef[]; // which stages produced it
  corroboration: FusionSummary | null; // cross-provider agreement
}
```

---

## Field ownership matrix

**A** = authoritative here · **D** = derived, copied from the owner

| Field                              | Purpose                       | Owner                                | Lifecycle                            | A/D   |
| ---------------------------------- | ----------------------------- | ------------------------------------ | ------------------------------------ | ----- |
| `id`                               | Stable identity for citation  | Aggregator                           | Created once                         | **A** |
| `subject`                          | What the finding is about     | Caller                               | Set at creation                      | **A** |
| `module`                           | Attribution                   | Risk Module Registry                 | Set at creation                      | **A** |
| `kind`                             | Taxonomy                      | Module                               | Set at creation                      | **A** |
| `statement`                        | Officer-facing claim          | Module                               | Set at creation                      | **A** |
| `producedAt`                       | When derived                  | Aggregator                           | Set at creation                      | **A** |
| `observedAt`                       | When the event occurred       | Evidence                             | Copied                               | D     |
| `evidence[]`                       | Support                       | **AISBehaviourAnalyzer**, connectors | By reference, immutable              | D     |
| `evidence[].grade`                 | Source trust                  | **OSINT confidence engine**          | Copied                               | D     |
| `evidence[].observationConfidence` | Confidence in the observation | **Analyzer**                         | Copied                               | D     |
| `assessment.confidence`            | Confidence in the conclusion  | **`reasoning.propagate`**            | Recomputed on new evidence           | D     |
| `assessment.band`                  | Banded form                   | **`reasoning.bandOf`**               | Derived from confidence              | D     |
| `assessment.propagation`           | Full inference ladder         | **`reasoning.propagate`**            | Copied                               | D     |
| `assessment.whyChain`              | Explanation                   | **`reasoning`**                      | Copied                               | D     |
| `assessment.counterHypothesis`     | Falsifiability                | **`reasoning`**                      | Required when band is high or medium | D     |
| `priority`                         | Operational judgement         | **OSAE — exclusively**               | Copied, never computed               | D     |
| `priorityRationale`                | Why that priority             | **OSAE**                             | Copied                               | D     |
| `dataQuality.validation`           | Admission verdict             | **`validation.ts`**                  | Copied                               | D     |
| `dataQuality.freshness`            | Age band                      | **`freshness.ts`**                   | **Recomputed at render**             | D     |
| `dataQuality.gaps`                 | Absent fields                 | Module                               | Set at creation                      | **A** |
| `provenance.sources`               | Data lineage                  | **`VesselProvenance`**               | Copied                               | D     |
| `provenance.pipeline`              | Process lineage               | **IPEF**                             | Copied                               | D     |
| `provenance.corroboration`         | Cross-provider agreement      | **`fusion.ts`**                      | Copied                               | D     |
| `status`                           | Lifecycle state               | Module                               | Set at creation                      | **A** |
| `unavailableReason`                | Why nothing was produced      | Module                               | Required unless `supported`          | **A** |

**Only seven fields are authoritative, and none of them is a score.** Every
number and every judgement is derived. That is the design.

`freshness` is the sole field recomputed after creation — age changes with
the clock, so caching it would make a stale finding look fresh.

---

## Dependency graph

```
                    ┌──────────────────────────┐
                    │   IntelligenceFinding    │   composes only
                    └────────────┬─────────────┘
        ┌──────────────┬─────────┼─────────┬──────────────┐
        ▼              ▼         ▼         ▼              ▼
   AISBehaviour     reasoning   OSAE   validation    VesselProvenance
   Analyzer         ─────────   ────   freshness     IPEF · fusion
   evidence         confidence  ONLY   quality       lineage
                    whyChain    assigns
                    counterHyp  priority
```

Every arrow points **outward**. The finding depends on the engines; no
engine depends on the finding. Deleting it leaves the pipeline intact.

---

## Execution sequence

```
1.  GFW gaps dataset             → runGfwAreaSearch
2.  normalize()                  → Vessel
3.  validateBatch()              → ValidationResult      ─┐
4.  AISBehaviourAnalyzer         → AisDarkEvidence[]     ─┤ inputs
5.  OSAE.publishAisContinuity()  → OsaeAssessment        ─┤
6.  reasoning.anchorFromEvidence → propagate → bandOf    ─┤
7.  reasoning whyChain + counterHypothesis               ─┘
                                                          ↓
8.  Module assembles IntelligenceFinding (copies only)
9.  Aggregator collects findings across modules
10. Surfaces render: Vessel Card · Evidence Viewer · Copilot · Dashboard
```

Steps 1–7 exist today. Steps 8–10 are Phase 3.

**Ordering constraint:** `reasoning` must run after evidence exists —
`anchorFromEvidence` needs scored evidence, and `requiresCounterHypothesis`
can only be enforced once a band is known.

---

## Extension points for future providers

A new module implements one interface and declares its readiness. **No UI
changes**, mirroring the Layer Registry pattern proven in G5.5.2.

```ts
interface RiskModule {
  id: RiskModuleId;
  label: string;
  status: "ready" | "pending-source";
  pendingReason?: string; // REQUIRED when pending-source
  requires: readonly string[]; // data dependencies
  evaluate(ctx: FindingContext): Promise<readonly IntelligenceFinding[]>;
}
```

Registered at G5.7A, honestly:

| Module        | Status         | Blocker                                                    |
| ------------- | -------------- | ---------------------------------------------------------- |
| AIS Integrity | **ready**      | — (OSAE + GFW gaps dataset)                                |
| Navigation    | pending-source | GFW reports no course or speed                             |
| Ownership     | pending-source | OpenCorporates not wired to the map                        |
| Sanctions     | pending-source | OpenSanctions / OFAC / UN not wired to the map             |
| Compliance    | pending-source | Equasis pending terms verification                         |
| Cargo         | pending-source | No manifest source connected                               |
| Revenue       | pending-source | No NIMASA levy source connected                            |
| Environmental | pending-source | NOAA / Open-Meteo not connected                            |
| EEZ           | pending-source | Requires official boundary; current polygon is approximate |

A `pending-source` module returns a finding with `status: "pending-source"`
and a populated `unavailableReason`. It never returns a fabricated score,
and never silently returns nothing.

**Aggregation shows every contribution.** No hidden weights: a module that
contributed nothing is displayed as contributing nothing, with its reason.

---

## Prohibitions

1. No new confidence engine — use `reasoning` and the OSINT engine.
2. No new evidence engine — use `AisDarkEvidence` and peers by reference.
3. Nothing but OSAE assigns `priority`.
4. No AIS re-analysis — AIS Integrity delegates to OSAE.
5. No collapsing of the two confidence vocabularies.
6. No statement without `evidence[]` — enforced by `status`.
7. A `high` or `medium` band without a `counterHypothesis` is invalid.
