# CAPABILITY.CARGO — Cargo Intelligence Capability Specification v1.0

**Sprint CAP-01 · Status: FROZEN · Specification only — no implementation code, no architecture change.**

CAPABILITY.CARGO is the single canonical intelligence domain covering **Manifest Intelligence**,
**Container Intelligence** and **Revenue Intelligence**. It is a *declaration layer*: it names
entities, evidence shapes, relationships, projections and providers. It introduces no new runtime
surface. Every artefact below is expressed in terms of the frozen frameworks already in the
codebase:

| Frozen framework | Contract file | CAP-01 usage |
| --- | --- | --- |
| Evidence Provider Framework v1.0 | `src/connectors/framework/spec.ts` | Cargo providers implement `EvidenceProviderV1`, unchanged |
| Connector Framework | `src/services/ial/connectors/base.ts` | `supports()` advertises `CARGO`; no new method |
| Provider Resolver | `src/services/ial/connectors/resolver.ts` | Resolves cargo providers by capability, unchanged |
| IAL | `src/services/ial/types.ts` | `NormalizedEvidence.kind = "cargo"` (already exists) |
| IFE / Canonical UIP | `src/services/ife/unified.ts` | Cargo records flow into `uip.rawEvidence` / `uip.fused` |
| OKL / OIE / MIBC | `src/services/oie/*` | Cargo consumed as evidence, not as a special case |
| Projection Contract | `src/lib/projection-contract/registry.ts` | Three existing KPI entries + capability entries |
| Auth / Cloud backend | unchanged | no schema, no RLS, no role change |

---

## 1. Canonical Cargo Domain Model

Cargo entities MUST be expressed with the existing `EntityKind` union
(`vessel | company | person | port | cargo | voyage`). Cargo-specific concepts are **sub-types
encoded in the canonical id namespace**, not new kinds. This is the rule that keeps the
architecture frozen.

| Canonical entity | EntityKind | Canonical id pattern | Required identifiers |
| --- | --- | --- | --- |
| Manifest | `cargo` | `cargo:manifest:{issuer}:{manifestNo}` | manifestNo, issuer, voyageRef |
| Bill of Lading | `cargo` | `cargo:bol:{carrierScac}:{bolNo}` | bolNo, carrier, shipper, consignee |
| Container | `cargo` | `cargo:container:{isoUnitNo}` | ISO 6346 unit no (11 char, check-digit valid) |
| Cargo Item | `cargo` | `cargo:item:{bolNo}:{lineNo}` | lineNo, description, quantity, weightKg |
| Commodity | `cargo` | `cargo:commodity:hs:{hsCode}` | HS code (6–10 digit) |
| Customs Declaration | `cargo` | `cargo:declaration:{customsAuthority}:{sadNo}` | sadNo, regime, declarant |
| Revenue Assessment | `cargo` | `cargo:assessment:{authority}:{assessmentNo}` | assessedValue, dutyPayable, currency |
| Voyage | `voyage` | `voyage:{imo}:{departureIso}` | vessel IMO, departure, arrival |
| Vessel | `vessel` | `vessel:imo:{imo}` | IMO 7-digit |
| Port | `port` | `port:unlocode:{unlocode}` | UN/LOCODE |
| Shipper / Consignee / Carrier / Agent | `company` | `company:{registry}:{regNo}` | name + registry id |
| Declarant / Master (natural person) | `person` | `person:{registry}:{id}` | name + role |

**Canonical units and formats (inherited, non-negotiable):** SI units (kg, m³, m), ISO 8601 UTC
timestamps, ISO 3166 country codes, ISO 4217 currency codes, UN/LOCODE ports, 7-digit IMO,
ISO 6346 container numbers, HS commodity codes.

### Relationship graph

```text
Voyage ──carried_by──► Vessel
  │                      │
  │ calls_at             │ calls_at
  ▼                      ▼
Port ◄──loading/discharge── Manifest
              │
              │ contains
              ▼
     Bill of Lading ──consigned_to──► Consignee (company)
       │      │      ──shipped_by───► Shipper   (company)
       │      │      ──carried_by───► Carrier   (company)
       │      └──covers──► Container ──stows──► Cargo Item
       │                                  │
       │                                  └──classified_as──► Commodity (HS)
       ▼
  Customs Declaration ──assessed_by──► Revenue Assessment
```

Relationships are carried as canonical id references inside
`NormalizedEvidence.fields` (`rel.*` namespace) — the MKG already ingests id references and needs
no new edge type.

---

## 2. Cargo EvidencePackage Specification (Provider Framework v1.0 compatible)

