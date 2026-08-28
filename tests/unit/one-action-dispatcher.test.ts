/**
 * One way for the Copilot to change the system.
 *
 * This existed twice. `executeIntent` carried its own navigation,
 * coordinate and zoom calls while `executeCopilotAction` carried the
 * same four capabilities, and the two drifted independently — only one
 * of them behind the confirmation gate. Two dispatchers means two sets
 * of rules about what an assistant may do, and the officer has no way to
 * know which set applied to the thing that just happened.
 *
 * The guard is deliberately structural rather than behavioural: a second
 * dispatcher does not announce itself by failing a test, it announces
 * itself by a component calling a service directly. So this reads the
 * source.
 */
import { describe, expect, it } from "vitest";

const VOICE_AND_COPILOT = [
  "src/services/copilot/copilot-turn.ts",
  "src/services/copilot/copilot-conversation.ts",
  "src/features/maritime/useVoiceCommand.ts",
  "src/features/maritime/voice-dev-harness.ts",
];

describe("the Copilot has exactly one executor", () => {
  it("keeps the camera out of the conversation layer", () => {
    /*
     * The worst place to acquire a camera writer is a layer driven by
     * transcribed speech, where the input is not reviewed by anyone
     * before it runs.
     */
    for (const file of [
      "src/services/copilot/copilot-turn.ts",
      "src/services/copilot/copilot-conversation.ts",
    ]) {
      const source = code(file);
      for (const forbidden of ["flyTo(", "jumpTo(", "easeTo(", "setCamera(", "navigateTo("]) {
        expect(source, `${file} reaches for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("routes voice through the canonical dispatcher, not its own calls", () => {
    const source = code("src/features/maritime/useVoiceCommand.ts");
    expect(source).toContain("executeCopilotAction");
    expect(source).not.toMatch(/navigateTo\(\s*\{/);
  });

  it("has no second executor left to call", () => {
    /*
     * `executeIntent` is gone, not merely delegating. While it existed
     * as an exported function it remained a second entry point a future
     * surface could reach for, and the scope clamp it owned lived at the
     * call site rather than in the dispatcher — which is precisely how
     * the duplication grew the first time.
     */
    for (const file of VOICE_AND_COPILOT) {
      expect(code(file), `${file} still defines or calls executeIntent`).not.toContain(
        "executeIntent",
      );
    }
  });

  it("selects vessels only through the shared selection model", () => {
    for (const file of VOICE_AND_COPILOT) {
      const source = code(file);
      // `service.select` belongs to the dispatcher alone.
      expect(source, `${file} selects directly`).not.toMatch(/\.select\(\{\s*kind:\s*"vessel"/);
    }
  });

  it("keeps speech synthesis behind the voice service", () => {
    /*
     * A component calling `speechSynthesis` directly is a second voice
     * that can talk over the first, and cancelling stops only whichever
     * one owns the current utterance — which is precisely what barge-in
     * must never be uncertain about.
     */
    for (const file of VOICE_AND_COPILOT) {
      expect(code(file), `${file} speaks directly`).not.toContain("speechSynthesis");
    }
  });
});

describe("the development harness is not a second pipeline", () => {
  it("enters at the transcript and executes nothing itself", () => {
    // Comments stripped: the file's own prose names the dispatcher it
    // must not call, and matching that would assert about documentation.
    const source = code("src/features/maritime/voice-dev-harness.ts");
    for (const forbidden of ["executeCopilotAction", "planTurn", "navigateTo", "select("]) {
      expect(source, `harness performs ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("cannot reach a production build", () => {
    const source = read("src/features/maritime/voice-dev-harness.ts");
    expect(source).toContain("import.meta.env.DEV");
  });

  it("is gated where it is mounted, too", () => {
    // The guard has to be at the call site as well: an exported helper
    // that returns nothing in production is still a mounted effect.
    const source = read("src/features/maritime/useVoiceCommand.ts");
    const call = source.indexOf("devTranscriptsFrom(window.location.search)");
    expect(call).toBeGreaterThan(-1);
    // The nearest preceding guard, wherever the effect's prose grows to.
    const guard = source.lastIndexOf("import.meta.env.DEV", call);
    expect(guard).toBeGreaterThan(-1);
    expect(source.slice(guard, call)).not.toContain("useEffect");
  });
});

/** Source with comments removed, for assertions about behaviour. */
function code(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function read(relative: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");
}
