/**
 * Sprint 7 · Evidence Fusion Engine — unit tests.
 * Covers: normalisation, dedup, conflict detection (both sides preserved),
 * confidence formula, ranking, pipeline output shape, agent-framework adapter.
 */
import { describe, expect, it } from "vitest";
import {
  FusedEvidenceBundleSchema,
  agentResultsToRawEvidence,
  authorityScore,
  dedupe,
  detectConflicts,
  fuse,
  fuseAgentResults,
  normalizeMany,
  normalizeOne,
  rank,
  recencyScore,
  scoreAll,
  type RawEvidence,
} from "@/services/fusion";
import type { AgentResult } from "@/services/agents/types";

const NOW = Date.parse("2026-07-20T12:00:00Z");
const iso = (offsetDays: number) => new Date(NOW - offsetDays * 86_400_000).toISOString();

const ENTITY = "ent_vessel_9837456";

const RAW: RawEvidence[] = [
  // Revenue — conflict pair (declared vs observed from independent sources)
  {
    id: "r1",
    agent: "revenue",
    sourceSystem: "CUSTOMS_DB",
    entityIds: [ENTITY],
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
    entityIds: [ENTITY],
    attribute: "revenue.declared",
    value: 1_612_500,
    unit: "USD",
    grade: "observed",
    collectedAt: iso(2),
  },
  // Manifest — conflict pair on container count
  {
    id: "m1",
    agent: "manifest",
    sourceSystem: "MANIFEST_DB",
    entityIds: [ENTITY],
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
    entityIds: [ENTITY],
    attribute: "manifest.container_count",
    value: 351,
    unit: "TEU",
    grade: "observed",
    collectedAt: iso(1),
  },
  // Ownership — legal owner (single source, no conflict)
  {
    id: "o1",
    agent: "ownership",
    sourceSystem: "CAC",
    entityIds: [ENTITY],
    attribute: "ownership.legal_owner",
    value: "Oceanic Lines Ltd",
    unit: null,
    grade: "verified",
    collectedAt: iso(3),
  },
  // Ownership — duplicate of o1 with weaker grade (should be deduped)
  {
    id: "o1_dup",
    agent: "ownership",
    sourceSystem: "CAC",
    entityIds: [ENTITY],
    attribute: "ownership.legal_owner",
    value: "Oceanic Lines Ltd",
    unit: null,
    grade: "reported",
    collectedAt: iso(10),
  },
  // Compliance — SMC certificate
  {
    id: "c1",
    agent: "compliance",
    sourceSystem: "CERTIFICATE_REGISTRY",
    entityIds: [ENTITY],
    attribute: "compliance.cert.smc",
    value: "2027-03-11",
    unit: null,
    grade: "verified",
    collectedAt: iso(5),
  },
  // Forecast pattern
  {
    id: "f1",
    agent: "forecast",
    sourceSystem: "PATTERN_ENGINE",
    entityIds: [ENTITY],
    attribute: "forecast.pattern.dwell",
    value: 0.81,
    unit: "SCORE",
    grade: "inferred",
    collectedAt: iso(1),
  },
  // Evidence library artefact
  {
    id: "e1",
    agent: "evidence",
    sourceSystem: "AIS_STREAM",
    entityIds: [ENTITY],
    attribute: "evidence.ais_ping",
    value: "sha256:abc",
    unit: null,
    grade: "verified",
    collectedAt: iso(0.1),
  },
  // Sanctions — different attribute, independent source
  {
    id: "s1",
    agent: "ownership",
    sourceSystem: "OpenSanctions",
    entityIds: [ENTITY],
    attribute: "sanctions.hit",
    value: false,
    unit: null,
    grade: "verified",
    collectedAt: iso(0.5),
  },
  // Stale reported item — recency should pull it down
  {
    id: "h1",
    agent: "forecast",
    sourceSystem: "HISTORICAL_DB",
    entityIds: [ENTITY],
    attribute: "history.prior_dwells",
    value: 42,
    unit: "HOURS",
    grade: "reported",
    collectedAt: iso(400),
  },
];

describe("Sprint 7 · normalise", () => {
  it("canonicalises value/unit/timestamp and preserves raw", () => {
    const n = normalizeOne({
      ...RAW[0],
      value: "  Oceanic  Lines   Ltd " as unknown as number,
      unit: "usd",
    });
    expect(n.unit).toBe("USD");
    expect(n.value).toBe("Oceanic Lines Ltd");
    expect(n.attribute).toBe("revenue.declared");
    expect(n.contentHash).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(n.raw).toBeTruthy();
  });

  it("rejects malformed input with Zod", () => {
    expect(() => normalizeOne({ id: 1, agent: "x" })).toThrow();
  });
});

describe("Sprint 7 · confidence formula (Layer 2.11)", () => {
  it("recency decays with configurable half-life", () => {
    const fresh = recencyScore(iso(0), { now: NOW, halfLifeDays: 30 });
    const halfLife = recencyScore(iso(30), { now: NOW, halfLifeDays: 30 });
    const oneYear = recencyScore(iso(365), { now: NOW, halfLifeDays: 30 });
    expect(fresh).toBeCloseTo(1, 3);
    expect(halfLife).toBeCloseTo(0.5, 3);
    expect(oneYear).toBeLessThan(halfLife);
  });

  it("authority defaults to 0.7 for unknown sources", () => {
    expect(authorityScore("CAC")).toBe(1.0);
    expect(authorityScore("MYSTERY_FEED")).toBe(0.7);
  });

  it("confidence = gradeWeight × authority × recency", () => {
    const [s] = scoreAll(normalizeMany([RAW[0]]), { now: NOW, halfLifeDays: 30 });
    const expected = 1.0 * 0.95 * Math.pow(0.5, 1 / 30);
    expect(s.confidence).toBeCloseTo(Math.round(expected * 1000) / 1000, 3);
  });
});

