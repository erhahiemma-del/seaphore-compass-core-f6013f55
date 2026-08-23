# Intelligence Orchestration — Architecture

**Seaphore · G5.7A Phase 3 · as built**

The `src/services/intelligence/` domain is an **orchestration layer**. It
contains no intelligence engine, no confidence engine, no explainability
engine, no evidence engine, and no AIS analyser. Every one of those already
exists elsewhere in the repository, and this layer composes them.

The specification it implements is
[`INTELLIGENCE_FINDING_CONTRACT.md`](./INTELLIGENCE_FINDING_CONTRACT.md).
Where the two disagree, the contract wins and this document is stale.

---

## What was built

| File                                                | Role                                                     |
| --------------------------------------------------- | -------------------------------------------------------- |
| `types.ts`                                          | `IntelligenceFinding` + `validateFinding`                |
| `module-registry.ts`                                | `RiskModuleRegistry`, the eight `pending-source` modules |
| `aggregator.ts`                                     | `aggregateFindings`, `byPriority`, `collectEvidence`     |
| `modules/ais-integrity.ts`                          | The one module with a connected source                   |
| `index.ts`                                          | Barrel **and** composition point                         |
| `components/intelligence/FindingEvidenceViewer.tsx` | Officer-facing render of one finding                     |

---

## Where each value comes from

Nothing in this layer decides any of the following. It copies them.

```
evidence[].grade                 ← lib/osint/confidence.confidenceLevelFor
evidence[].observationConfidence ← AISBehaviourAnalyzer (and peers)
assessment.confidence / band     ← reasoning.propagate / reasoning.bandOf
assessment.counterHypothesis     ← required by reasoning.requiresCounterHypothesis
priority / priorityRationale     ← OSAE, exclusively
dataQuality.validation           ← geospatial/validation
dataQuality.freshness            ← geospatial/freshness (recomputed at render)
provenance.sources               ← VesselProvenance
provenance.pipeline              ← IPEF
provenance.corroboration         ← geospatial/fusion
```

Seven fields are authoritative here — `id`, `subject`, `module`, `kind`,
`statement`, `dataQuality.gaps`, and `status`/`unavailableReason`. None of
them is a score.

---

## The three confidence vocabularies, and why they stay apart

| Vocabulary                                  | Answers                     | Values                                                             |
| ------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `OsintConfidenceLevel` (`evidence[].grade`) | How good is the source?     | AUDITED · VERIFIED · CORROBORATED · INFERRED · DECLARED · OBSERVED |
| observation confidence (`0–1`)              | How sure is the analyzer?   | numeric                                                            |
| `ConfidenceBand` (`assessment.band`)        | How sure is the conclusion? | high · medium · low · insufficient                                 |

A CORROBORATED source with a `low` assessment is not a contradiction: the
source is good and the inference from it is weak. Collapsing the two into
one chip destroys exactly that distinction, so `FindingEvidenceViewer`
renders each with its own vocabulary's colours and a label naming the
question it answers.

`adapters/status.ConfidenceLabel` is a deprecated alias of the first
vocabulary and is not carried anywhere in this layer.

---

## Enforcement is structural, not editorial

`validateFinding` returns violations for the four prohibitions that can be
checked mechanically:

| Code                         | Condition                                          |
| ---------------------------- | -------------------------------------------------- |
| `unsupported-statement`      | `status: "supported"` with empty `evidence[]`      |
| `missing-unavailable-reason` | any non-`supported` status with no reason          |
| `missing-counter-hypothesis` | band `high` or `medium` with no counter-hypothesis |
| `priority-without-evidence`  | a priority assigned with empty `evidence[]`        |

`aggregateFindings` runs this over every finding and reports the results in
`FindingSet.violations`. It surfaces them rather than dropping the offending
finding — a module quietly producing invalid findings is worse than a
visible one.

The registry enforces the fifth rule at registration time: a
`pending-source` module with no `pendingReason` throws.

---

## There is no overall risk score

`FindingSet` has no `overallRisk`, no `score`, and no ranking across
modules. A single number would have to weight nine modules against each
other, and any such weighting would be invented — the hidden scoring this
architecture exists to prevent.

What it reports instead is every module's contribution separately,
including the ones that contributed nothing and why. `byPriority` orders
findings that already carry an OSAE priority; it assigns none.

---

