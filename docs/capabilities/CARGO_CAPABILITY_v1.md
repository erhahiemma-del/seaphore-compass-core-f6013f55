# CAPABILITY.CARGO — Cargo Intelligence Capability Specification v1.0

**Sprint CAP-01 · Status: FROZEN · Specification only — no implementation code, no architecture change.**

CAPABILITY.CARGO is the single canonical intelligence domain covering **Manifest Intelligence**,
**Container Intelligence** and **Revenue Intelligence**. It is a _declaration layer_: it names
entities, evidence shapes, relationships, projections and providers. It introduces no new runtime
surface. Every artefact below is expressed in terms of the frozen frameworks already in the
codebase:

| Frozen framework                 | Contract file                             | CAP-01 usage                                              |
| -------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Evidence Provider Framework v1.0 | `src/connectors/framework/spec.ts`        | Cargo providers implement `EvidenceProviderV1`, unchanged |
| Connector Framework              | `src/services/ial/connectors/base.ts`     | `supports()` advertises `CARGO`; no new method            |
| Provider Resolver                | `src/services/ial/connectors/resolver.ts` | Resolves cargo providers by capability, unchanged         |
| IAL                              | `src/services/ial/types.ts`               | `NormalizedEvidence.kind = "cargo"` (already exists)      |
| IFE / Canonical UIP              | `src/services/ife/unified.ts`             | Cargo records flow into `uip.rawEvidence` / `uip.fused`   |
| OKL / OIE / MIBC                 | `src/services/oie/*`                      | Cargo consumed as evidence, not as a special case         |
| Projection Contract              | `src/lib/projection-contract/registry.ts` | Three existing KPI entries + capability entries           |
| Auth / Cloud backend             | unchanged                                 | no schema, no RLS, no role change                         |

---

## 1. Canonical Cargo Domain Model

Cargo entities MUST be expressed with the existing `EntityKind` union
(`vessel | company | person | port | cargo | voyage`). Cargo-specific concepts are **sub-types
encoded in the canonical id namespace**, not new kinds. This is the rule that keeps the
architecture frozen.

| Canonical entity                    | EntityKind | Canonical id pattern                             | Required identifiers                                                       |
| ----------------------------------- | ---------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Manifest                            | `cargo`    | `cargo:manifest:{issuer}:{manifestNo}`           | manifestNo, issuer, voyageRef                                              |
| Bill of Lading                      | `cargo`    | `cargo:bol:{carrierScac}:{bolNo}`                | bolNo, carrier, shipper, consignee                                         |
| Container                           | `cargo`    | `cargo:container:{isoUnitNo}`                    | ISO 6346 unit no (11 char, check-digit valid)                              |
| Cargo Item                          | `cargo`    | `cargo:item:{bolNo}:{lineNo}`                    | lineNo, description, quantity, weightKg                                    |
| Commodity                           | `cargo`    | `cargo:commodity:{hsCode}:{variantKey}`          | commodity description + governing HS code                                  |
| HS Code                             | `cargo`    | `cargo:hs:{edition}:{hsCode}`                    | HS code (6–10 digit), nomenclature edition (e.g. `hs2022`), duty rate band |
| Customs Declaration                 | `cargo`    | `cargo:declaration:{customsAuthority}:{sadNo}`   | sadNo, regime, declarant                                                   |
| Revenue Assessment                  | `cargo`    | `cargo:assessment:{authority}:{assessmentNo}`    | assessedValue, dutyPayable, currency                                       |
| Voyage                              | `voyage`   | `voyage:{imo}:{departureIso}`                    | vessel IMO, departure, arrival                                             |
| Port Call                           | `voyage`   | `voyage:portcall:{imo}:{unlocode}:{atdOrEtaIso}` | vessel IMO, UN/LOCODE, arrival + departure timestamps                      |
| Vessel                              | `vessel`   | `vessel:imo:{imo}`                               | IMO 7-digit                                                                |
| Port                                | `port`     | `port:unlocode:{unlocode}`                       | UN/LOCODE                                                                  |
| Shipping Line (carrier)             | `company`  | `company:scac:{scac}`                            | SCAC or carrier registry id, legal name                                    |
| Shipper                             | `company`  | `company:{registry}:{regNo}`                     | name + registry id (role `shipper`)                                        |
| Consignee                           | `company`  | `company:{registry}:{regNo}`                     | name + registry id (role `consignee`)                                      |
| Agent / NVOCC / Freight forwarder   | `company`  | `company:{registry}:{regNo}`                     | name + registry id + role                                                  |
| Declarant / Master (natural person) | `person`   | `person:{registry}:{id}`                         | name + role                                                                |

