/**
 * The search box's rotating prompt.
 *
 * A placeholder that moves is a small feature with one large risk: an
 * animation that can touch what an officer is typing. These pin the rule
 * that makes that impossible — the cycle produces a string, never a
 * value, and it is switched off entirely the moment the box is in use.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MISSION_MODES, MISSION_MODE_ORDER } from "@/features/mission-control/modes";
import { searchPromptsFor, staticPromptFor } from "@/features/command/suggestions";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const HOOK = read("src/features/command/useTypewriterPrompt.ts");
const SURFACE = read("src/features/command/CommandSurface.tsx");

describe("the prompt covers what search accepts", () => {
  it("names every supported search dimension somewhere in the cycle", () => {
    /*
     * The box takes an IMO, an MMSI, a vessel, a company, cargo, a
     * manifest, a port, a location or an event. An officer should be
     * able to learn that from the box itself rather than from training.
     */
    const universal = searchPromptsFor(MISSION_MODES["national-picture"]).join(" ").toLowerCase();
    for (const dimension of [
      "imo",
      "mmsi",
      "vessel",
      "company",
      "cargo",
      "manifest",
      "port",
      "location",
      "event",
    ]) {
      expect(universal, `no prompt mentions ${dimension}`).toContain(dimension);
    }
  });

  it("gives every lens its own opening prompts", () => {
    // Emphasis per lens, so the box reads as part of the perspective the
    // officer chose rather than a generic field bolted above it.
    const openers = MISSION_MODE_ORDER.map((id) => searchPromptsFor(MISSION_MODES[id])[0]);
    expect(new Set(openers).size).toBe(MISSION_MODE_ORDER.length);
  });

  it("keeps the universal set behind every lens", () => {
    /*
     * Mission Mode changes emphasis, never capability. A lens that
     * dropped the universal prompts would suggest the box had stopped
     * accepting an IMO, which is not true in any lens.
     */
    for (const id of MISSION_MODE_ORDER) {
      const prompts = searchPromptsFor(MISSION_MODES[id]).join(" ");
      expect(prompts, `${id} lost the universal prompts`).toContain("IMO");
    }
  });

  it("offers a static prompt for every lens", () => {
    for (const id of MISSION_MODE_ORDER) {
      expect(staticPromptFor(MISSION_MODES[id]).length).toBeGreaterThan(0);
    }
  });

  it("suggests without asserting", () => {
    /*
     * A prompt says the box accepts a question. It must never imply an
     * answer exists — "Search active incidents…" is a search an officer
     * may run; "3 active incidents" would be a claim about the sea.
     */
    for (const id of MISSION_MODE_ORDER) {
      for (const prompt of searchPromptsFor(MISSION_MODES[id])) {
        expect(prompt, `"${prompt}" carries a figure`).not.toMatch(/\d/);
      }
    }
  });
});

describe("the officer outranks the animation", () => {
  it("stops the cycle rather than pausing it", () => {
    /*
     * The effect returns its cleanup, so focus or a keystroke tears the
     * timer down. Pausing would leave a scheduled tick able to land one
     * frame after the officer started typing.
     */
    expect(HOOK).toContain("return () => clearTimeout(timer);");
    expect(HOOK).toContain("if (!enabled || reduced.current");
  });

  it("never writes to the input", () => {
    // It produces a string the caller may use as a placeholder. There is
    // no path from this hook to the field's value.
    expect(HOOK).not.toMatch(/onInput|setInput|\.value\s*=/);
  });

  it("runs only while the box is genuinely idle", () => {
    expect(SURFACE).toContain("const idle = !inputFocused && input.length === 0;");
    expect(SURFACE).toContain("enabled: idle");
  });

  it("resumes when the field is empty again", () => {
    // `idle` is derived each render from the live input, so emptying the
    // box re-enables the cycle without any explicit restart.
    expect(SURFACE).toContain("input.length === 0");
  });

  it("keeps a stable label for assistive technology", () => {
    // A live-updating placeholder read aloud on every keystroke would be
    // unusable with a screen reader.
    expect(SURFACE).toContain("title={staticPrompt}");
  });
});

describe("reduced motion is answered, not approximated", () => {
  it("checks the preference", () => {
    expect(HOOK).toContain("prefers-reduced-motion: reduce");
  });

  it("shows a static prompt and starts no timer", () => {
    /*
     * A slower cycle is still a cycle. Officers who set this preference
     * often do so because motion makes text hard to read.
     */
    expect(HOOK).toContain("if (!enabled || reduced.current || phrases.length === 0)");
    expect(HOOK).toContain("return enabled && !reduced.current ? text : fallback;");
  });
});

describe("the surface adds no state of its own", () => {
  it("creates no store", () => {
    for (const file of [HOOK, SURFACE]) {
      expect(file).not.toMatch(/\bcreate\(/);
      expect(file).not.toContain("createContext");
    }
  });

  it("keeps DOM focus distinct from the focus subject", () => {
    // Two different ideas that share a word. The store owns the subject;
    // this owns only whether an input has the caret.
    expect(SURFACE).toContain("inputFocused");
    expect(SURFACE).not.toMatch(/const\s*\[\s*focus\w*\s*,\s*set\w*Focus/i);
  });
});

describe("interaction states are present and honest", () => {
  it("gives the three actions distinct accents", () => {
    // Three cards in a row must not read as one control repeated.
    expect(SURFACE).toContain("ACTION_ACCENT");
    const accents = /const ACTION_ACCENT[\s\S]*?\};/.exec(SURFACE)?.[0] ?? "";
    for (const id of ["upload-manifest", "create-investigation", "generate-report"]) {
      expect(accents, `${id} has no accent`).toContain(id);
    }
  });

  it("does not animate a control that cannot be used", () => {
    /*
     * An unavailable action that lifts under the cursor and then does
     * nothing is worse than one that plainly cannot be pressed.
     */
    expect(SURFACE).toContain('!ready && "cursor-not-allowed');
    const disabled = /!ready && "cursor-not-allowed[^"]*"/.exec(SURFACE)?.[0] ?? "";
    expect(disabled).not.toContain("hover:");
    expect(disabled).not.toContain("-translate-y");
  });

  it("uses the Seaphore interactive blue for focus", () => {
    expect(SURFACE).toContain("focus-visible:ring-[color:var(--color-blue)]");
  });
});
