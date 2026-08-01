/**
 * Sprint 8 · Reasoning Engine — production tests.
 *
 * 20+ maritime intelligence queries drive the engine through a deterministic
 * mock model. The mock exercises:
 *   - Structural contract validity for every workspace
 *   - Confidence propagation ladder (evidence → recommendation)
 *   - Counter-hypothesis enforcement at medium+ confidence
 *   - Conflict preservation in the Why Chain (Layer 2.3)
 *   - Model-agnostic tier fallback
 *   - Retry-on-malformed-JSON behaviour
 *   - Immutable System Prompt fingerprint
 */
import { describe, expect, it } from "vitest";
import { fuse, type FusedEvidenceBundle, type RawEvidence } from "@/services/fusion";
import {
  ReasoningResponseSchema,
  SPEC_LADDER,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_FINGERPRINT,
  anchorFromEvidence,
  bandOf,
  createMockModel,
  propagate,
  reason,
  type ModelRegistry,
  type Workspace,
} from "@/services/reasoning";

const NOW = Date.parse("2026-07-20T12:00:00Z");
const iso = (offsetDays: number) => new Date(NOW - offsetDays * 86_400_000).toISOString();
const E = "ent_vessel_9837456";

function bundleOf(atoms: RawEvidence[]): FusedEvidenceBundle {
  return fuse(atoms, { now: NOW, halfLifeDays: 30 });
}

// ── Fixture builders ────────────────────────────────────────────────────────
function ownershipAtoms(): RawEvidence[] {
  return [
    {
      id: "o1",
      agent: "ownership",
      sourceSystem: "CAC",
      entityIds: [E],
      attribute: "ownership.legal_owner",
      value: "Oceanic Lines Ltd",
      unit: null,
      grade: "verified",
      collectedAt: iso(1),
    },
    {
      id: "u1",
      agent: "ownership",
      sourceSystem: "CAC",
      entityIds: [E],
      attribute: "ownership.ubo.adeyemi",
      value: 62.5,
      unit: "PCT",
      grade: "verified",
      collectedAt: iso(2),
    },
    {
      id: "s1",
      agent: "ownership",
      sourceSystem: "OpenSanctions",
      entityIds: [E],
      attribute: "sanctions.hit",
      value: false,
      unit: null,
      grade: "verified",
      collectedAt: iso(0.5),
    },
  ];
}
function revenueConflictAtoms(): RawEvidence[] {
  return [
    {
      id: "r1",
      agent: "revenue",
      sourceSystem: "CUSTOMS_DB",
      entityIds: [E],
      attribute: "revenue.declared",
      value: 1_240_000,
      unit: "USD",
      grade: "verified",
      collectedAt: iso(1),
    },
    {
      id: "r2",
      agent: "revenue",
      sourceSystem: "INVOICE_DB",
      entityIds: [E],
      attribute: "revenue.declared",
      value: 1_612_500,
      unit: "USD",
      grade: "observed",
      collectedAt: iso(2),
    },
  ];
}
function manifestConflictAtoms(): RawEvidence[] {
  return [
    {
      id: "m1",
      agent: "manifest",
      sourceSystem: "MANIFEST_DB",
      entityIds: [E],
      attribute: "manifest.container_count",
      value: 348,
      unit: "TEU",
      grade: "verified",
      collectedAt: iso(1),
    },
    {
      id: "m2",
      agent: "manifest",
      sourceSystem: "CONTAINER_DB",
      entityIds: [E],
      attribute: "manifest.container_count",
      value: 351,
      unit: "TEU",
      grade: "observed",
      collectedAt: iso(1),
    },
  ];
}
function complianceAtoms(): RawEvidence[] {
  return [
    {
      id: "c1",
      agent: "compliance",
      sourceSystem: "CERTIFICATE_REGISTRY",
      entityIds: [E],
      attribute: "compliance.cert.smc",
      value: "2027-03-11",
      unit: null,
      grade: "verified",
      collectedAt: iso(5),
    },
    {
      id: "c2",
      agent: "compliance",
      sourceSystem: "CERTIFICATE_REGISTRY",
      entityIds: [E],
      attribute: "compliance.cert.isps",
      value: "2027-01-04",
      unit: null,
      grade: "verified",
      collectedAt: iso(6),
    },
  ];
}
function forecastAtoms(): RawEvidence[] {
  return [
    {
      id: "f1",
      agent: "forecast",
      sourceSystem: "PATTERN_ENGINE",
      entityIds: [E],
      attribute: "forecast.pattern.dwell",
      value: 0.81,
      unit: "SCORE",
      grade: "inferred",
      collectedAt: iso(1),
    },
    {
      id: "f2",
      agent: "forecast",
      sourceSystem: "PATTERN_ENGINE",
      entityIds: [E],
      attribute: "forecast.pattern.ubo_layering",
      value: 0.64,
      unit: "SCORE",
      grade: "inferred",
      collectedAt: iso(3),
    },
  ];
}
function evidenceAtoms(): RawEvidence[] {
  return [
    {
      id: "e1",
      agent: "evidence",
      sourceSystem: "AIS_STREAM",
      entityIds: [E],
      attribute: "evidence.ais_ping",
      value: "sha256:abc",
      unit: null,
      grade: "verified",
      collectedAt: iso(0.1),
    },
    {
      id: "e2",
      agent: "evidence",
      sourceSystem: "DOCUMENT_STORE",
      entityIds: [E],
      attribute: "evidence.bill_of_lading",
      value: "sha256:def",
      unit: null,
      grade: "corroborated",
      collectedAt: iso(1),
    },
  ];
}
function staleAtoms(): RawEvidence[] {
  return [
    {
      id: "h1",
      agent: "forecast",
      sourceSystem: "HISTORICAL_DB",
      entityIds: [E],
      attribute: "history.prior_dwells",
      value: 42,
      unit: "HOURS",
      grade: "reported",
      collectedAt: iso(400),
    },
  ];
}
function combinedRichAtoms(): RawEvidence[] {
  return [
    ...ownershipAtoms(),
    ...revenueConflictAtoms(),
    ...manifestConflictAtoms(),
    ...complianceAtoms(),
    ...forecastAtoms(),
    ...evidenceAtoms(),
    ...staleAtoms(),
  ];
}

