/**
 * Speaking aloud, and doing what was asked.
 *
 * Seaphore has listened since voice was built and never answered aloud —
 * a repository-wide search for `speechSynthesis` returned nothing, so the
 * output half simply did not exist. And the Copilot composed prompts:
 * `CopilotCommand` carries a `promptTemplate` and a `confirmationRequired`
 * flag with nothing behind it, with no dispatcher anywhere. It could
 * describe every action in the product and perform none of them.
 *
 * These are the two halves that fix that, and the tests hold the rules
 * that keep them honest: never claim an accent the voice does not have,
 * and never report success for an action that did not happen.
 */
import { describe, expect, it } from "vitest";

import {
  VOICE_LOCALE_PREFERENCE,
  createVoiceOutput,
  describeVoice,
  selectVoice,
} from "@/services/voice/voice-output";
import {
  executeCopilotAction,
  isStateChanging,
  type CopilotAction,
} from "@/services/copilot/copilot-actions";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

const voice = (name: string, lang: string) => ({ name, lang });

describe("the voice ladder prefers Nigerian English and admits when it cannot", () => {
  it("takes en-NG when it genuinely exists", () => {
    const chosen = selectVoice([voice("Ada", "en-NG"), voice("Brian", "en-GB")]);
    expect(chosen?.lang).toBe("en-NG");
    expect(chosen?.quality).toBe("EXACT_LOCALE");
  });

  it("falls back deliberately, in a stated order", () => {
    // West African and British English before American — a judgement,
    // and one worth asserting rather than hiding in a comparator.
    expect(VOICE_LOCALE_PREFERENCE[0]).toBe("en-NG");
    expect(VOICE_LOCALE_PREFERENCE.indexOf("en-GB")).toBeLessThan(
      VOICE_LOCALE_PREFERENCE.indexOf("en-US"),
    );

    const chosen = selectVoice([voice("Zira", "en-US"), voice("Brian", "en-GB")]);
    expect(chosen?.lang).toBe("en-GB");
  });

  it("never calls a fallback Nigerian", () => {
    /*
     * The naming trap. Labelling en-GB "Nigerian" because the product
     * asked for one would be the same class of falsehood as calling
     * simulated positions observed.
     */
    const fallback = selectVoice([voice("Brian", "en-GB")])!;
    expect(fallback.quality).toBe("ENGLISH_FALLBACK");
    const sentence = describeVoice(fallback);
    expect(sentence).toContain("No Nigerian English voice is installed");
    expect(sentence).toContain("Brian");
  });

  it("says Nigerian only when the locale really is en-NG", () => {
    const genuine = selectVoice([voice("Ada", "en-NG")])!;
    expect(describeVoice(genuine)).toContain("Nigerian English voice");
  });

  it("degrades to the platform default rather than going silent", () => {
    const chosen = selectVoice([voice("Amelie", "fr-FR")])!;
    expect(chosen.quality).toBe("PLATFORM_DEFAULT");
    expect(describeVoice(chosen)).toContain("No English voice is installed");
  });

  it("says so plainly when there is no voice at all", () => {
    expect(selectVoice([])).toBeNull();
    expect(describeVoice(null)).toContain("No speech voice is available");
  });

  it("reports unavailable rather than pretending, with no synthesis engine", () => {
    const service = createVoiceOutput(undefined);
    expect(service.state()).toBe("unavailable");
    expect(service.selected()).toBeNull();
    // And speaking is a no-op rather than a crash.
    expect(() => service.speak("test")).not.toThrow();
  });
});

describe("a new answer replaces the old one", () => {
  it("cancels before speaking", () => {
    /*
     * A second response arriving while the first is speaking means the
     * officer has moved on. Finishing the stale answer first would talk
     * over their current question.
     */
    const spoken: string[] = [];
    let cancelled = 0;
    const fake = {
      getVoices: () => [voice("Brian", "en-GB")],
      speak: (u: { text: string; onstart?: () => void }) => {
        spoken.push(u.text);
        u.onstart?.();
      },
      cancel: () => {
        cancelled += 1;
      },
      pause: () => {},
      resume: () => {},
      addEventListener: () => {},
    } as unknown as SpeechSynthesis;

    // `SpeechSynthesisUtterance` is not defined outside a browser.
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      voice: unknown = null;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };

    const service = createVoiceOutput(fake);
    service.speak("first");
    service.speak("second");
    expect(spoken).toEqual(["first", "second"]);
    expect(cancelled).toBe(2);
  });

  it("ignores an empty response rather than speaking silence", () => {
    const service = createVoiceOutput(undefined);
    expect(() => service.speak("   ")).not.toThrow();
  });
});

