# Evidence Provider Framework v1.0 — FROZEN

Sprint PF-01. Status: **frozen**. Spec version: **1.0**.

This document is the contract for every current and future Seaphore
Evidence Provider. The framework is frozen so that adding a provider is a
routine, certifiable act — not an architectural decision.

Nothing here changes IAL, IFE, UIP, MKG, PIE, OKL, OIE, ICE or the
Projection Contract. Providers are leaves that hang off the existing
Intelligence Acquisition Layer.

---

## 1. What an Evidence Provider is

A provider **acquires raw evidence from one external source, normalizes
it, and flags its quality**. That is all.

| A provider MUST                                    | A provider MUST NOT                             |
| -------------------------------------------------- | ----------------------------------------------- |
| Fetch from exactly one upstream source family      | Write to the database or any persistent store   |
| Normalize into `NormalizedEvidence` with provenance | Resolve identity or de-duplicate entities       |
| Classify evidence OBSERVED / DERIVED / INFERRED     | Score risk, fuse, or rank                       |
| Flag quality issues via `validateRecords`          | Create briefings or publish a UIP               |
| Use the shared `EvidenceCache` and `stableHash`    | Hold its own registry or cache implementation   |
| Declare an officer-facing Projection Contract id   | Import Supabase or any client-side store        |

Downstream ownership is unchanged: **IFE** resolves identity and fuses,
**UIP** is the single canonical package, **OKL** is memory, **OIE**
reasons, and the officer decides.

---

## 2. The frozen API

Five public methods. No more, no fewer.

```ts
connect(): Promise<void>
healthCheck(): Promise<ConnectorHealth>
search(query: EvidenceQuery): Promise<ConnectorResult>
normalize(raw: RawRecord): NormalizedEvidence | null
validate(records: NormalizedEvidence[]): ProviderValidation
```

Pre-freeze members that remain approved because the existing `Connector`
interface requires them: `constructor`, `authenticate`, `lookup`, and the
capability-scoped aliases `acquire`, `supports`, `observe`.

Any other public method fails certification. Adding one requires a
framework amendment and a spec version bump — not a provider-level
decision.

Every provider also declares:

```ts
readonly specVersion = EVIDENCE_PROVIDER_SPEC_VERSION; // "1.0"
readonly projectionContractId = "ial.<provider>";      // must exist in the registry
readonly capabilities: ConnectorCapability[];
readonly provider: ProviderMetadata;                   // type, environment, priority, enabled
```

---

## 3. Certification

`certifyProvider(provider, { source })` runs 24 checks across five groups:

1. **Identity** — unique id, complete metadata, declared spec version.
2. **Capability & resolution** — declared capability, provider type,
   environment, and Provider Resolver participation (priority + enabled).
3. **API conformance** — all five frozen methods present; no unapproved
   public surface.
4. **Platform reuse** — uses `EvidenceCache`, `normalizeRecord`,
   `validateRecords`, `stableHash`, returns `ConnectorResult`.
5. **Architectural prohibitions** — no Supabase import, no `registerUip()`,
   no persistence, no identity resolution, no duplicate registry or cache.

Source-level checks match against code with comments stripped, and only
the provider class body is scanned for the API freeze, so documentation
and internal adapters never produce false failures.

`formatCertificationReport(report)` prints a PASS/FAIL line per check for
audit purposes.

**Certification failure = registration failure.**
`registerCertifiedProvider()` throws `ProviderCertificationError` and the
provider never reaches the registry.

Runtime vs test mode: the browser bundle cannot read provider source
files, so runtime registration passes `allowSkipped: true` and certifies
the runtime-checkable subset. The regression suite certifies **with**
source, so the architectural prohibitions are enforced at test time,
where files are readable. Both must pass.

---

## 4. Adding a provider

1. Copy `src/connectors/framework/TEMPLATE_Provider.ts.txt` to
   `src/connectors/implementations/<Name>Provider.ts`.
