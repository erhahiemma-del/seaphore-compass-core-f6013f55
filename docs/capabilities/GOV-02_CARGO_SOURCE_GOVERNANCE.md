# GOV-02 — Cargo Source Governance & Confidence Model

Status: FROZEN · 2026-08-04 · Specification only (no providers, no connectors)

Scope guarantee: no changes to the Evidence Provider Framework, Provider Resolver, IAL, IFE,
Canonical UIP, OIE, MIBC, Authentication, or CAPABILITY.CARGO v1.0.

Code of record:
- `src/services/cargo-governance/types.ts` — governance and confidence vocabulary
- `src/services/cargo-governance/source-registry.ts` — National Maritime Data Source Registry
- `src/services/cargo-governance/cargo-confidence.ts` — Cargo Confidence Model
- `src/services/cargo-governance/matrices.ts` — Trust Classification & Provider Priority matrices
- `tests/unit/cargo-governance.test.ts` — governance contract tests

## 1. National Maritime Data Source Registry

Every source is classified as Government, Commercial, Supporting or Derived, and records
authority, jurisdiction, evidence types, supported capabilities, trust level, coverage
(breadth/depth/note), update frequency, priority, integration status and recommended usage.

| Source | Class | Authority | Trust | Freq | Priority | Status |
|---|---|---|---|---|---|---|
| NCS Declarations (NICIS II) | Government | Nigeria Customs Service | Authority of record | Event-driven | P0 | Specified |
| NIMASA Returns | Government | NIMASA | Authority of record | Daily | P0 | Specified |
| ImportGenius | Commercial | ImportGenius | Verified commercial | Weekly | P1 | Not started |
| Volza | Commercial | Volza | Aggregated | Monthly | P2 | Not started |
| TradeMo | Commercial | TradeMo | Aggregated | Monthly | P3 | Not started |
| MarineTraffic | Commercial | MarineTraffic | Verified commercial | Realtime | P1 | Integrated |
| Datalastic | Commercial | Datalastic | Verified commercial | Realtime | P2 | Integrated |
| Equasis | Supporting | EC / flag-state consortium | Regulatory | Monthly | P1 | Integrated |
| OpenCorporates | Supporting | OpenCorporates | Aggregated | Weekly | P1 | Integrated |
| IMO GISIS | Supporting | IMO | Regulatory | Monthly | P1 | Integrated |
| OFAC | Supporting | US Treasury OFAC | Authority of record | Daily | P0 | Integrated |
| UN Security Council | Supporting | UNSC | Authority of record | Weekly | P0 | Integrated |
| Global Fishing Watch | Derived | Global Fishing Watch | Derived analytic | Daily | P2 | Credentials pending |

## 2. Cargo Confidence Specification

`confidence = Σ (axisWeight × axisAchievement)`, expressed 0–100 and graded A–E.

| Axis | Weight |
|---|---|
| Government declaration | 0.30 |
| NIMASA return | 0.15 |
| Bill of Lading | 0.13 |
| AIS / voyage | 0.12 |
| Company verification | 0.10 |
| Revenue assessment | 0.09 |
| Sanctions screening | 0.07 |
| Supporting intelligence | 0.04 |

Achievement per axis: absent = 0; present = 0.60 baseline; +0.25 × record quality
(completeness × freshness); +0.15 × corroboration (three or more independent sources = full);
a conflicting axis is halved and the conflict is reported.

Grades: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 35, E < 35.

Every assessment returns: score, grade, per-axis evidence breakdown (weight, achievement,
points, contributing source ids), missing evidence ranked by lost points, conflicting evidence,
and a one-sentence officer-facing explanation ending in "The system recommends; the officer decides."

## 3. Trust Classification Matrix

| Trust level | Weight ceiling | Usage rule |
|---|---|---|
| Authority of record | 1.00 | May stand alone for an officer decision; contradictions surfaced, never silently resolved |
| Regulatory | 0.90 | Anchors identity and compliance; needs an authority record before revenue action |
| Verified commercial | 0.75 | Corroboration only; never the sole basis for enforcement |
| Aggregated | 0.60 | Context and pattern only; always labelled with retrieval date |
| Open source | 0.45 | Lead generation only; needs independent corroboration |
| Derived analytic | 0.40 | Always labelled INFERRED; raises questions, never answers them |

## 4. Provider Priority Matrix

- **P0** Mandatory for a defensible national cargo picture — NCS Declarations, NIMASA Returns, OFAC, UN Security Council.
- **P1** High-value corroboration — ImportGenius, MarineTraffic, Equasis, OpenCorporates, IMO GISIS.
- **P2** Breadth and redundancy — Volza, Datalastic, Global Fishing Watch.
- **P3** Optional enrichment on a named officer requirement — TradeMo.

## 5. Architecture Validation

- No architecture changes: the sprint adds one new leaf module tree (`src/services/cargo-governance/`) plus three Projection Contract entries. No existing engine imports were altered.
- CAPABILITY.CARGO v1.0 unchanged: `docs/capabilities/CARGO_CAPABILITY_v1.md` untouched; entity and relationship vocabulary reused, not extended.
- Golden Rule satisfied: source registry and confidence model declared PROJECTED; the weighting matrices declared INTERNAL with justification in `src/lib/projection-contract/registry.ts`.
- Ready for EP-CARGO-01: any new cargo provider registers against a registry source id, inherits its trust ceiling, and reports its axes into `assessCargoConfidence`.