**HS Code vs Commodity.** They are separate entities on purpose: an HS Code is a _nomenclature
node_ (stable, edition-scoped, carries the duty rate) while a Commodity is the _thing actually
shipped_ (described in free text by the declarant). Misdeclaration is precisely a wrong edge
between the two, so the model must be able to represent that edge as wrong.

**Port Call vs Voyage.** A Port Call is a leg of a Voyage, keyed to one port and one arrival. It is
the join point where container gate events become attributable to a voyage and a manifest.

**Shipping Line vs Shipper/Consignee.** All three are `company`; the distinction is the
relationship role (`rel.carrier` / `rel.shipper` / `rel.consignee`), never a different entity kind.
The same legal entity may hold different roles across shipments, and the model must not collapse
that.

**Canonical units and formats (inherited, non-negotiable):** SI units (kg, m³, m), ISO 8601 UTC
timestamps, ISO 3166 country codes, ISO 4217 currency codes, UN/LOCODE ports, 7-digit IMO,
ISO 6346 container numbers, HS commodity codes.

### Entity relationships (canonical edge list)

| From                | Edge            | To                         | Cardinality | Carried as                       |
| ------------------- | --------------- | -------------------------- | ----------- | -------------------------------- |
| Voyage              | `carried_by`    | Vessel                     | n:1         | `rel.vessel`                     |
| Voyage              | `has_leg`       | Port Call                  | 1:n         | `rel.voyage` on the call         |
| Port Call           | `occurs_at`     | Port                       | n:1         | `rel.port`                       |
| Manifest            | `declared_for`  | Voyage                     | n:1         | `rel.voyage`                     |
| Manifest            | `lodged_at`     | Port                       | n:1         | `rel.portOfDischarge`            |
| Manifest            | `contains`      | Bill of Lading             | 1:n         | `rel.manifest` on the BoL        |
| Bill of Lading      | `shipped_by`    | Shipper (company)          | n:1         | `rel.shipper`                    |
| Bill of Lading      | `consigned_to`  | Consignee (company)        | n:1         | `rel.consignee`                  |
| Bill of Lading      | `carried_by`    | Shipping Line (company)    | n:1         | `rel.carrier`                    |
| Bill of Lading      | `covers`        | Container                  | 1:n         | `rel.bol` on the container       |
| Container           | `stows`         | Cargo Item                 | 1:n         | `rel.container`                  |
| Container           | `moved_at`      | Port Call                  | n:n         | `rel.portCall` on the gate event |
| Cargo Item          | `is_commodity`  | Commodity                  | n:1         | `rel.commodity`                  |
| Commodity           | `classified_as` | HS Code                    | n:1         | `cargo.hsCode` + `rel.hsCode`    |
| Customs Declaration | `declares`      | Bill of Lading             | n:n         | `rel.bol`                        |
| Customs Declaration | `filed_by`      | Declarant (person/company) | n:1         | `rel.declarant`                  |
| Revenue Assessment  | `assesses`      | Customs Declaration        | 1:1         | `rel.declaration`                |

An entity relationship diagram of the same edge list is kept alongside this spec as
`Cargo_Intelligence_ERD.mmd` (Mermaid ER diagram).

Relationships are carried as canonical id references inside
`NormalizedEvidence.fields` (`rel.*` namespace) — the MKG already ingests id references and needs
no new edge type. A relationship never overrides provenance: an edge inherits the grade of the
evidence record that asserted it, and two providers asserting the same edge is what produces
`CORROBORATED`.

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

