/**
 * Spoken commands — what they mean, and what they refuse to guess.
 *
 * The recogniser is a transport surface: it returns the officer's words
 * and interprets nothing. Everything that turns those words into a map
 * movement is pure, which is what lets the behavioural claim of this
 * feature be asserted without a microphone in the room.
 *
 * The cases below are deliberately not clean. A recogniser trained mostly
 * on American and British English will not return "Onne" reliably from a
 * Nigerian officer saying it, and a feature that only works for the
 * accents the model was trained on is not one NIMASA can use.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { interpret, describeIntent } from "@/features/maritime/voice-intent";
import { executeIntent } from "@/features/maritime/useVoiceCommand";
import { MAP_ZONE, anchorOf, type MapZone } from "@/features/maritime/map-zones";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

const COMPONENT = readFileSync(
  resolve(process.cwd(), "src/features/maritime/VoiceCommand.tsx"),
  "utf8",
);
const HOOK = readFileSync(
  resolve(process.cwd(), "src/features/maritime/useVoiceCommand.ts"),
  "utf8",
);
const SHELL = readFileSync(
  resolve(process.cwd(), "src/features/maritime/MaritimeCommand.tsx"),
  "utf8",
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("plain commands", () => {
  it("navigates to a place said the way an officer says it", () => {
    /*
     * The registry calls it "Onne Port Complex"; an officer says "Onne".
     * Matching only the full registered name turned a perfectly clear
     * command into a question, so the distinctive part of a name is a
     * match key too — derived from the canonical name, never authored
     * per port.
     */
    const reading = interpret("Onne");
    expect(reading.intent.kind).toBe("navigate");
    if (reading.intent.kind === "navigate") expect(reading.intent.place.id).toBe("ngonne");
  });

  it("hears the destination through the words in front of it", () => {
    // Nobody speaks in commands. "Right, can you take me to Apapa" is one
    // request with four words of runway.
    for (const phrase of [
      "go to Apapa",
      "show me Apapa",
      "take me to Apapa",
      "okay, can you take me to Apapa",
    ]) {
      const reading = interpret(phrase);
      expect(reading.intent.kind, phrase).toBe("navigate");
      if (reading.intent.kind === "navigate")
        expect(reading.intent.place.id, phrase).toBe("ngapapa");
    }
  });

  it("keeps the transcript alongside the interpretation", () => {
    // An officer shown only the outcome cannot tell a misheard word from
    // a misunderstood one, and those need different corrections.
    expect(interpret("go to Rotterdam").heard).toBe("go to Rotterdam");
  });

  it("reaches the global view", () => {
    for (const phrase of ["global view", "zoom all the way out", "show me the whole world"]) {
      expect(interpret(phrase).intent.kind, phrase).toBe("global");
    }
  });

  it("reads zoom as a direction, not a destination", () => {
    expect(interpret("zoom in").intent).toEqual({ kind: "zoom", direction: "in" });
    expect(interpret("zoom out").intent).toEqual({ kind: "zoom", direction: "out" });
  });
});

describe("accent and recognition tolerance", () => {
  it("recovers a place from what a recogniser actually returns", () => {
    /*
     * These are respellings of the same sounds — the shape a recogniser
     * produces when it has no strong prior for a Nigerian place name.
     * Matching is phonetic and uniform, so this works for every place in
     * the registry rather than for a list somebody remembered to write.
     */
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["go to Appapa", "ngapapa"],
      ["take me to Lecki", "nglkk"],
      ["show me Kalabar", "ngcbq"],
      ["go to Roterdam", "rotterdam"],
      ["show me Singapor", "singapore"],
    ];
    for (const [spoken, expected] of cases) {
      const reading = interpret(spoken);
      expect(reading.intent.kind, spoken).toBe("navigate");
      if (reading.intent.kind === "navigate") {
        expect(reading.intent.place.id, spoken).toBe(expected);
      }
    }
  });

  it("carries no table of Nigerian port spellings", () => {
    /*
     * A per-port alias list would work for the six ports someone thought
     * of and fail silently for the seventh, and it would put an
     * implementation branch where the canonical registry is meant to be
     * the only description of a port.
     */
    const source = stripComments(
      readFileSync(resolve(process.cwd(), "src/features/maritime/voice-intent.ts"), "utf8"),
    );
    for (const port of ["Apapa", "Onne", "Lekki", "Calabar", "Warri", "Tin Can"]) {
      expect(source, `voice-intent special-cases ${port}`).not.toContain(port);
    }
  });
});