A Cargo provider returns `NormalizedEvidence[]` — **no new interface**. Cargo-ness is expressed by
three already-existing fields plus a reserved field vocabulary.

```
NormalizedEvidence {
  id           evidence:{connectorId}:{providerRecordId}:{hash12}
  source       ConnectorId (e.g. "customs", "nimasa", "carrier-edi")
  sourceName   human-readable provider name
  grade        VERIFIED | CORROBORATED | OBSERVED | REPORTED | INFERRED | UNKNOWN
  entity       CanonicalEntityRef  → kind "cargo" | "voyage" | "vessel" | "port" | "company"
  kind         "cargo"   (manifest/BoL/container/item)
               "voyage"  (voyage-level cargo movement)
               "port-call" (gate-in / gate-out / discharge events)
               "compliance" (customs declaration / assessment status)
  fields       reserved cargo vocabulary — see below
  observedAt   when the fact was true (manifest lodgement / gate move time)
  retrievedAt  when IAL fetched it
  freshnessSeconds  recomputed by the Package Builder
  hash         stableHash() over the normalised payload
  providerRecordId  provider-native key
  units        { grossWeight: "kg", volume: "m3", declaredValue: "NGN" }
  excerpt      short human-readable citation line
}
```

### Reserved cargo field vocabulary

| Group | Fields |
| --- | --- |
| Manifest | `manifest.number`, `manifest.type` (`import`\|`export`\|`transhipment`), `manifest.lodgedAt`, `manifest.lineCount`, `manifest.status` |
| Bill of Lading | `bol.number`, `bol.type` (`master`\|`house`), `bol.issuedAt`, `bol.placeOfReceipt`, `bol.placeOfDelivery` |
| Container | `container.number`, `container.isoType`, `container.sizeFt`, `container.status` (`full`\|`empty`), `container.sealNumber`, `container.gateInAt`, `container.gateOutAt`, `container.terminal` |
| Cargo item | `cargo.description`, `cargo.hsCode`, `cargo.packages`, `cargo.grossWeightKg`, `cargo.netWeightKg`, `cargo.volumeM3`, `cargo.marks` |
| Value / revenue | `value.declared`, `value.currency`, `value.cif`, `duty.rate`, `duty.assessed`, `duty.paid`, `duty.exemptionCode` |
| Customs | `customs.sadNumber`, `customs.regime`, `customs.office`, `customs.status`, `customs.releasedAt`, `customs.inspection` |
| Relationships | `rel.voyage`, `rel.vessel`, `rel.manifest`, `rel.bol`, `rel.container`, `rel.shipper`, `rel.consignee`, `rel.carrier`, `rel.portOfLoading`, `rel.portOfDischarge` |

### Validation rules (flag, never drop — existing `validateRecords` codes only)

| Condition | Issue code | Severity |
| --- | --- | --- |
| Container number fails ISO 6346 check digit | `missing-required` | error |
| HS code absent on a dutiable cargo item | `missing-required` | warn |
| Weight supplied without a unit, or unit ≠ kg | `unit-mismatch` | error |
| `manifest.lodgedAt` after voyage arrival | `timestamp-drift` | warn |
| Same `bol.number` + carrier from two providers | `duplicate` | info |
| Manifest older than 90 days used for a live assessment | `stale` | warn |
| Provider grade `REPORTED` or below on a revenue figure | `low-source-confidence` | warn |

### Grading policy (OC-001 lockstep)

`VERIFIED` — customs authority of record (NCS/NIMASA) primary data ·
`CORROBORATED` — two independent providers agree on the same field ·
`OBSERVED` — terminal/carrier operational event feed ·
`REPORTED` — agent- or shipper-declared, unverified ·
`INFERRED` — derived by Seaphore (e.g. duty recomputed from HS + CIF) ·
`UNKNOWN` — provenance not establishable. Every projected number wears the chip for its grade.

---

## 3. Canonical UIP Projections

Cargo evidence enters the UIP through the **existing** IFE path
(`IAL → normalize → validate → correlate → fuse → buildUnifiedIntelligencePackage`). Cargo adds
**no new UIP field**. All three intelligence products are pure derivations of `uip.rawEvidence`
(pre-fusion facts) and `uip.fused` (resolved entity view).

| Projection | Input selector | Output shape (derived, not stored) | Confidence |
| --- | --- | --- | --- |
| **Manifest Intelligence** | `kind === "cargo"` && `fields["manifest.number"]` | manifests indexed, lines, declared vs carried delta, lodgement timeliness, amendment count | min-grade across contributing records |
| **Container Intelligence** | `kind ∈ {"cargo","port-call"}` && `fields["container.number"]` | movements tracked, dwell time, gate-in/out pairs, unmatched moves, seal discrepancies | min-grade across contributing records |
| **Revenue Intelligence** | `kind ∈ {"cargo","compliance"}` && value/duty fields | findings, estimated leakage, currency, critical-or-high count, top drivers | grade of the weakest field in the calculation |