| Group           | Fields                                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest        | `manifest.number`, `manifest.type` (`import`\|`export`\|`transhipment`), `manifest.lodgedAt`, `manifest.lineCount`, `manifest.status`                                                        |
| Bill of Lading  | `bol.number`, `bol.type` (`master`\|`house`), `bol.issuedAt`, `bol.placeOfReceipt`, `bol.placeOfDelivery`                                                                                    |
| Container       | `container.number`, `container.isoType`, `container.sizeFt`, `container.status` (`full`\|`empty`), `container.sealNumber`, `container.gateInAt`, `container.gateOutAt`, `container.terminal` |
| Cargo item      | `cargo.description`, `cargo.hsCode`, `cargo.packages`, `cargo.grossWeightKg`, `cargo.netWeightKg`, `cargo.volumeM3`, `cargo.marks`                                                           |
| Value / revenue | `value.declared`, `value.currency`, `value.cif`, `duty.rate`, `duty.assessed`, `duty.paid`, `duty.exemptionCode`                                                                             |
| Customs         | `customs.sadNumber`, `customs.regime`, `customs.office`, `customs.status`, `customs.releasedAt`, `customs.inspection`                                                                        |
| Relationships   | `rel.voyage`, `rel.vessel`, `rel.manifest`, `rel.bol`, `rel.container`, `rel.shipper`, `rel.consignee`, `rel.carrier`, `rel.portOfLoading`, `rel.portOfDischarge`                            |

### Validation rules (flag, never drop — existing `validateRecords` codes only)

| Condition                                              | Issue code              | Severity |
| ------------------------------------------------------ | ----------------------- | -------- |
| Container number fails ISO 6346 check digit            | `missing-required`      | error    |
| HS code absent on a dutiable cargo item                | `missing-required`      | warn     |
| Weight supplied without a unit, or unit ≠ kg           | `unit-mismatch`         | error    |
| `manifest.lodgedAt` after voyage arrival               | `timestamp-drift`       | warn     |
| Same `bol.number` + carrier from two providers         | `duplicate`             | info     |
| Manifest older than 90 days used for a live assessment | `stale`                 | warn     |
| Provider grade `REPORTED` or below on a revenue figure | `low-source-confidence` | warn     |

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

| Projection                 | Input selector                                                 | Output shape (derived, not stored)                                                         | Confidence                                    |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **Manifest Intelligence**  | `kind === "cargo"` && `fields["manifest.number"]`              | manifests indexed, lines, declared vs carried delta, lodgement timeliness, amendment count | min-grade across contributing records         |
| **Container Intelligence** | `kind ∈ {"cargo","port-call"}` && `fields["container.number"]` | movements tracked, dwell time, gate-in/out pairs, unmatched moves, seal discrepancies      | min-grade across contributing records         |
| **Revenue Intelligence**   | `kind ∈ {"cargo","compliance"}` && value/duty fields           | findings, estimated leakage, currency, critical-or-high count, top drivers                 | grade of the weakest field in the calculation |

Revenue Intelligence MUST continue to be computed by the existing detector set
(`src/services/revenue-leakage`, `capability.revenue-leakage-detection`) over `uip.rawEvidence`.
CAP-01 does not create a second money path.

Panels render through the existing `dashboard-projection.ts` + `PanelStateNotice` pattern: when no
UIP or no cargo evidence exists, the panel **names the operational state** (No Provider / Waiting
for Credentials / Provider Offline / No Evidence) instead of showing a number.

---

## 4. Projection Contract (declarations required before any provider ships)

Existing entries already reserved by the coverage model — no file change needed at spec time:

| Contract id                            | Surface                                   | State     |
| -------------------------------------- | ----------------------------------------- | --------- |
| `kpi.manifest-intelligence`            | Mission Control ribbon · Manifest         | PROJECTED |
| `kpi.container-intelligence`           | Mission Control ribbon · Container        | PROJECTED |
| `kpi.revenue-intelligence`             | Mission Control ribbon · Revenue at Risk  | PROJECTED |
| `mig.dashboard-manifest-projection`    | Mission Control · Manifest panel          | PROJECTED |
| `mig.dashboard-revenue-projection`     | Mission Control · Revenue Assurance panel | PROJECTED |
| `capability.revenue-leakage-detection` | `/revenue-leakage`                        | PROJECTED |

Entries each future cargo provider MUST add at implementation time (Golden Rule / Symmetry):

| Contract id                             | Declaration                                                             |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `capability.cargo`                      | PROJECTED — Manifest, Container and Revenue panels + `/revenue-leakage` |
| `capability.cargo.customs-compliance`   | PROJECTED — Compliance hub declaration status                           |
| `capability.cargo.trade-flow`           | PROJECTED — Cargo Intelligence Centre flow view                         |
| `provider.<name>.projectionContractId`  | required by `EvidenceProviderV1` certification                          |
| `capability.cargo.hs-normalisation`     | INTERNAL ONLY — code mapping, no officer surface                        |
| `capability.cargo.container-checkdigit` | INTERNAL ONLY — validation utility                                      |