## Module status, honestly

| Module               | Status           | Blocker                                                       |
| -------------------- | ---------------- | ------------------------------------------------------------- |
| AIS Integrity        | **ready**        | —                                                             |
| Navigation           | `pending-source` | GFW reports neither course nor speed on its event datasets    |
| Ownership            | `pending-source` | OpenCorporates catalogued at the IAL, not wired to the map    |
| Sanctions            | `pending-source` | OpenSanctions / OFAC / UN exist at the IAL, not wired         |
| Compliance           | `pending-source` | Equasis pending terms-of-service verification                 |
| Cargo                | `pending-source` | No manifest source connected                                  |
| Revenue              | `pending-source` | No NIMASA levy source connected                               |
| Environmental        | `pending-source` | NOAA / Open-Meteo connected at the IAL, not wired to the map  |
| Company Intelligence | `pending-source` | Needs OpenCorporates plus an entity-resolution path not built |

Every blocker was established by inspection or live probing, not assumed.

A `pending-source` module still runs and still returns a finding — one
carrying `status: "pending-source"` and its reason. The alternative is a
module that fabricates a score, or one that silently returns nothing, and
an officer cannot tell the latter apart from "we checked and found
nothing".

---

## AIS Integrity is an adapter

It reads what OSAE has already published (`getReport` / `getAssessment` —
the sanctioned consumer surface) and reshapes it. It never re-invokes
`AISBehaviourAnalyzer`, so a finding cannot disagree with the assessment an
officer sees on another screen.

Its counter-hypothesis is **counted, not authored**: severe weather, sparse
traffic and coverage-uncertain spans are the conditions under which a
transmission stop is equipment or coverage rather than intent, and the
analyzer already records all three. `likelihood` is the share of
observations carrying one — how much of the evidence argues the other way,
not a probability of innocence.

Two absences are stated explicitly, because both would otherwise render
identically to a clean vessel:

- OSAE holds no assessment → `insufficient-evidence`
- OSAE holds one with no interruptions → `not-applicable`

---

## Adding a module

Implement one interface and register it. **No UI change** — every surface
renders from `IntelligenceFinding`.

```ts
import type { RiskModule } from "@/services/intelligence";

export const ownershipModule: RiskModule = {
  id: "ownership", // add to RiskModuleId in types.ts if new
  label: "Ownership",
  description: "Recent beneficial-ownership changes.",
  status: "ready",
  requires: ["corporate registry"],
  async evaluate(context) {
    /* copy from the canonical engines; compute nothing */
  },
};
```

Register it at the composition point in `index.ts`, alongside
`aisIntegrityModule`. Modules register there rather than in
`module-registry.ts` because they import it — registering there would close
an import cycle.

**Before writing `evaluate`, check the ownership matrix in the contract.**
If the value you are about to compute appears there with another owner, you
are duplicating an engine. Read it from the owner instead.

Four rules the registry and validator will hold you to:

1. `pending-source` requires `pendingReason` — enforced at registration.
2. A `supported` finding requires evidence.
3. A `high` or `medium` band requires a counter-hypothesis.
4. Only OSAE sets `priority`.

---

## Provenance and the `sources` seam

`FindingContext.sources` carries the lineage of the data the caller fed
into the engines. Modules copy it into `provenance.sources`; they cannot
infer it, because by the time evidence reaches OSAE the connector it came
from is no longer attached to it.

When a caller supplies none, AIS Integrity marks evidence `unattributed`
rather than naming a plausible connector. Callers on the live path should
pass the `VesselProvenance` from the source that produced the positions.

---

## Testing

| Suite                                           | Covers                                     | Tests |
| ----------------------------------------------- | ------------------------------------------ | ----- |
| `tests/unit/intelligence-framework.test.ts`     | contract enforcement, registry, aggregator | 23    |
| `tests/unit/intelligence-ais-integrity.test.ts` | the adapter, end to end over OSAE          | 13    |
| `tests/unit/finding-evidence-viewer.test.tsx`   | vocabulary separation in the UI            | 11    |

On Windows, `bun run test:unit` cannot start: `@lovable.dev/mcp-js`
normalises its parent path to `/` but compares it against a `resolve()`d
child using the native separator, so the assertion always throws. Run the
suites with a temporary vitest config that omits the plugin. This is a
local tooling limitation, not a repository change.