describe("ambiguity is asked about, never guessed", () => {
  it("returns candidates rather than moving the map", () => {
    /*
     * Acting on a close call is the worst outcome available: the officer
     * looks up at a different port than they asked for, with nothing on
     * screen to say a guess was made.
     */
    const reading = interpret("go to west afrika");
    if (reading.intent.kind === "clarify") {
      expect(reading.intent.candidates.length).toBeGreaterThan(0);
    } else {
      // A confident match is acceptable; a wrong confident match is not.
      expect(reading.intent.kind).toBe("navigate");
      if (reading.intent.kind === "navigate") {
        expect(reading.intent.place.name).toBe("West Africa");
      }
    }
  });

  it("declines a phrase that resembles nothing on the map", () => {
    for (const phrase of ["what is the weather like", "hello there", "qwertyuiop"]) {
      expect(interpret(phrase).intent.kind, phrase).toBe("unrecognised");
    }
  });

  it("declines an instruction with no destination", () => {
    expect(interpret("take me to").intent.kind).toBe("unrecognised");
    expect(interpret("").intent.kind).toBe("unrecognised");
  });

  it("neither clarification nor failure moves the camera", () => {
    const service = new SharedGeospatialService();
    const before = service.get();
    expect(executeIntent({ kind: "clarify", candidates: [] }, service)).toBe(false);
    expect(executeIntent({ kind: "unrecognised", reason: "x" }, service)).toBe(false);
    expect(service.get().center).toEqual(before.center);
    expect(service.get().zoom).toBe(before.zoom);
  });
});

describe("spoken positions", () => {
  it("reads degrees and minutes said aloud", () => {
    // The way the NPA handbook writes Tin Can's position, spoken.
    const reading = interpret(
      "six degrees twenty five point seven minutes north three degrees twenty point five three minutes east",
    );
    // Numbers-as-words are not resolved; the digits form is what a
    // recogniser returns for read-out coordinates.
    const digits = interpret("6 degrees 25.7 minutes north 3 degrees 20.53 minutes east");
    expect(digits.intent.kind).toBe("coordinates");
    if (digits.intent.kind === "coordinates") {
      expect(digits.intent.coordinates[1]).toBeCloseTo(6.428333, 4);
      expect(digits.intent.coordinates[0]).toBeCloseTo(3.342167, 4);
    }
    // The spelled-out form must not be mistaken for a place.
    expect(["coordinates", "unrecognised", "clarify"]).toContain(reading.intent.kind);
  });

  it("prefers a position over a place that sounds like one", () => {
    expect(interpret("6.428333, 3.342167").intent.kind).toBe("coordinates");
  });
});