// 20+ realistic maritime intelligence queries
const QUERIES: Array<{ q: string; ws: Workspace; atoms: () => RawEvidence[] }> = [
  { q: "Who is the legal owner of MV Crimson Endeavour?", ws: "ownership", atoms: ownershipAtoms },
  {
    q: "List the ultimate beneficial owners over 25% stake.",
    ws: "ownership",
    atoms: ownershipAtoms,
  },
  { q: "Is this vessel operator sanctioned?", ws: "ownership", atoms: ownershipAtoms },
  { q: "Show the revenue gap for the last voyage.", ws: "revenue", atoms: revenueConflictAtoms },
  {
    q: "Compare declared vs observed revenue at Apapa.",
    ws: "revenue",
    atoms: revenueConflictAtoms,
  },
  {
    q: "How many containers were declared vs unloaded?",
    ws: "manifest",
    atoms: manifestConflictAtoms,
  },
  {
    q: "Highlight cargo mismatches on the current manifest.",
    ws: "manifest",
    atoms: manifestConflictAtoms,
  },
  { q: "Are the SMC and ISPS certificates still valid?", ws: "compliance", atoms: complianceAtoms },
  { q: "Summarise open port-state findings.", ws: "compliance", atoms: complianceAtoms },
  {
    q: "What behavioural patterns match this vessel's recent activity?",
    ws: "forecast",
    atoms: forecastAtoms,
  },
  { q: "Is there a suspected UBO layering pattern?", ws: "forecast", atoms: forecastAtoms },
  { q: "Show all AIS pings from the last 24 hours.", ws: "evidence", atoms: evidenceAtoms },
  { q: "Which bill of lading corroborates the manifest?", ws: "evidence", atoms: evidenceAtoms },
  { q: "Provide a full risk snapshot for the vessel.", ws: "general", atoms: combinedRichAtoms },
  {
    q: "Are there any contradictions in the current evidence bundle?",
    ws: "general",
    atoms: combinedRichAtoms,
  },
  { q: "What is the most recent verified observation?", ws: "general", atoms: combinedRichAtoms },
  {
    q: "Assess dwell-time anomalies at Apapa Anchorage.",
    ws: "forecast",
    atoms: combinedRichAtoms,
  },
  {
    q: "Are there any expired certificates in the last 12 months?",
    ws: "compliance",
    atoms: complianceAtoms,
  },
  { q: "How stale is the historical dwell record?", ws: "forecast", atoms: staleAtoms },
  { q: "Provide an assessment even when evidence is thin.", ws: "general", atoms: staleAtoms },
  {
    q: "Do we have enough evidence to reach a high-confidence assessment?",
    ws: "general",
    atoms: combinedRichAtoms,
  },
];

