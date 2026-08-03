# SPRINT GOV-01 — Intelligence Capability Catalog · Validation Report

Frozen: 2026-08-03
Source of truth: `src/lib/intelligence/capability-catalog.ts`
Governance view: `/admin/capability-catalog` (read-only, linked from the Administration Center)
Contract tests: `tests/unit/capability-catalog.test.ts` — 21 tests, all passing

## 1. Capability Catalog

Eight capabilities, one per mandated domain. Each entry carries: purpose, status,
canonical entities, evidence providers, canonical UIP projections, OIE outputs,
dashboard surfaces, Copilot features, KPIs, dependencies, owner, maturity level,
and review date.

| Capability | Domain | Status | Maturity | Owner |
| --- | --- | --- | --- | --- |
| Vessel Intelligence | vessel | OPERATIONAL | 4 | Intelligence Acquisition Layer (IAL) / IFE |
| Cargo Intelligence | cargo | OPERATIONAL | 3 | Cargo Intelligence Capability (CAP-02, EP-CARGO-01) |
| Revenue Intelligence | revenue | OPERATIONAL | 3 | Revenue Leakage Detection Engine (Sprint 1G) |
| Risk Intelligence | risk | OPERATIONAL | 4 | Operational Knowledge Layer (OKL) / OSAE / PIE |
| Compliance Intelligence | compliance | DESIGNING | 3 | Compliance Engine (Sprint COMP-01, planned) |
| Port Intelligence | port | DESIGNING | 3 | Port Operations Intelligence (Sprint PORT-01, in design) |
| Environmental Intelligence | environmental | OPERATIONAL | 5 | Environmental Intelligence Provider (Sprint EP-05) |
| Operational Intelligence | operational | OPERATIONAL | 4 | OIE / OKL / MIBC Pipeline |

Summary: 8 total — 6 OPERATIONAL, 2 DESIGNING, 0 PLANNED.

## 2. Dependency Matrix

Rendered in the Dependencies tab of the governance view as an adjacency table plus
edge list, derived from `DEPENDENCY_MATRIX`.

Validated properties:

- No self-referencing edges.
- Every `from` and `to` id resolves to a catalog entry (no orphan dependencies).
- Environmental Intelligence and Vessel Intelligence are foundational (zero dependencies).
- Operational Intelligence depends on the largest number of capabilities, matching its
  role as the fusion/briefing consumer.

## 3. Roadmap View

Rendered in the Roadmap tab, ordered by status then maturity, phased against
repository evidence and OPS-03 certification findings. Phase 1 hardens OPERATIONAL
capabilities to maturity 5; Phase 2 promotes the two DESIGNING capabilities
(Compliance, Port) once their engines and evidence providers land.

## 4. Validation Report

| Check | Result |
| --- | --- |
| Exactly 8 capabilities, unique ids, `cap.*` naming convention | PASS |
| All 8 mandated domains covered exactly once | PASS |
| Required descriptive fields present (name, purpose, owner, ISO review date) | PASS |
| Status restricted to OPERATIONAL / DESIGNING / PLANNED | PASS |
| Maturity within 1–5; OPERATIONAL implies maturity >= 3 | PASS |
| Every capability declares >= 1 KPI | PASS |
| Every capability declares >= 1 dashboard surface | PASS |
| Every capability declares >= 1 canonical UIP projection | PASS |
| Dependency matrix free of self-references and orphan targets | PASS |
| Every referenced evidence provider id exists in `src/connectors/catalog.ts` | PASS |
| Accessor functions (`getCapability`, `capabilitiesByStatus`, `capabilitiesByDomain`, `catalogSummary`) consistent with data | PASS |

Runtime architecture unchanged: the catalog is a declarative governance projection.
It registers nothing, resolves nothing, and is not consulted by the OIE, IAL, IFE,
or any acquisition path.

## 5. Honesty Notes

- Provider references are grounded in the Evidence Provider Catalog and enforced by test.
- Status and maturity reflect shipped repository evidence, not aspiration; DESIGNING
  capabilities are labelled as such rather than presented as live.
- The governance view is read-only; there is no write path from the Admin Console
  into the catalog.