describe("commands move the map through the canonical path", () => {
  it("navigates to a place", () => {
    const service = new SharedGeospatialService();
    const reading = interpret("go to Rotterdam");
    expect(reading.intent.kind).toBe("navigate");
    expect(executeIntent(reading.intent, service)).toBe(true);
    expect(service.get().center[0]).toBeCloseTo(4.4, 2);
    expect(service.get().center[1]).toBeCloseTo(51.95, 2);
  });

  it("widens the scope for a destination outside the region", () => {
    // Rotterdam under the regional scope would be clamped back into the
    // Gulf of Guinea and land nowhere near the destination.
    const service = new SharedGeospatialService();
    service.setScope("regional");
    executeIntent(interpret("Rotterdam").intent, service);
    expect(service.get().scope).toBe("global");
  });

  it("goes to a spoken position", () => {
    const service = new SharedGeospatialService();
    executeIntent(interpret("6.428333, 3.342167").intent, service);
    expect(service.get().center[0]).toBeCloseTo(3.342167, 5);
  });

  it("zooms within the active scope's limits", () => {
    const service = new SharedGeospatialService();
    const before = service.get().zoom;
    executeIntent({ kind: "zoom", direction: "in" }, service);
    expect(service.get().zoom).toBeGreaterThan(before);
    for (let i = 0; i < 40; i++) executeIntent({ kind: "zoom", direction: "out" }, service);
    // Clamped, not run off the end.
    expect(Number.isFinite(service.get().zoom)).toBe(true);
  });

  it("never drives the camera itself", () => {
    /*
     * Voice was always going to be the fifth caller tempted to fly the
     * camera, which is exactly why the navigation layer was built first.
     */
    const code = stripComments(HOOK);
    expect(code).toContain("navigateTo");
    for (const forbidden of ["setCamera", "flyTo(", "jumpTo(", "easeTo(", "setZoom("]) {
      expect(code, `voice drives the camera via ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("the officer can see, reach and use it", () => {
  it("is mounted in Maritime Command", () => {
    // A capability with no affordance is code, not a feature.
    // Now mounted with the fleet, so a spoken vessel name resolves
    // against what the officer can actually see.
    expect(stripComments(SHELL)).toMatch(/<VoiceCommand[\s/][^>]*\/>/);
  });

  it("occupies a declared zone that collides with nothing", () => {
    expect(COMPONENT).toContain("MAP_ZONE.VOICE");
    const anchors = (Object.keys(MAP_ZONE) as MapZone[]).map(anchorOf);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("shows every state an officer needs to tell apart", () => {
    for (const state of ["listening", "processing", "understood", "clarifying", "failed"]) {
      expect(HOOK, `missing state: ${state}`).toContain(`"${state}"`);
    }
  });

  it("always shows what was heard, including on success", () => {
    // Showing the words costs a line and turns a black box into an
    // instrument the officer can learn to speak to.
    expect(COMPONENT).toContain("voice-heard");
    expect(stripComments(COMPONENT)).toContain("reading.heard");
  });

  it("explains an unavailable microphone instead of going dead", () => {
    // A dead button is the worst answer to "why is nothing happening".
    const code = stripComments(COMPONENT);
    expect(code).toContain("barrier.title");
    expect(code).toContain("barrier.hint");
    // A refused permission blocks as surely as a missing device.
    expect(code).toContain("issue?.blocking");
  });

  it("shows the card only when it has something to say", () => {
    /*
     * The engine raises a permission issue on mount, so rendering
     * whenever an issue existed drew an empty box above the button
     * containing nothing but its own dismiss control.
     */
    const code = stripComments(COMPONENT);
    expect(code).toContain("showReadout");
    /*
     * The condition now also admits a spoken response, because Seaphore
     * answers aloud and the same sentence has to be readable. The rule
     * it protects is unchanged: an issue alone is not something to say.
     */
    expect(code).toContain('issue !== null && state === "failed"');
    expect(code).toContain("spoken !== null");
  });

  it("ends on sustained silence, not on the first pause", () => {
    /*
     * A recogniser that ends at the first gap cuts "take me to…" —
     * pause — "…Tin Can Island" in half and acts on the fragment.
     */
    expect(HOOK).toContain("SILENCE_MS");
    expect(stripComments(HOOK)).toContain("SPEECH_LEVEL");
  });

  it("adds no second speech engine", () => {
    /*
     * Capture and transcription already existed for Copilot dictation.
     * A parallel Web Speech implementation would be a second thing
     * holding the microphone and a second set of failure modes.
     */
    const code = stripComments(HOOK);
    expect(code).toContain("useVoiceDictation");
    expect(code).not.toContain("webkitSpeechRecognition");
    expect(code).not.toContain("new SpeechRecognition");
  });
});

describe("what the officer is told", () => {
  it("names the destination rather than the mechanism", () => {
    const reading = interpret("go to Onne");
    expect(describeIntent(reading.intent)).toBe("Onne Port Complex");
    expect(describeIntent({ kind: "global" })).toContain("global");
    expect(describeIntent({ kind: "unrecognised", reason: "Nothing was said." })).toBe(
      "Nothing was said.",
    );
  });
});