describe("actions go through the canonical services", () => {
  it("selects a vessel through the shared selection model", () => {
    const service = new SharedGeospatialService();
    const result = executeCopilotAction(
      { type: "SELECT_VESSEL", imo: "SIM-0001" },
      { service, knownImos: ["SIM-0001"] },
    );
    expect(result.ok).toBe(true);
    expect(service.get().selection).toEqual({
      kind: "vessel",
      id: "SIM-0001",
      imo: "SIM-0001",
    });
  });

  it("moves the camera through the navigation layer", () => {
    const service = new SharedGeospatialService();
    const result = executeCopilotAction(
      { type: "NAVIGATE_PLACE", place: "rotterdam" },
      { service },
    );
    expect(result.ok).toBe(true);
    expect(service.get().center[0]).toBeCloseTo(4.4, 1);
  });

  it("adds no second camera writer", () => {
    // The worst place to acquire one would be an assistant driven by
    // text nobody reviewed.
    const source = readFileSyncSafe("src/services/copilot/copilot-actions.ts");
    for (const forbidden of ["flyTo(", "jumpTo(", "easeTo(", "setZoom(", ".setCamera("]) {
      expect(source, `dispatcher reaches for ${forbidden}`).not.toContain(forbidden);
    }
    expect(source).toContain("navigateTo");
  });
});

describe("it reports what happened, not what was attempted", () => {
  it("refuses a vessel nobody is carrying", () => {
    /*
     * Selecting an unknown IMO would leave the drawer resolving nothing
     * while the assistant announced success — the officer told a vessel
     * is open, looking at an empty panel.
     */
    const service = new SharedGeospatialService();
    const result = executeCopilotAction(
      { type: "SELECT_VESSEL", imo: "SIM-9999" },
      { service, knownImos: ["SIM-0001"] },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("No vessel with that identifier");
    expect(service.get().selection).toBeNull();
  });

  it("reports a failed navigation as a failure", () => {
    const service = new SharedGeospatialService();
    const result = executeCopilotAction(
      { type: "NAVIGATE_PLACE", place: "not-a-real-place" },
      { service },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).not.toMatch(/moved/i);
  });

  it("never throws, whatever it is handed", () => {
    // A failed action is an ordinary answer to speak, not an exception
    // for the interface to catch mid-sentence.
    const service = new SharedGeospatialService();
    for (const action of [
      { type: "NAVIGATE_COORDINATES", coordinates: [NaN, NaN] },
      { type: "CLEAR_SELECTION" },
      { type: "ZOOM", direction: "in" },
    ] as CopilotAction[]) {
      expect(() => executeCopilotAction(action, { service })).not.toThrow();
    }
  });
});

describe("state-changing actions wait for the officer", () => {
  it("classifies read and write differently", () => {
    expect(isStateChanging({ type: "NAVIGATE_PLACE", place: "nigeria" })).toBe(false);
    expect(isStateChanging({ type: "SELECT_VESSEL", imo: "SIM-0001" })).toBe(false);
    expect(isStateChanging({ type: "SET_SOURCES", sourceIds: ["simulated"] })).toBe(true);
  });

  it("refuses to execute one without confirmation", () => {
    const service = new SharedGeospatialService();
    const before = service.get().enabledSources.join(",");
    const result = executeCopilotAction(
      { type: "SET_SOURCES", sourceIds: ["simulated"] },
      { service },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("approval");
    expect(service.get().enabledSources.join(",")).toBe(before);
  });

  it("executes it once the officer approves that action", () => {
    const service = new SharedGeospatialService();
    const result = executeCopilotAction(
      { type: "SET_SOURCES", sourceIds: ["simulated"] },
      { service, confirmed: true },
    );
    expect(result.ok).toBe(true);
    expect(service.get().enabledSources).toContain("simulated");
  });
});

function readFileSyncSafe(relative: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");
}