2. Fill in metadata, capabilities, `fetchRaw`, and `normalize`.
3. Add the officer-facing projection to
   `src/lib/projection-contract/registry.ts` and reference its id.
4. Register it in `src/connectors/index.ts` through
   `registerCertifiedProvider()`.
5. Add it to the `PROVIDERS` list in
   `src/connectors/framework/__tests__/certification.test.ts`.
6. Run the suite. A red certification report is the specification telling
   you what is missing — read the failing check labels.

You do not touch IAL, IFE, UIP or OKL to add a provider. If you think you
need to, the provider is doing downstream work.

---

## 5. Reference implementation

`src/connectors/implementations/OpenSanctionsConnector.ts` is the
canonical Evidence Provider. When the spec and a provider disagree, the
spec wins; when the spec is silent, OpenSanctions is the precedent.

`EnvironmentalIntelligenceProvider.ts` is the second certified provider
and demonstrates the adapter pattern: multiple upstream environmental
sources live *inside* one provider rather than as separate registrations.

---

## 6. Files

| File                                             | Role                                   |
| ------------------------------------------------ | -------------------------------------- |
| `framework/spec.ts`                              | Frozen interface, API list, spec version |
| `framework/certification.ts`                     | Certification engine and report        |
| `framework/register.ts`                          | Registration gate                      |
| `framework/BaseEvidenceProvider.ts`              | Optional base class with platform logic |
| `framework/TEMPLATE_Provider.ts.txt`             | Copy-to-start template                 |
| `framework/__tests__/certification.test.ts`      | Regression suite                       |
| `framework/EVIDENCE_PROVIDER_FRAMEWORK.md`       | This contract                          |

---

Evidence first. Explainable always. Officer decides.

---

## Evidence Provider Catalog (Sprint EP-MASTER)

The catalog is the single source of truth for every integrated provider and is
**derived, never hand-maintained**: `src/connectors/catalog.ts` reads identity,
capabilities, spec version, provider type, environment, priority and cache TTL
off the provider instances and re-runs certification on every build. Officers
see it on **Provider Health → Evidence Provider Catalog**
(`src/routes/admin.provider-health.tsx`).

| Sprint | Provider | Capability | Auth | Cache TTL | Source |
| --- | --- | --- | --- | --- | --- |
| EP-01 | OpenSanctions *(reference)* | SANCTIONS, screening | none | 24h | OpenSanctions `/v3/search` |
| EP-02 | OpenCorporates | OWNERSHIP, COMPANY_SCREENING, IDENTITY | `OPENCORPORATES_API_TOKEN` | 12h | OpenCorporates `/v0.4/companies/search` |
| EP-03 | Equasis | IDENTITY, OWNERSHIP, VESSEL_SCREENING, COMPLIANCE | `EQUASIS_USERNAME` + `EQUASIS_PASSWORD` | 24h | Equasis restricted ship search |
| EP-04 | IMO GISIS | IDENTITY, OWNERSHIP, COMPLIANCE | `IMO_GISIS_API_TOKEN` | 7d | IMO GISIS ship module |
| EP-05 | Environmental Intelligence | ENVIRONMENTAL_INTELLIGENCE | none | 1h | Open-Meteo Marine (Source 1) |
| EP-06 | Global Fishing Watch | POSITION, PORT_CALL, IDENTITY | `GFW_API_TOKEN` | 1h | GFW API v3 |
| EP-07 | OFAC | SANCTIONS + screening | none | 24h | US Treasury SDN XML export |
| EP-08 | UN Security Council | SANCTIONS, PERSON/COMPANY screening | none | 24h | UN consolidated XML export |

**Provider Resolution is unchanged.** OpenSanctions remains the resolved
SANCTIONS provider (priority 100); OFAC (90) and UNSC (80) are primary-source
corroborators. Equasis (100) leads IDENTITY with IMO GISIS (90) as fallback.

**Honesty rule for credentialed providers.** When a credential is absent the
provider returns `ok: false` with an explicit error and zero records. It never
simulates, infers or substitutes evidence.