describe("Sprint 7 · dedupe (same source + same claim hash)", () => {
  it("keeps the highest-confidence duplicate and records mergedFrom", () => {
    const scored = scoreAll(normalizeMany(RAW), { now: NOW });
    const { kept, duplicateCount } = dedupe(scored);
    expect(duplicateCount).toBe(1);
    const legal = kept.find((k) => k.attribute === "ownership.legal_owner");
    expect(legal?.mergedFrom).toContain("o1");
    expect(legal?.mergedFrom).toContain("o1_dup");
    // Winner should be the verified one (higher grade × better recency).
    expect(legal?.id).toBe("o1");
  });
});

describe("Sprint 7 · conflict detection (both sides preserved)", () => {
  it("flags contradictory values on the same (entity, attribute) across sources", () => {
    const scored = scoreAll(normalizeMany(RAW), { now: NOW });
    const { kept } = dedupe(scored);
    const { items, conflicts } = detectConflicts(kept);
    expect(conflicts.length).toBe(2);

    const attrs = conflicts.map((c) => c.attribute).sort();
    expect(attrs).toEqual(["manifest.container_count", "revenue.declared"]);

    // Both sides preserved as separate items.
    const involved = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
    for (const id of ["r1", "r2", "m1", "m2"]) expect(involved.has(id)).toBe(true);

    // conflictsWith cross-links present on the surviving items.
    const r1 = items.find((i) => i.id === "r1");
    expect(r1?.conflictsWith).toContain("r2");
  });
});

describe("Sprint 7 · ranking", () => {
  it("orders by confidence DESC with stable tiebreak", () => {
    const scored = scoreAll(normalizeMany(RAW), { now: NOW });
    const ranked = rank(scored);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].confidence).toBeGreaterThanOrEqual(ranked[i].confidence);
    }
    // Stalest reported item must be last.
    expect(ranked[ranked.length - 1].id).toBe("h1");
  });
});

describe("Sprint 7 · pipeline", () => {
  it("produces a schema-valid bundle for 10+ items with conflicts", () => {
    expect(RAW.length).toBeGreaterThanOrEqual(10);
    const bundle = fuse(RAW, { now: NOW, halfLifeDays: 30 });
    expect(() => FusedEvidenceBundleSchema.parse(bundle)).not.toThrow();
    expect(bundle.metrics.inputCount).toBe(RAW.length);
    expect(bundle.metrics.duplicateCount).toBe(1);
    expect(bundle.metrics.conflictCount).toBe(2);
    expect(bundle.metrics.dedupedCount).toBe(RAW.length - 1);
    expect(bundle.metrics.agentsReporting).toBeGreaterThanOrEqual(4);
    expect(bundle.metrics.sourcesQueried).toBeGreaterThanOrEqual(6);
  });

  it("output is JSON-serialisable end-to-end", () => {
    const bundle = fuse(RAW, { now: NOW });
    const json = JSON.stringify(bundle);
    const round = JSON.parse(json);
    expect(round.ranked.length).toBe(bundle.ranked.length);
    expect(round.conflicts.length).toBe(bundle.conflicts.length);
  });
});

describe("Sprint 7 · agent-framework adapter", () => {
  it("converts AgentResults into RawEvidence and fuses them", () => {
    const agentResults: AgentResult<unknown>[] = [
      {
        agent: "revenue",
        status: "ok",
        partial: false,
        latencyMs: 30,
        sourcesQueried: ["customs_db", "invoice_db"],
        data: {
          subjectEntityId: ENTITY,
          currency: "USD",
          declaredRevenue: 1_240_000,
          observedRevenue: 1_612_500,
          gap: 372_500,
          anomalies: [],
          citations: [{ source: "CUSTOMS_DB", ref: "cust_2026_07", observedAt: iso(1) }],
        },
      },
      {
        agent: "manifest",
        status: "ok",
        partial: false,
        latencyMs: 25,
        sourcesQueried: ["manifest_db", "container_db"],
        data: {
          subjectEntityId: ENTITY,
          manifestId: "MAN-2026-0714-APP",
          declaredContainers: 348,
          observedContainers: 351,
          mismatches: [],
          citations: [{ source: "MANIFEST_DB", ref: "man_0714", observedAt: iso(1) }],
        },
      },
      {
        agent: "compliance",
        status: "error",
        partial: false,
        latencyMs: 5,
        sourcesQueried: [],
        data: null,
        error: { code: "TIMEOUT", message: "n/a" },
      },
    ];

    const raw = agentResultsToRawEvidence(agentResults);
    expect(raw.length).toBeGreaterThan(0);
    // Errored agents contribute zero atoms.
    expect(raw.every((r) => r.agent !== "compliance")).toBe(true);

    const bundle = fuseAgentResults(agentResults, { now: NOW });
    expect(bundle.metrics.conflictCount).toBeGreaterThanOrEqual(1);
    expect(bundle.ranked[0].confidence).toBeGreaterThan(0);
  });
});