---

## 5. OIE Consumption Model

The OIE consumes Cargo evidence **only** via the `EvidencePackage` / UIP — never from a provider.
Six officer-facing intelligence products, each satisfying the IBE 9-step response contract with
citations to `evidence.id`:

| Product                  | Question answered                               | Derivation                                                                                                                  | Officer output                                               |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Cargo Tracking**       | Where is this consignment now?                  | container gate events + port-call evidence ordered by `observedAt`                                                          | timeline with per-hop confidence chip                        |
| **Revenue Leakage**      | Is the state under-collecting on this cargo?    | `scanForLeakage(uip.rawEvidence)` — undervaluation, HS misdeclaration, quantity variance, exemption abuse, duty non-payment | findings, ₦ exposure, evidence citations, recommended action |
| **Customs Compliance**   | Was this cleared lawfully and on time?          | declaration status vs manifest vs release timestamps                                                                        | compliance state + gap list                                  |
| **Trade Flow**           | What is moving between these ports/commodities? | aggregation over HS + port pair + period                                                                                    | flow view with coverage caveat                               |
| **Cargo Risk**           | Should this consignment be examined?            | risk signals fused with sanctions/ownership/behaviour evidence via IFE                                                      | ranked recommendation, never an auto-decision                |
| **Confidence Statement** | How much of this can we stand behind?           | OC-001 grade rollup + missing-kind list from `EvidencePackage.missing`                                                      | explicit "what we do not know" block                         |

Non-negotiable: the system recommends, the officer decides; every number wears a confidence chip;
absent evidence is stated as absent, never rendered as zero.

---

## 6. Candidate Cargo Evidence Provider Strategy (specification only — no connectors built)

All candidates must fit `EvidenceProviderV1` unchanged (`connect`, `healthCheck`, `search`,
`normalize`, `validate` + `specVersion`, `projectionContractId`). Credentials go through the
existing secret mechanism; missing credentials surface as **Waiting for Credentials**, never as a
fabricated number.

### 6.1 Named candidates — full assessment

Each block documents the nine mandated attributes. Coverage and confidence statements are
capability judgements, not measurements; the certified `healthCheck` at implementation time is what
establishes the real numbers.

#### ImportGenius

- **Supported entities:** Bill of Lading, Cargo Item, Commodity, HS Code, Shipper, Consignee, Shipping Line, Container (partial), Vessel/Voyage references.
- **Data available:** Transactional BoL records sourced from customs manifests — parties, goods description, HS, weight, container counts, ports, carrier, arrival dates.
- **Authentication model:** Commercial subscription; API key / account-scoped token.
- **Coverage:** Strongest on US import BoL and a set of Latin American and Asian customs feeds. Nigeria/West Africa coverage is thin — the exact gap that matters here.
- **Confidence ceiling:** `REPORTED`, upgraded to `CORROBORATED` where a second provider agrees. Not authoritative for Nigerian duty.
- **Licensing:** Paid, redistribution-restricted. Officer-visible excerpts must respect the licence — cite, do not republish bulk records.
- **Update frequency:** Daily to weekly by lane.
- **Integration complexity:** Low–medium (REST, paginated, stable schema).
- **Recommended priority:** **P2** — counterparty/trade-pattern corroboration, not a primary Nigerian source.

#### PIERS (S&P Global)

- **Supported entities:** Bill of Lading, Cargo Item, Commodity, HS Code, Shipper, Consignee, Shipping Line, Port, Vessel.
- **Data available:** Long-history waterborne trade transactions with normalised party names and commodity classification; the reference dataset for trade benchmarking.
- **Authentication model:** Enterprise contract; entitlement-scoped credentials, often delivered as bulk extract rather than open API.
- **Coverage:** Deep US and global lane history; excellent time depth for baselines.
- **Confidence ceiling:** `REPORTED` for individual shipments, `CORROBORATED` when matched to a manifest; `INFERRED` when used as a valuation baseline.
- **Licensing:** Expensive enterprise licence with strict redistribution terms — likely the biggest commercial blocker.
- **Update frequency:** Weekly/monthly extracts.
- **Integration complexity:** High (contracting, entitlement, bulk ingestion path).
- **Recommended priority:** **P3** — valuable for undervaluation baselines once P0 sources exist.