Revenue Intelligence MUST continue to be computed by the existing detector set
(`src/services/revenue-leakage`, `capability.revenue-leakage-detection`) over `uip.rawEvidence`.
CAP-01 does not create a second money path.

Panels render through the existing `dashboard-projection.ts` + `PanelStateNotice` pattern: when no
UIP or no cargo evidence exists, the panel **names the operational state** (No Provider / Waiting
for Credentials / Provider Offline / No Evidence) instead of showing a number.

---

## 4. Projection Contract (declarations required before any provider ships)

Existing entries already reserved by the coverage model — no file change needed at spec time:

| Contract id | Surface | State |
| --- | --- | --- |
| `kpi.manifest-intelligence` | Mission Control ribbon · Manifest | PROJECTED |
| `kpi.container-intelligence` | Mission Control ribbon · Container | PROJECTED |
| `kpi.revenue-intelligence` | Mission Control ribbon · Revenue at Risk | PROJECTED |
| `mig.dashboard-manifest-projection` | Mission Control · Manifest panel | PROJECTED |
| `mig.dashboard-revenue-projection` | Mission Control · Revenue Assurance panel | PROJECTED |
| `capability.revenue-leakage-detection` | `/revenue-leakage` | PROJECTED |

Entries each future cargo provider MUST add at implementation time (Golden Rule / Symmetry):

| Contract id | Declaration |
| --- | --- |
| `capability.cargo` | PROJECTED — Manifest, Container and Revenue panels + `/revenue-leakage` |
| `capability.cargo.customs-compliance` | PROJECTED — Compliance hub declaration status |
| `capability.cargo.trade-flow` | PROJECTED — Cargo Intelligence Centre flow view |
| `provider.<name>.projectionContractId` | required by `EvidenceProviderV1` certification |
| `capability.cargo.hs-normalisation` | INTERNAL ONLY — code mapping, no officer surface |
| `capability.cargo.container-checkdigit` | INTERNAL ONLY — validation utility |

---

## 5. OIE Consumption Model

The OIE consumes Cargo evidence **only** via the `EvidencePackage` / UIP — never from a provider.
Six officer-facing intelligence products, each satisfying the IBE 9-step response contract with
citations to `evidence.id`:

| Product | Question answered | Derivation | Officer output |
| --- | --- | --- | --- |
| **Cargo Tracking** | Where is this consignment now? | container gate events + port-call evidence ordered by `observedAt` | timeline with per-hop confidence chip |
| **Revenue Leakage** | Is the state under-collecting on this cargo? | `scanForLeakage(uip.rawEvidence)` — undervaluation, HS misdeclaration, quantity variance, exemption abuse, duty non-payment | findings, ₦ exposure, evidence citations, recommended action |
| **Customs Compliance** | Was this cleared lawfully and on time? | declaration status vs manifest vs release timestamps | compliance state + gap list |
| **Trade Flow** | What is moving between these ports/commodities? | aggregation over HS + port pair + period | flow view with coverage caveat |
| **Cargo Risk** | Should this consignment be examined? | risk signals fused with sanctions/ownership/behaviour evidence via IFE | ranked recommendation, never an auto-decision |
| **Confidence Statement** | How much of this can we stand behind? | OC-001 grade rollup + missing-kind list from `EvidencePackage.missing` | explicit "what we do not know" block |

Non-negotiable: the system recommends, the officer decides; every number wears a confidence chip;
absent evidence is stated as absent, never rendered as zero.

---

## 6. Candidate Provider Matrix (specification only — no connectors built)

| Provider | Entities supported | Auth model | Coverage | Grade ceiling | Priority |
| --- | --- | --- | --- | --- | --- |
| Nigeria Customs Service (NICIS/SAD) | Declaration, Assessment, Manifest, Cargo Item, Commodity | MoU + issued API key / secure file exchange | Nigeria, authoritative | VERIFIED | **P0** |
| NIMASA cargo & voyage returns | Manifest, Voyage, Vessel, Port | Internal integration | Nigeria, authoritative | VERIFIED | **P0** |
| Terminal operator gate systems (APMT, Ports & Cargo, Josepdam) | Container, gate events, dwell | Per-terminal API key | Per-terminal, deep | OBSERVED | **P1** |
| Carrier / NVOCC EDI (CUSCAR, IFTMIN, BAPLIE) | Manifest, BoL, Container, Cargo Item | SFTP/AS2 partner credentials | Carrier-scoped, high fidelity | CORROBORATED | **P1** |
| UN Comtrade | Commodity, trade-flow baselines | Public / free key | Global, aggregate, lagging | REPORTED | **P2** |
| Port Community System (where available) | Manifest, Container, port-call linkage | PCS account | Port-scoped | OBSERVED | **P2** |
| Commercial container track & trace (project44 / Datalastic-class) | Container, milestones | Commercial API key | Global, partial | OBSERVED | **P3** |
| Open commodity price references | Commodity valuation benchmark for undervaluation tests | Public | Global | INFERRED (derived) | **P3** |

