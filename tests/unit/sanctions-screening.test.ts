/**
 * Sanctions screening honesty tests.
 *
 * These exist to lock the three claims an officer relies on: a score is
 * not a confirmation, a provider failure is not a clear result, and only
 * a recorded human decision produces CONFIRMED_MATCH.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DISMISSAL_REASONS,
  POSSIBLE_MATCH_THRESHOLD,
  REVIEW_REQUIRED_THRESHOLD,
  SANCTIONS_MATCH_LABEL,
  SANCTIONS_STATE_CAVEAT,
  deriveMatchState,
  effectiveState,
  type SanctionsMatchDecision,
  type SanctionsScreeningRecord,
} from "@/lib/sanctions/match-state";
import { isStateChanging, executeCopilotAction } from "@/services/copilot/copilot-actions";
import { translateUnderstanding } from "@/services/copilot/understanding-to-action";
import type { QueryUnderstanding } from "@/services/orchestration";

function record(overrides: Partial<SanctionsScreeningRecord> = {}): SanctionsScreeningRecord {
  return {
    id: "s1",
    subjectName: "MV Test",
    subjectImo: "9999999",
    entityKind: "vessel",
    entityRole: "vessel",
    state: "NO_MATCH",
    failureReason: null,
    errorMessage: null,
    topScore: null,
    candidates: [],
    provider: "OpenSanctions",
    dataset: "sanctions",
    scope: "OpenSanctions · sanctions",
    screenedAt: "2026-08-29T10:00:00.000Z",
    decisions: [],
    ...overrides,
  };
}

function decision(over: Partial<SanctionsMatchDecision> = {}): SanctionsMatchDecision {
  return {
    id: "d1",
    screeningId: "s1",
    candidateId: "c1",
    candidateCaption: "Candidate",
    decision: "DISMISSED",
    reason: DISMISSAL_REASONS[0]!,
    note: null,
    evidenceRef: null,
    officerId: "officer",
    decidedAt: "2026-08-29T11:00:00.000Z",
    ...over,
  };
}

describe("sanctions screening states", () => {
  it("derives no match below the possible-match threshold", () => {
    expect(deriveMatchState(null)).toBe("NO_MATCH");
    expect(deriveMatchState(POSSIBLE_MATCH_THRESHOLD - 0.01)).toBe("NO_MATCH");
  });

  it("derives possible match and review required from score bands", () => {
    expect(deriveMatchState(POSSIBLE_MATCH_THRESHOLD)).toBe("POSSIBLE_MATCH");
    expect(deriveMatchState(REVIEW_REQUIRED_THRESHOLD)).toBe("REVIEW_REQUIRED");
    expect(deriveMatchState(1)).toBe("REVIEW_REQUIRED");
  });

  it("never derives a confirmed match from a score, however high", () => {
    for (const score of [0.9, 0.99, 1]) {
      expect(deriveMatchState(score)).not.toBe("CONFIRMED_MATCH");
    }
  });

  it("only an officer confirmation produces CONFIRMED_MATCH", () => {
    expect(effectiveState(record({ state: "REVIEW_REQUIRED" }))).toBe("REVIEW_REQUIRED");
    expect(
      effectiveState(
        record({ state: "REVIEW_REQUIRED", decisions: [decision({ decision: "CONFIRMED" })] }),
      ),
    ).toBe("CONFIRMED_MATCH");
  });

  it("a dismissal does not rewrite the screening into a no-match", () => {
    const state = effectiveState(
      record({ state: "POSSIBLE_MATCH", decisions: [decision({ decision: "DISMISSED" })] }),
    );
    expect(state).toBe("POSSIBLE_MATCH");
  });

  it("a provider failure is never presented as no match", () => {
    const failed = record({
      state: "SCREENING_UNAVAILABLE",
      failureReason: "RATE_LIMITED",
      errorMessage: "Provider responded 429.",
    });
    expect(effectiveState(failed)).toBe("SCREENING_UNAVAILABLE");
    expect(SANCTIONS_MATCH_LABEL.SCREENING_UNAVAILABLE).not.toMatch(/no match/i);
  });

  it("no match carries an explicit non-clearance caveat", () => {
    expect(SANCTIONS_STATE_CAVEAT.NO_MATCH).toMatch(/not proof of compliance/i);
    expect(SANCTIONS_STATE_CAVEAT.SCREENING_UNAVAILABLE).toMatch(/collection gap/i);
  });
});

describe("sanctions screening through the Copilot", () => {
  const understanding = (intent: string): QueryUnderstanding =>
    ({ intent, entities: [] }) as unknown as QueryUnderstanding;

  it("running a screen is state-changing and reading a result is not", () => {
    expect(isStateChanging({ type: "SCREEN_VESSEL", imo: "1" })).toBe(true);
    expect(isStateChanging({ type: "SHOW_SANCTIONS_RESULT", imo: "1" })).toBe(false);
  });

  it("refuses to screen without confirmation", () => {
    const result = executeCopilotAction(
      { type: "SCREEN_VESSEL", imo: "1" },
      { requestSanctionsScreening: () => undefined },
    );
    expect(result.ok).toBe(false);
  });

  it("reports honestly when no screening surface is connected", () => {
    const result = executeCopilotAction({ type: "SCREEN_VESSEL", imo: "1" }, { confirmed: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no screening surface/i);
  });

  it("translates a screening instruction into SCREEN_VESSEL", () => {
    const translation = translateUnderstanding({
      understanding: understanding("compliance-intelligence"),
      text: "screen this vessel",
      vessels: [],
      contextVesselImo: "9999999",
      contextVesselName: "MV Test",
    });
    expect(translation.kind).toBe("ACTION");
    if (translation.kind === "ACTION") {
      expect(translation.action.type).toBe("SCREEN_VESSEL");
      // The spoken line must not pre-empt the provider's answer.
      expect(translation.speech).not.toMatch(/\bno match\b|\bclear\b|\bsanctioned\b/i);
    }
  });

  it("translates a screening question into a read of the record", () => {
    const translation = translateUnderstanding({
      understanding: understanding("compliance-intelligence"),
      text: "what did the sanctions screen find?",
      vessels: [],
      contextVesselImo: "9999999",
    });
    expect(translation.kind).toBe("ACTION");
    if (translation.kind === "ACTION") {
      expect(translation.action.type).toBe("SHOW_SANCTIONS_RESULT");
    }
  });

  it("asks which vessel rather than guessing one", () => {
    const translation = translateUnderstanding({
      understanding: understanding("compliance-intelligence"),
      text: "screen this vessel",
      vessels: [],
      contextVesselImo: null,
    });
    expect(translation.kind).toBe("UNRESOLVED");
  });
});

describe("sanctions credential security", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/sanctions/SanctionsScreeningPanel.tsx"),
    "utf8",
  );

  it("the officer panel never calls the provider directly", () => {
    expect(panel).not.toMatch(/api\.opensanctions\.org/);
    expect(panel).not.toMatch(/OPENSANCTIONS_API_KEY/);
  });

  it("no VITE alias exists for the screening credential", () => {
    const gateway = readFileSync(join(process.cwd(), "src/lib/sanctions.functions.ts"), "utf8");
    expect(gateway).not.toMatch(/VITE_OPENSANCTIONS/);
    expect(gateway).not.toMatch(/api\.opensanctions\.org/);
  });
});