#### Volza

- **Supported entities:** Bill of Lading, Cargo Item, Commodity, HS Code, Shipper, Consignee, Shipping Line.
- **Data available:** Global import/export shipment records with HS-level detail, declared values in many lanes, and buyer/supplier linkage.
- **Authentication model:** Commercial subscription; API key.
- **Coverage:** Broad country list including several African markets; per-country depth varies sharply and is self-reported.
- **Confidence ceiling:** `REPORTED`. Declared values are second-hand and must never be projected as an assessment.
- **Licensing:** Paid, seat/volume limited.
- **Update frequency:** Daily to monthly by country.
- **Integration complexity:** Low–medium.
- **Recommended priority:** **P2** — first commercial trade-data candidate to trial for Nigeria lanes because of stated African coverage.

#### TradeMo

- **Supported entities:** Bill of Lading, Cargo Item, Commodity, HS Code, Shipper, Consignee.
- **Data available:** Global trade transactions and supplier/buyer intelligence with HS-level aggregation.
- **Authentication model:** Commercial subscription; API key.
- **Coverage:** Global breadth, shallower per-record fidelity; newer entrant with less independent verification.
- **Confidence ceiling:** `REPORTED`.
- **Licensing:** Paid.
- **Update frequency:** Daily to monthly.
- **Integration complexity:** Low.
- **Recommended priority:** **P3** — evaluate only as an alternative to Volza; do not run both without a measured coverage gain.

#### MarineTraffic

- **Supported entities:** Vessel, Voyage, Port Call, Port. **No cargo-level entities.**
- **Data available:** AIS positions, port calls, ETAs, vessel particulars.
- **Authentication model:** Commercial API key, credit-metered.
- **Coverage:** Global AIS, strong port-call resolution.
- **Confidence ceiling:** `OBSERVED` for AIS-derived movement.
- **Licensing:** Paid, per-call credits; caching restrictions apply.
- **Update frequency:** Near real-time.
- **Integration complexity:** Low.
- **Recommended priority:** **P1 as a CARGO _supporting_ provider only.** It supplies the Port Call spine that container gate events attach to. It must be registered under the existing vessel/movement capability, and CAPABILITY.CARGO consumes it through the UIP — CARGO must not claim it as a cargo source.

#### Datalastic

- **Supported entities:** Vessel, Voyage, Port Call, Port. **No cargo-level entities.**
- **Data available:** AIS positions, port calls, vessel database; cheaper AIS alternative.
- **Authentication model:** API key.
- **Coverage:** Global AIS with lower cost and lower guaranteed completeness than MarineTraffic.
- **Confidence ceiling:** `OBSERVED`.
- **Licensing:** Paid, comparatively permissive.
- **Update frequency:** Near real-time.
- **Integration complexity:** Low.
- **Recommended priority:** **P2 supporting** — fallback/corroboration for the Port Call spine.

#### Equasis

- **Supported entities:** Vessel, Shipping Line / ownership-management companies. **No cargo-level entities.**
- **Data available:** Vessel particulars, registered owner, ISM manager, class, PSC inspection history.
- **Authentication model:** Free account credentials (`EQUASIS_USERNAME` / `EQUASIS_PASSWORD`) — already registered in the catalog.
- **Coverage:** Global merchant fleet.
- **Confidence ceiling:** `VERIFIED` for vessel identity and management.
- **Licensing:** Free for non-commercial use; terms restrict systematic bulk harvesting.
- **Update frequency:** Periodic (days–weeks).
- **Integration complexity:** Medium (session-based access, brittle to change).
- **Recommended priority:** **P1 supporting** — resolves the carrier/vessel side of a manifest. Already an existing provider; CARGO adds no new connector for it.

#### OpenCorporates

- **Supported entities:** Shipper, Consignee, Shipping Line, agents — all `company`. **No cargo-level entities.**
- **Data available:** Company registration, jurisdiction, status, officers, filings.
- **Authentication model:** API token (`OPENCORPORATES_API_TOKEN`) — already registered in the catalog.
- **Coverage:** Very broad jurisdiction coverage; Nigerian CAC coverage is partial.
- **Confidence ceiling:** `VERIFIED` for registry facts, `REPORTED` for name-only matches.
- **Licensing:** Paid/attribution-bound API terms.
- **Update frequency:** Registry-dependent.
- **Integration complexity:** Low.
- **Recommended priority:** **P1 supporting** — turns a consignee name on a BoL into a resolvable legal entity, which is what makes revenue findings actionable.

