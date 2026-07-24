/**
 * UX-001 · Conversational Intelligence Copilot — regression tests.
 *
 * Verifies two mandated behaviours:
 *   1. A bare entity mention ("Tell me about MV Ocean Pearl") returns a
 *      full Executive Operational Briefing on the first turn — never a
 *      clarification card.
 *   2. Follow-up chips render (via `humanResponse.suggestedNextQuestions`
 *      / `plan.followUps`) and the OIE resolves the same subject across
 *      subsequent turns until the officer names a new one.
 *
 * The orchestrator is mocked to a deterministic Briefing so we can
 * exercise the interpreter → resolver → planner → response-generator
 * chain without hitting any real evidence source.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Briefing, ConfidenceMatrix } from "@/services/orchestration";

const MATRIX: ConfidenceMatrix = {
  evidenceQuality: 0.7,
  coverage: 0.7,
  freshness: 0.7,
  corroboration: 0.7,
  consistency: 0.7,
  composite: 0.7,
  tier: "medium",
};

function fakeBriefing(query: string, ctxVessel?: string): Briefing {
  return {
    id: "brf-test-0001",
    officer_id: "00000000-0000-0000-0000-000000000000",
    query,
    mode: "assessment",
    classification: {
      typeBadge: "assessment",
      matrix: MATRIX,
      evidenceStrength: "moderate",
    },
    sections: [
      {
        kind: "executive",
        title: "Executive Assessment",
        payload: { text: `Assessment for ${ctxVessel ?? "subject"}.` },
      },
      {
        kind: "critical_findings",
        title: "Key Findings",
        payload: { findings: [] },
      },
      {
        kind: "evidence_sources",
        title: "Evidence Sources",
        payload: { queried: 3, responded: 3, corroborated: 2 },
      },
    ],
    intelligence_status: "complete",
    sources_queried: 3,
    sources_responded: 3,
    sources_corroborated: 2,
    confidence_matrix: MATRIX,
    latency_ms: 12,
    model_used: "test-fake",
  };
}

vi.mock("@/services/orchestration", async () => {
  const actual = await vi.importActual<typeof import("@/services/orchestration")>(
    "@/services/orchestration",
  );
  return {
    ...actual,
    orchestrate: vi.fn(async (q: { query: string; context?: { vessel?: string } }) =>
      fakeBriefing(q.query, q.context?.vessel),
    ),
  };
});

import { orchestrate } from "@/services/orchestration";
import { runOIE } from "../engine";
import type { OIEResult } from "../types";

const orchestrateMock = orchestrate as unknown as ReturnType<typeof vi.fn>;

function assertBriefing(r: OIEResult): asserts r is Extract<OIEResult, { kind: "briefing" }> {
  if (r.kind !== "briefing") {
    throw new Error(`Expected briefing turn, got clarify: ${JSON.stringify(r)}`);
  }
}

beforeEach(() => {
  orchestrateMock.mockClear();
});

describe("UX-001 · first-turn Executive Operational Briefing", () => {
  it("returns a full briefing (never a clarify card) for a bare vessel mention", async () => {
    const result = await runOIE({
      query: {
        query: "Tell me about MV Ocean Pearl",
        officer_id: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(result.kind).toBe("briefing");
    assertBriefing(result);

    // Complete Executive Operational Briefing shape.
    expect(result.briefing.classification).toBeDefined();
    expect(result.humanResponse.executiveSummary.length).toBeGreaterThan(0);
    expect(result.humanResponse.confidenceAssessment.badge).toBeDefined();
    expect(result.humanResponse.officerNotice).toBe(
      "Officer decides — Seaphore only observes and recommends.",
    );

    // Follow-up chips are populated so the UI can render them instead
    // of a workflow wizard.
    const followUps = result.plan.followUps ?? result.humanResponse.suggestedNextQuestions;
    expect(followUps.length).toBeGreaterThan(0);
  });

  it("does NOT emit a clarification for bare entity queries", async () => {
    const queries = [
      "Tell me about MV Ocean Pearl",
      'Look into "Ocean Pearl"',
      "IMO 9876543",
      "tanker Atlantic Trader",
    ];

    for (const q of queries) {
      const r = await runOIE({
        query: { query: q, officer_id: "00000000-0000-0000-0000-000000000000" },
      });
      expect(r.kind, `query: ${q}`).toBe("briefing");
    }
  });

  it("only asks to clarify when the query names no entity at all", async () => {
    const r = await runOIE({
      query: { query: "help", officer_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(r.kind).toBe("clarify");
  });
});

describe("UX-001 · sticky conversational context", () => {
  const missionWith = (turns: Array<{ role: "officer" | "copilot"; text: string }>) => ({
    conversation: turns.map((t, i) => ({ ...t, ts: 1_700_000_000 + i })),
  });

  it("carries the last-resolved vessel forward when the follow-up has no entity", async () => {
    const r = await runOIE({
      query: {
        query: "Why is the risk high?",
        officer_id: "00000000-0000-0000-0000-000000000000",
        mission: missionWith([
          { role: "officer", text: "Tell me about MV Ocean Pearl" },
          { role: "copilot", text: "Briefing: MV Ocean Pearl" },
        ]),
      },
    });

    assertBriefing(r);
    // The interpreter must have promoted the anchor into entities.
    expect(r.plan.interpreted.entities.some((e) => /Ocean Pearl/i.test(e.value))).toBe(true);
    // The orchestrator must have been invoked with the sticky subject
    // wired into its context so retrieval stays on-vessel.
    const call = orchestrateMock.mock.calls.at(-1)?.[0] as {
      context?: { vessel?: string };
      query: string;
    };
    expect(call?.context?.vessel).toMatch(/Ocean Pearl/i);
    expect(call?.query).toMatch(/Ocean Pearl/i);
  });

  it("resolves pronouns ('who owns it?') against the prior anchor", async () => {
    const r = await runOIE({
      query: {
        query: "Who owns it?",
        officer_id: "00000000-0000-0000-0000-000000000000",
        mission: missionWith([
          { role: "officer", text: "Tell me about MV Ocean Pearl" },
        ]),
      },
    });
    assertBriefing(r);
    expect(r.plan.interpreted.resolved).toMatch(/Ocean Pearl/i);
  });

  it("drops the anchor as soon as the officer names a different vessel", async () => {
    const r = await runOIE({
      query: {
        query: "Tell me about MV Atlantic Trader",
        officer_id: "00000000-0000-0000-0000-000000000000",
        mission: missionWith([
          { role: "officer", text: "Tell me about MV Ocean Pearl" },
          { role: "copilot", text: "Briefing: MV Ocean Pearl" },
        ]),
      },
    });
    assertBriefing(r);
    const values = r.plan.interpreted.entities.map((e) => e.value.toLowerCase());
    expect(values.some((v) => v.includes("atlantic trader"))).toBe(true);
    expect(values.some((v) => v.includes("ocean pearl"))).toBe(false);
    // No stale anchor persisted on the interpreted query.
    expect(r.plan.interpreted.anchor).toBeUndefined();
  });

  it("returns follow-up suggestions on the follow-up turn (not a clarify card)", async () => {
    const r = await runOIE({
      query: {
        query: "Show manifest",
        officer_id: "00000000-0000-0000-0000-000000000000",
        mission: missionWith([
          { role: "officer", text: "Tell me about MV Ocean Pearl" },
        ]),
      },
    });
    expect(r.kind).toBe("briefing");
    assertBriefing(r);
    const followUps = r.plan.followUps ?? r.humanResponse.suggestedNextQuestions;
    expect(followUps.length).toBeGreaterThan(0);
  });
});
