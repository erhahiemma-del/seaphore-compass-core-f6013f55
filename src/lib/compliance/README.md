# SEAPHORE — Honesty & Compliance Framework

These rules override every other specification. If a spec conflicts with a
rule here, the rule wins. See `rules.ts` for the machine-readable list.

> **Evidence first. Explainable always. Officer decides.**
> If a feature cannot satisfy all three clauses, it does not ship.

## How the rules are enforced

Enforcement is architectural — modules cannot ship a screen that bypasses
these primitives. Do not render figures, signals, decisions, copilot output,
or share actions any other way.

| Rule  | Primitive / helper                                             |
|-------|----------------------------------------------------------------|
| HR-1  | `<Metric>` (`src/components/compliance/metric.tsx`)            |
| HR-2  | `assertVerifiedSource()` — VERIFIED requires a registered source in `authoritative-sources.ts` |
| HR-3  | `<SignalStatement>` + `assertObservedLanguage()`               |
| HR-4  | `<OfficerAccountabilityNotice>` — string is hard-coded         |
| HR-5  | `assertSanctionsTier()` — sanctions can never be INFERRED      |
| HR-6  | `assertNeutralVesselName()` — used by every seed helper        |
| HR-7  | `buildExportEnvelope()` — every PDF/Word/Brief/Pack renderer accepts only `ExportPackage` |
| HR-8  | `<SendShareGate>` + `requireOfficerAuthorization()`            |
| HR-9  | `writeAuditLog()` server fn + append-only `public.audit_log`   |
| HR-10 | `<AppShell>` footer — governing oath is immutable              |
| HR-11 | `<CopilotOutput>` — labels confidence, shows sources           |
| HR-12 | `<AiConfidence>` — decomposition one click away                |

## Adding a new module

1. Import primitives from `@/components/compliance` and helpers from
   `@/lib/compliance/*`.
2. Use `<Metric>` for every figure. Never render a raw number.
3. For every data-changing action, call `writeAuditLog({ action, entity,
   module, ruleRefs })` before returning success.
4. For every share/send, wrap the trigger in `<SendShareGate>`.
5. For every exportable artefact, produce `ExportPackage` via
   `buildExportEnvelope()`.
6. Never ship copy that concludes on behalf of the officer — the language
   guard will reject it.

## What "VERIFIED" means

VERIFIED is only permissible when the underlying datum came from an
authoritative source registered in `authoritative-sources.ts` (OFAC SDN,
UN SC list, EU/UK sanctions, IMO GISIS, Nigeria CAC, confirmed internal
audit). Computed, inferred, aggregated, or Copilot-produced data is never
VERIFIED.
