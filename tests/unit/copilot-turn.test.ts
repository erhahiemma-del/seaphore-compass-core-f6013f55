/**
 * The conversation, one turn at a time.
 *
 * `planTurn` is pure on purpose: it decides what should happen without a
 * map, a microphone or a browser, so the rules that matter — never guess
 * a vessel, never execute a write unasked, never claim data nobody holds
 * — can be held to account here rather than only in a running app.
 */
import { describe, expect, it } from "vitest";

import { EMPTY_CONTEXT, PENDING_TTL_MS } from "@/services/copilot/copilot-conversation";
import { planTurn } from "@/services/copilot/copilot-turn";

const fleet = [
  { identity: { imo: "IMO-1", name: "Opobo Pioneer", mmsi: "111", flag: "NG" } },
  { identity: { imo: "IMO-2", name: "Ocean Star", flag: "NG" } },
  { identity: { imo: "IMO-3", name: "Ocean Star II", flag: "LR" } },
];

const turn = (transcript: string, over: Partial<Parameters<typeof planTurn>[0]> = {}) =>
  planTurn({
    transcript,
    context: EMPTY_CONTEXT,
    vessels: fleet,
    selectedImo: null,
    ...over,
  });

describe("naming a vessel", () => {
  it("selects the one that was named", () => {
    const { outcome } = turn("show me Opobo Pioneer");
    expect(outcome.kind).toBe("EXECUTE");
    if (outcome.kind !== "EXECUTE") return;
    expect(outcome.action).toEqual({ type: "SELECT_VESSEL", imo: "IMO-1" });
  });

  it("resolves an identifier the officer read aloud", () => {
    const { outcome } = turn("find IMO IMO-1");
    expect(outcome.kind === "EXECUTE" && outcome.action.type).toBe("SELECT_VESSEL");
  });

  it("says so plainly when no vessel matches", () => {
    const { outcome } = turn("show me Northern Light");
    expect(outcome.kind).toBe("REPLY");
    expect(outcome.speech).toMatch(/could not find/i);
  });
});