#### IMO GISIS

- **Supported entities:** Vessel, Port, Shipping Line/company references. **No cargo-level entities.**
- **Data available:** Ship particulars, company/registered-owner records, port reception facilities, casualty and PSC modules.
- **Authentication model:** Registered account (`IMO_GISIS_API_TOKEN` in the catalog); no open public API.
- **Coverage:** Global, authoritative for identity.
- **Confidence ceiling:** `VERIFIED` for identity data.
- **Licensing:** Restricted, account-bound; not redistributable.
- **Update frequency:** Slow (weeks–months).
- **Integration complexity:** Medium–high (no clean API contract).
- **Recommended priority:** **P2 supporting** — identity backstop only.

### 6.2 Authoritative sources CAP-01 still ranks above every commercial candidate

None of the nine named candidates can produce a `VERIFIED` Nigerian duty figure. Revenue
Intelligence is only actionable from the authority of record, so these remain P0:

| Provider                                                       | Entities supported                                                | Auth model                              | Coverage                      | Confidence ceiling | Update freq. | Complexity           | Priority |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- | ----------------------------- | ------------------ | ------------ | -------------------- | -------- |
| Nigeria Customs Service (NICIS/SAD)                            | Declaration, Assessment, Manifest, Cargo Item, Commodity, HS Code | MoU + issued key / secure file exchange | Nigeria, authoritative        | `VERIFIED`         | Daily        | High (institutional) | **P0**   |
| NIMASA cargo & voyage returns                                  | Manifest, Voyage, Port Call, Vessel, Port                         | Internal integration                    | Nigeria, authoritative        | `VERIFIED`         | Daily        | Medium               | **P0**   |
| Terminal operator gate systems (APMT, Ports & Cargo, Josepdam) | Container, gate events, dwell                                     | Per-terminal API key                    | Per-terminal, deep            | `OBSERVED`         | Real-time    | Medium               | **P1**   |
| Carrier / NVOCC EDI (CUSCAR, IFTMIN, BAPLIE)                   | Manifest, BoL, Container, Cargo Item                              | SFTP/AS2 partner credentials            | Carrier-scoped, high fidelity | `CORROBORATED`     | Per-voyage   | Medium–high          | **P1**   |
| UN Comtrade                                                    | Commodity, HS Code, trade-flow baselines                          | Public / free key                       | Global, aggregate, lagging    | `REPORTED`         | Monthly      | Low                  | **P2**   |

### 6.3 Provider roadmap

| Wave                       | Providers                                                                                                                               | Capability unlocked                                                    | Exit criterion                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Wave 1 — Authority**     | NCS declarations; NIMASA manifest/voyage returns                                                                                        | Manifest Intelligence + Revenue Intelligence at `VERIFIED`             | Both certified; `kpi.manifest-intelligence` and `kpi.revenue-intelligence` leave NO_PROVIDER |
| **Wave 2 — Movement**      | Terminal gate systems; MarineTraffic (Port Call spine, supporting); Equasis + OpenCorporates (identity, supporting, already registered) | Container Intelligence; party and carrier resolution                   | `kpi.container-intelligence` reports live dwell/gate pairs                                   |
| **Wave 3 — Corroboration** | Carrier/NVOCC EDI; Volza; ImportGenius; Datalastic                                                                                      | Single-source records upgrade to `CORROBORATED`; counterparty patterns | Measurable corroboration rate on Nigerian lanes, else drop the provider                      |
| **Wave 4 — Baseline**      | UN Comtrade; PIERS; TradeMo; commodity price references; IMO GISIS                                                                      | Undervaluation baselines and identity backstop                         | Baseline-driven leakage findings carry an explicit `INFERRED` chip                           |

**Sequencing rule:** no commercial trade-data provider is contracted before Wave 1 is certified.
Buying breadth before the authority of record exists produces confident-looking numbers the state
cannot act on — the precise failure mode the Golden Rule exists to prevent.

### 6.4 Recommended implementation order