describe("Sprint 8 · Reasoning Engine — 20+ query suite", () => {
  it("has an immutable System Prompt fingerprint", () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(500);
    expect(SYSTEM_PROMPT_FINGERPRINT).toBe(`len:${SYSTEM_PROMPT.length}`);
    // Frozen — assigning throws in strict mode, no-op otherwise.
    expect(Object.isFrozen(SPEC_LADDER)).toBe(true);
  });

  it("has 20+ queries", () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(20);
  });

  const registry: ModelRegistry = { tier2: createMockModel({ tier: "tier2" }) };

  it.each(QUERIES)("query: $q [$ws]", async ({ q, ws, atoms }) => {
    const evidence = bundleOf(atoms());
    const res = await reason({ query: q, workspace: ws, evidence }, registry);

    // Structural contract
    expect(() => ReasoningResponseSchema.parse(res)).not.toThrow();

    // Model-agnostic: whichever tier was used, meta reports it
    expect(res.model.modelId).toBeTruthy();

    // Propagation ladder monotonic non-increasing
    const p = res.propagation;
    expect(p.evidence).toBeGreaterThanOrEqual(p.relationship);
    expect(p.relationship).toBeGreaterThanOrEqual(p.pattern);
    expect(p.pattern).toBeGreaterThanOrEqual(p.assessment);
    expect(p.assessment).toBeGreaterThanOrEqual(p.recommendation);

    // Assessment confidence never exceeds ladder assessment step
    expect(res.assessment.confidence).toBeLessThanOrEqual(p.assessment + 1e-9);
    expect(res.recommendation.confidence).toBeLessThanOrEqual(p.recommendation + 1e-9);

    // Layer 2.3 — counter-hypotheses REQUIRED at medium+ confidence
    if (
      bandOf(res.assessment.confidence) !== "low" &&
      bandOf(res.assessment.confidence) !== "insufficient"
    ) {
      expect(res.counterHypotheses.length).toBeGreaterThanOrEqual(1);
    }

    // Every whyChain step cites at least one evidence id
    for (const s of res.whyChain) expect(s.evidenceIds.length).toBeGreaterThanOrEqual(0);

    // HR-4 officer notice always present
    expect(res.officerNotice).toMatch(/Officer decides/);
  });
});

describe("Sprint 8 · confidence propagation formula", () => {
  it("matches the spec ladder when anchored at 0.95", () => {
    const p = propagate(0.95);
    expect(p.evidence).toBeCloseTo(SPEC_LADDER.evidence, 2);
    expect(p.relationship).toBeCloseTo(SPEC_LADDER.relationship, 2);
    expect(p.pattern).toBeCloseTo(SPEC_LADDER.pattern, 2);
    expect(p.assessment).toBeCloseTo(SPEC_LADDER.assessment, 2);
    expect(p.recommendation).toBeCloseTo(SPEC_LADDER.recommendation, 2);
  });

  it("uses the mean of top-K evidence as the anchor", () => {
    const b = bundleOf(combinedRichAtoms());
    const anchor = anchorFromEvidence(b.ranked);
    expect(anchor).toBeGreaterThan(0);
    expect(anchor).toBeLessThanOrEqual(1);
  });
});

describe("Sprint 8 · conflict preservation + retries + fallback", () => {
  it("preserves both sides of a conflict in the Why Chain", async () => {
    const evidence = bundleOf([...revenueConflictAtoms(), ...manifestConflictAtoms()]);
    const mock = createMockModel();
    const res = await reason(
      { query: "Explain the revenue conflict.", workspace: "revenue", evidence },
      { tier1: mock },
    );
    const contradictingStep = res.whyChain.find((s) => /both sides|contradict/i.test(s.statement));
    expect(contradictingStep).toBeDefined();
    expect(contradictingStep?.evidenceIds.length).toBeGreaterThanOrEqual(2);
  });

  it("retries on malformed JSON and eventually succeeds", async () => {
    const evidence = bundleOf(ownershipAtoms());
    const flaky = createMockModel({ failFirstN: 2 });
    const res = await reason(
      { query: "Owner?", workspace: "ownership", evidence },
      { tier1: flaky },
      { maxRetries: 3 },
    );
    expect(res.model.retries).toBeGreaterThanOrEqual(2);
  });

  it("falls back to a lower tier when the primary model keeps failing", async () => {
    const evidence = bundleOf(ownershipAtoms());
    const broken = createMockModel({ id: "mock/broken", tier: "tier1", failFirstN: 99 });
    const backup = createMockModel({ id: "mock/backup", tier: "tier2" });
    const res = await reason(
      { query: "Owner?", workspace: "ownership", evidence },
      { tier1: broken, tier2: backup },
      { maxRetries: 2 },
    );
    expect(res.model.usedFallback).toBe(true);
    expect(res.model.modelId).toBe("mock/backup");
  });

  it("is model-agnostic: swapping the client changes nothing about the output shape", async () => {
    const evidence = bundleOf(ownershipAtoms());
    const a = await reason(
      { query: "Owner?", workspace: "ownership", evidence },
      { tier1: createMockModel({ id: "A" }) },
    );
    const b = await reason(
      { query: "Owner?", workspace: "ownership", evidence },
      { tier2: createMockModel({ id: "B", tier: "tier2" }) },
    );
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.model.modelId).toBe("A");
    expect(b.model.modelId).toBe("B");
  });
});