describe("ambiguity is asked about, never guessed", () => {
  it("prefers an exact name over a longer one that starts the same", () => {
    /*
     * "Ocean Star" names one vessel exactly, even though "Ocean Star II"
     * also begins with it. Treating that as ambiguous would ask the
     * officer a question they already answered.
     */
    const { outcome } = turn("show me Ocean Star");
    expect(outcome.kind === "EXECUTE" && outcome.action).toEqual({
      type: "SELECT_VESSEL",
      imo: "IMO-2",
    });
  });

  it("offers the candidates instead of picking one", () => {
    const plan = turn("show me Ocean");
    expect(plan.outcome.kind).toBe("CLARIFY");
    /*
     * The failure this prevents: selecting one of several vessels the
     * officer might have meant. The panel then looks authoritative about
     * the wrong hull, and nothing on screen says a choice was made.
     */
    expect(plan.context.pendingClarification?.candidates).toHaveLength(2);
    expect(plan.outcome.speech).toMatch(/which one/i);
  });

  it("resolves the follow-up by flag", () => {
    const first = turn("show me Ocean");
    const second = planTurn({
      transcript: "the Liberian one",
      context: first.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(second.outcome.kind === "EXECUTE" && second.outcome.action).toEqual({
      type: "SELECT_VESSEL",
      imo: "IMO-3",
    });
  });

  it("resolves the follow-up by ordinal", () => {
    const first = turn("show me Ocean");
    const second = planTurn({
      transcript: "the second one",
      context: first.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(second.outcome.kind === "EXECUTE" && second.outcome.action).toEqual({
      type: "SELECT_VESSEL",
      imo: "IMO-3",
    });
  });
});

describe("pronouns", () => {
  it("resolves 'it' against the vessel just discussed", () => {
    const first = turn("show me Opobo Pioneer");
    const second = planTurn({
      transcript: "where has it been",
      context: first.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(second.outcome.kind === "EXECUTE" && second.outcome.action).toEqual({
      type: "SHOW_VESSEL_TRACK",
      imo: "IMO-1",
    });
  });

  it("falls back to the map's selection when the conversation is new", () => {
    const { outcome } = turn("where has it been", { selectedImo: "IMO-2" });
    expect(outcome.kind === "EXECUTE" && outcome.action).toEqual({
      type: "SHOW_VESSEL_TRACK",
      imo: "IMO-2",
    });
  });

  it("asks rather than picking a vessel out of the air", () => {
    const { outcome } = turn("where has it been");
    expect(outcome.kind).toBe("REPLY");
    expect(outcome.speech).toMatch(/which vessel/i);
  });
});

describe("writes wait for a plain yes", () => {
  it("proposes rather than opening a case", () => {
    const first = turn("show me Opobo Pioneer");
    const plan = planTurn({
      transcript: "open an investigation on this vessel",
      context: first.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(plan.outcome.kind).toBe("CONFIRM");
    expect(plan.outcome.speech).toMatch(/should i proceed/i);
    expect(plan.context.pendingConfirmation?.action.type).toBe("OPEN_INVESTIGATION");
  });

  it("executes only after agreement", () => {
    const proposed = proposeInvestigation();
    const yes = planTurn({
      transcript: "yes",
      context: proposed.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(yes.outcome.kind === "EXECUTE" && yes.outcome.action.type).toBe("OPEN_INVESTIGATION");
    expect(yes.context.pendingConfirmation).toBeUndefined();
  });

  it("cancels on a refusal and keeps nothing pending", () => {
    const proposed = proposeInvestigation();
    const no = planTurn({
      transcript: "cancel",
      context: proposed.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(no.outcome.kind).toBe("REPLY");
    expect(no.outcome.speech).toMatch(/have not done that/i);
    expect(no.context.pendingConfirmation).toBeUndefined();
  });

  it("never reads consent out of an unrelated sentence", () => {
    /*
     * "No, show me the other one" contains "no"; "yes, but later"
     * contains "yes". Scanning for a keyword eventually hears approval
     * inside a sentence that withheld it, so only a bare answer counts.
     */
    const proposed = proposeInvestigation();
    const other = planTurn({
      transcript: "show me Opobo Pioneer",
      context: proposed.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(other.outcome.kind === "EXECUTE" && other.outcome.action.type).toBe("SELECT_VESSEL");
    expect(other.context.pendingConfirmation).toBeUndefined();
  });

  it("lets a stale proposal lapse rather than executing it later", () => {
    const proposed = proposeInvestigation();
    const late = planTurn({
      transcript: "yes",
      context: proposed.context,
      vessels: fleet,
      selectedImo: null,
      now: Date.now() + PENDING_TTL_MS + 1,
    });
    // The officer moved on; a yes now belongs to a different question.
    expect(late.outcome.kind).not.toBe("EXECUTE");
  });
});

describe("it does not invent intelligence", () => {
  it.each([
    ["who owns this vessel", /ownership intelligence is not available/i],
    ["who is the master", /crew/i],
    ["where did it depart from", /verified origin/i],
    ["what is it carrying", /cargo/i],
  ])("answers %s honestly", (asked, expected) => {
    const { outcome } = turn(asked, { selectedImo: "IMO-1" });
    expect(outcome.kind).toBe("REPLY");
    expect(outcome.speech).toMatch(expected);
  });

  it("never calls a track observed, tracked or verified", () => {
    const first = turn("show me Opobo Pioneer");
    const second = planTurn({
      transcript: "where has it been",
      context: first.context,
      vessels: fleet,
      selectedImo: null,
    });
    expect(second.outcome.speech).not.toMatch(/\b(observed|tracked|verified|live ais)\b/i);
    expect(second.outcome.speech).toMatch(/available movement history/i);
  });
});

describe("map commands still work through the same turn", () => {
  it("navigates by place", () => {
    const { outcome } = turn("take me to Apapa");
    expect(outcome.kind === "EXECUTE" && outcome.action.type).toBe("NAVIGATE_PLACE");
  });

  it("offers help rather than a shrug", () => {
    const { outcome } = turn("banana telephone");
    expect(outcome.kind).toBe("REPLY");
    expect(outcome.speech).toMatch(/you can ask me to/i);
  });
});

function proposeInvestigation() {
  const first = planTurn({
    transcript: "show me Opobo Pioneer",
    context: EMPTY_CONTEXT,
    vessels: fleet,
    selectedImo: null,
  });
  return planTurn({
    transcript: "open an investigation on this vessel",
    context: first.context,
    vessels: fleet,
    selectedImo: null,
  });
}