1. **NCS declarations (P0)** — unlocks Revenue Intelligence with `VERIFIED` grade; the only source that makes leakage findings actionable.
2. **NIMASA manifest/voyage returns (P0)** — unlocks Manifest Intelligence and links cargo to the existing vessel/voyage graph.
3. **Terminal gate systems (P1)** — unlocks Container Intelligence and dwell analytics.
4. **Supporting identity/movement providers (P1)** — MarineTraffic Port Calls, Equasis, OpenCorporates; all already fit existing capabilities.
5. **Carrier EDI (P1)** — corroboration layer; upgrades single-source records to `CORROBORATED`.
6. **Volza / ImportGenius (P2)** — first commercial trade-data trial, judged on measured Nigerian lane coverage.
7. **UN Comtrade, PIERS, TradeMo, price references, IMO GISIS (P2/P3)** — benchmark and backstop layer.

---

## 7. KPI Mapping

| Dashboard KPI                                          | `KPI_DECLARATIONS` key | Capability | Contract id                  | Powered by                                                 |
| ------------------------------------------------------ | ---------------------- | ---------- | ---------------------------- | ---------------------------------------------------------- |
| Manifest Intelligence — "Manifest Records Indexed"     | `manifest`             | `CARGO`    | `kpi.manifest-intelligence`  | count of distinct `cargo:manifest:*` entities in UIP       |
| Container Intelligence — "Container Movements Tracked" | `container`            | `CARGO`    | `kpi.container-intelligence` | count of gate/port-call events keyed by `container.number` |
| Revenue Intelligence — "Revenue at Risk"               | `revenue`              | `CARGO`    | `kpi.revenue-intelligence`   | Σ estimated leakage from `scanForLeakage(uip.rawEvidence)` |

Each KPI keeps `sourceOfTruth: src/lib/server/intelligence/coverage.server.ts` and the DIAG-02 smart
states. Until a P0 cargo provider is certified, all three legitimately report
**NO_PROVIDER / WAITING_FOR_CREDENTIALS** — that is the honest state, not a defect.

---

## 8. Architecture Validation Report

| Frozen component                                                                 | Change required       | Evidence                                                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence Provider Framework v1.0                                                 | **None**              | Cargo providers satisfy `EvidenceProviderV1` as-is; no addition to `FROZEN_PROVIDER_API`                                                    |
| Connector Framework                                                              | **None**              | capability advertised through existing `supports()`                                                                                         |
| Provider Resolver                                                                | **None**              | resolves by capability string; `CARGO` needs no resolver code                                                                               |
| IAL types                                                                        | **None**              | `EntityKind` already includes `cargo` and `voyage`; `kind` already includes `cargo`, `port-call`, `compliance`                              |
| Validation pipeline                                                              | **None**              | all cargo rules map onto existing `ValidationIssue` codes                                                                                   |
| IFE / Canonical UIP                                                              | **None**              | cargo records ride `rawEvidence` / `fused`; no new UIP field                                                                                |
| OKL / OIE / MIBC                                                                 | **None**              | cargo consumed as evidence; products are OIE playbooks over existing package shape                                                          |
| Projection Contract                                                              | **None at spec time** | three KPI entries already exist; provider entries are added by the provider sprint, which is the normal Symmetry rule                       |
| Authentication / roles                                                           | **None**              | no new role, no new gate                                                                                                                    |
| Backend / Cloud schema                                                           | **None**              | no table, no column, no RLS policy, no migration                                                                                            |
| Existing providers (Equasis, OpenCorporates, IMO GISIS, MarineTraffic-class AIS) | **None**              | consumed by CARGO through the UIP as supporting evidence; they keep their own capability declarations and are not re-registered under CARGO |
| Dashboard code                                                                   | **None**              | Manifest/Revenue panels already project from the UIP (Sprint MIG-01)                                                                        |

**Verdict: PASS — zero architecture changes required.** CAPABILITY.CARGO is additive and
declaration-only. The first line of implementation code belongs to a later provider sprint
(CAP-02, NCS declarations), which will register its `projectionContractId` before certification.

**Design tension recorded, not silently resolved:** cargo sub-types (Manifest, BoL, Container,
Cargo Item, Commodity, Declaration, Assessment) are all packed into `EntityKind = "cargo"` and
disambiguated by id namespace. This is what keeps the freeze intact. If graph queries later need
first-class cargo sub-kinds, that is a deliberate v1.1 `EntityKind` amendment — not something a
provider sprint may introduce.
