/**
 * One brain.
 *
 * Seaphore grew four ways to read an instruction: the orchestration
 * engine behind typed search, the voice intent parser, the Copilot's
 * turn planner, and the map search box. The same sentence could mean one
 * thing typed and another spoken, and nothing in the codebase said which
 * reading a given surface had used.
 *
 * These hold the convergence. They are structural because a second
 * engine does not announce itself by failing a behavioural test — it
 * announces itself by a surface classifying text for itself.
 */
import { describe, expect, it } from "vitest";

import {
  commandInput,
  normalisedText,
  normaliseSpokenText,
} from "@/services/orchestration/command-input";
import { understand } from "@/services/orchestration";
import { translateUnderstanding } from "@/services/copilot/understanding-to-action";

const fleet = [
  { identity: { imo: "IMO-1", name: "Opobo Pioneer", flag: "NG" } },
  { identity: { imo: "IMO-2", name: "Ocean Star", flag: "NG" } },
  { identity: { imo: "IMO-3", name: "Ocean Star II", flag: "LR" } },
];

const translate = (text: string, contextVesselImo: string | null = null) =>
  translateUnderstanding({
    understanding: understand(text),
    text,
    vessels: fleet,
    contextVesselImo,
  });

describe("typed and spoken reach the same reading", () => {
  it.each([
    [
      "show me vessels approaching Nigeria",
      "Seaphore, please can you show me vessels approaching Nigeria?",
    ],
    ["take me to Apapa", "ok so can you take me to Apapa"],
    ["zoom in", "um, zoom in"],
  ])("%s", (typed, spoken) => {
    /*
     * The claim of a single engine, stated as a test: strip the way a
     * person talks and the two sentences must classify identically.
     */
    const typedReading = understand(normalisedText(commandInput(typed, "SEARCH")));
    const spokenReading = understand(normalisedText(commandInput(spoken, "VOICE")));
    expect(spokenReading.intent).toBe(typedReading.intent);
  });

  it("strips the runway people put in front of a request", () => {
    expect(normaliseSpokenText("ok so please can you take me to Onne")).toBe("take me to Onne");
    expect(normaliseSpokenText("hey Seaphore, zoom in")).toBe("zoom in");
  });

  it("turns spoken coordinates into coordinates", () => {
    expect(normaliseSpokenText("go to six point four north, three point three east")).toBe(
      "go to 6.4, 3.3",
    );
  });

  it("keeps twenty four from becoming twenty", () => {
    // Longest-first replacement. Otherwise a 24-hour window silently
    // becomes a 20-hour one with a stray "4" beside it.
    expect(normaliseSpokenText("vessels arriving within twenty four hours")).toContain("24 hours");
  });
});

describe("the classifier reads commands as well as questions", () => {
  it.each([
    ["take me to Apapa", "map-navigation"],
    ["zoom out", "map-zoom"],
    ["show me Opobo Pioneer", "vessel-selection"],
    ["where has it been", "vessel-track"],
    ["open an investigation", "vessel-investigation"],
    ["who owns this vessel", "ownership-intelligence"],
    ["show me the manifest", "manifest-intelligence"],
  ])("%s → %s", (text, intent) => {
    expect(understand(text).intent).toBe(intent);
  });

  it("does not let a verb steal a domain question", () => {
    /*
     * "Show me the manifest" is a manifest question that happens to use
     * the selection verb. The negative lookahead on the selection rule is
     * what keeps the verb from claiming it.
     */
    expect(understand("show me the manifest for MSCU1234567").intent).not.toBe("vessel-selection");
  });
});

describe("translation decides what is actionable, and never acts", () => {
  it("turns an instruction into an action", () => {
    const result = translate("take me to Apapa");
    expect(result.kind).toBe("ACTION");
    expect(result.kind === "ACTION" && result.action.type).toBe("NAVIGATE_PLACE");
  });

  it("keeps the fuzzy place matching officers rely on", () => {
    // "Apapa" is not the name of the place; it is what people call it.
    const result = translate("take me to Tin Can");
    expect(result.kind).toBe("ACTION");
  });

  it("leaves a question alone", () => {
    /*
     * A question must never become a camera movement because it happened
     * to contain a place name.
     */
    expect(translate("what is the risk picture for Apapa").kind).toBe("NOT_ACTIONABLE");
    expect(translate("who owns this vessel").kind).toBe("NOT_ACTIONABLE");
  });

  it("asks rather than choosing between vessels", () => {
    const result = translate("show me Ocean");
    expect(result.kind).toBe("AMBIGUOUS");
    expect(result.kind === "AMBIGUOUS" && result.candidates).toHaveLength(2);
  });

  it("refuses to guess the hull for a case record", () => {
    /*
     * The one action that writes something an officer cannot undo by
     * looking elsewhere. With no vessel established it asks.
     */
    const result = translate("open an investigation");
    expect(result.kind).toBe("UNRESOLVED");
    expect(result.kind === "UNRESOLVED" && result.speech).toMatch(/which vessel/i);
  });

  it("reads a source switch with the provider named in the middle", () => {
    /*
     * "Switch to the simulated source" puts the provider between the
     * verb and the noun. An earlier pattern required "source" straight
     * after "to" and matched nothing an officer would say — caught in
     * the browser, not here, which is why it is now here.
     */
    expect(understand("switch to the simulated source").intent).toBe("source-switch");
    expect(understand("use the global fishing watch source").intent).toBe("source-switch");
  });

  it("performs nothing itself", () => {
    const source = code("src/services/copilot/understanding-to-action.ts");
    for (const forbidden of [
      "executeCopilotAction",
      "navigateTo(",
      "flyTo(",
      "easeTo(",
      "jumpTo(",
      ".select(",
      "setEnabledSources",
    ]) {
      expect(source, `translator performs ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("no surface classifies for itself", () => {
  it("keeps the turn planner on the canonical engine", () => {
    const source = code("src/services/copilot/copilot-turn.ts");
    expect(source).toContain("understand(");
    // The voice parser's own classifier must not be reachable from here.
    expect(source).not.toContain("interpret(");
  });

  it("gives voice no second classifier path", () => {
    const source = code("src/features/maritime/useVoiceCommand.ts");
    expect(source).toContain("planTurn");
    // Voice contributes normalisation, not classification.
    expect(source).not.toMatch(/\binterpret\(/);
  });
});

function code(relative: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return fs
    .readFileSync(path.resolve(process.cwd(), relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