All candidates fit `EvidenceProviderV1` unchanged: `connect`, `healthCheck`, `search`, `normalize`,
`validate`, plus `specVersion`, `projectionContractId`. Credentials go through the existing secret
mechanism; missing credentials surface as **Waiting for Credentials**, not as a fake number.

### Recommended implementation order

1. **NCS declarations (P0)** — unlocks Revenue Intelligence with VERIFIED grade; the only source
   that makes leakage findings actionable.
2. **NIMASA manifest/voyage returns (P0)** — unlocks Manifest Intelligence and links cargo to the
   existing vessel/voyage graph.
3. **Terminal gate systems (P1)** — unlocks Container Intelligence and dwell analytics.
4. **Carrier EDI (P1)** — corroboration layer; upgrades single-source records to CORROBORATED.
5. **UN Comtrade + price references (P2/P3)** — benchmark layer for undervaluation detection.
6. **Commercial track & trace (P3)** — coverage fill only, after authoritative sources exist.

---

## 7. KPI Mapping

| Dashboard KPI | `KPI_DECLARATIONS` key | Capability | Contract id | Powered by |
| --- | --- | --- | --- | --- |
| Manifest Intelligence — "Manifest Records Indexed" | `manifest` | `CARGO` | `kpi.manifest-intelligence` | count of distinct `cargo:manifest:*` entities in UIP |
| Container Intelligence — "Container Movements Tracked" | `container` | `CARGO` | `kpi.container-intelligence` | count of gate/port-call events keyed by `container.number` |
| Revenue Intelligence — "Revenue at Risk" | `revenue` | `CARGO` | `kpi.revenue-intelligence` | Σ estimated leakage from `scanForLeakage(uip.rawEvidence)` |

Each KPI keeps `sourceOfTruth: src/lib/server/intelligence/coverage.server.ts` and the DIAG-02 smart
states. Until a P0 cargo provider is certified, all three legitimately report
**NO_PROVIDER / WAITING_FOR_CREDENTIALS** — that is the honest state, not a defect.

---

## 8. Architecture Validation Report

| Frozen component | Change required | Evidence |
| --- | --- | --- |
| Evidence Provider Framework v1.0 | **None** | Cargo providers satisfy `EvidenceProviderV1` as-is; no addition to `FROZEN_PROVIDER_API` |
| Connector Framework | **None** | capability advertised through existing `supports()` |
| Provider Resolver | **None** | resolves by capability string; `CARGO` needs no resolver code |
| IAL types | **None** | `EntityKind` already includes `cargo` and `voyage`; `kind` already includes `cargo`, `port-call`, `compliance` |
| Validation pipeline | **None** | all cargo rules map onto existing `ValidationIssue` codes |
| IFE / Canonical UIP | **None** | cargo records ride `rawEvidence` / `fused`; no new UIP field |
| OKL / OIE / MIBC | **None** | cargo consumed as evidence; products are OIE playbooks over existing package shape |
| Projection Contract | **None at spec time** | three KPI entries already exist; provider entries are added by the provider sprint, which is the normal Symmetry rule |
| Authentication / roles | **None** | no new role, no new gate |
| Backend / Cloud schema | **None** | no table, no column, no RLS policy, no migration |
| Dashboard code | **None** | Manifest/Revenue panels already project from the UIP (Sprint MIG-01) |

**Verdict: PASS — zero architecture changes required.** CAPABILITY.CARGO is additive and
declaration-only. The first line of implementation code belongs to a later provider sprint
(CAP-02, NCS declarations), which will register its `projectionContractId` before certification.

**Design tension recorded, not silently resolved:** cargo sub-types (Manifest, BoL, Container,
Cargo Item, Commodity, Declaration, Assessment) are all packed into `EntityKind = "cargo"` and
disambiguated by id namespace. This is what keeps the freeze intact. If graph queries later need
first-class cargo sub-kinds, that is a deliberate v1.1 `EntityKind` amendment — not something a
provider sprint may introduce.
