/**
 * What voice says when it cannot start.
 *
 * An officer reported being told "Microphone access is blocked" with the
 * microphone permission already allowed. Instrumenting the running
 * application found the classification was right *that* time — the
 * browser genuinely had refused — but found two things around it that
 * were wrong, and one latent fault that would produce exactly the
 * reported symptom.
 *
 * The latent fault: the final `else` in `start()` reported any
 * unrecognised error as a denied permission. That is the single worst
 * guess available, because a permission problem is the one diagnosis an
 * officer will act on. They check the setting, find it correct, and
 * learn the message cannot be trusted — which discredits it on the
 * occasions it is right.
 *
 * These tests hold the rule that came out of it: never name a cause the
 * code has not established.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = readFileSync(resolve(process.cwd(), "src/hooks/use-voice-dictation.ts"), "utf8");
const COMPONENT = readFileSync(
  resolve(process.cwd(), "src/features/maritime/VoiceCommand.tsx"),
  "utf8",
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const CODE = stripComments(HOOK);

describe("a cause is named only when it is known", () => {
  it("does not fall back to blaming the permission", () => {
    /*
     * The specific regression. `raise("permission-denied")` must not
     * appear as the tail of the error-classification chain.
     */
    expect(CODE).toContain('raise("unknown-error"');
    const start = CODE.slice(CODE.indexOf("const start ="));
    const elseFallback = /\}\s*else\s*\{\s*raise\("permission-denied"\)/.test(start);
    expect(elseFallback, "unknown errors are reported as a denied permission").toBe(false);
  });

  it("still classifies the errors it genuinely recognises", () => {
    // Narrowing the fallback must not cost the real diagnoses.
    for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"]) {
      expect(CODE, `${name} is no longer classified`).toContain(name);
    }
    expect(CODE).toContain('raise("no-microphone")');
    expect(CODE).toContain('raise("microphone-busy")');
  });

  it("keeps the technical name for diagnosis, not for the officer", () => {
    // The detail carries the error name; the title and hint stay plain.
    expect(CODE).toMatch(/raise\("unknown-error",[^)]*name/);
    expect(HOOK).toContain("Voice could not be started");
  });
});

describe("a refusal that can be reversed keeps the retry", () => {
  it("does not disable the control on a denied permission", () => {
    /*
     * It was `blocking: true`, which disabled the button — so an officer
     * who fixed the permission had no way to retry, because the control
     * that would have retried was dead.
     */
    const denied = CODE.slice(CODE.indexOf('"permission-denied": {'));
    const entry = denied.slice(0, denied.indexOf("},"));
    expect(entry).toContain("blocking: false");
  });

  it("reserves blocking for what cannot be changed here", () => {
    // No capture API, or an origin the browser will never release the
    // microphone to. Neither is fixable by pressing the button again.
    for (const code of ["unsupported-browser", "insecure-context"]) {
      const section = CODE.slice(CODE.indexOf(`"${code}": {`));
      expect(section.slice(0, section.indexOf("},")), code).toContain("blocking: true");
    }
  });

  it("offers the retry in the label rather than restating the failure", () => {
    // An officer reading "Failed" has been told the outcome and not the
    // way out of it.
    expect(COMPONENT).toContain('"Try again"');
  });
});

describe("nothing is claimed before an attempt is made", () => {
  it("does not raise a failure from the permissions query alone", () => {
    /*
     * The banner sat on the map permanently, about something nobody had
     * attempted. The Permissions API is not a reliable oracle here: it
     * is per-browser, disagrees across embedded windows, and can lag a
     * setting the officer has just changed. An attempt is what proves a
     * failure.
     */
    const effect = CODE.slice(CODE.indexOf("navigator.permissions"));
    const sync = effect.slice(0, effect.indexOf("return () =>"));
    expect(sync).not.toMatch(/next === "denied"[\s\S]{0,80}setIssue\(buildIssue/);
  });

  it("retires the message when the permission becomes usable", () => {
    // The clearing half must survive: a permission that starts working
    // has to retire the message that said it was not.
    const effect = CODE.slice(CODE.indexOf("navigator.permissions"));
    expect(effect).toContain('next === "granted"');
    expect(effect).toContain('current?.code === "permission-denied" ? null : current');
  });

  it("starts each attempt from a clean slate", () => {
    // Pressing again must be a fresh initialisation, not a replayed
    // failure.
    const start = CODE.slice(CODE.indexOf("const start ="));
    expect(start).toContain("clearIssue()");
    expect(start).toContain("getUserMedia");
  });
});

describe("the advice can actually be followed", () => {
  it("does not tell the officer to use an address bar", () => {
    /*
     * The old hint said to click the lock icon in the address bar.
     * Maritime Command also runs in embedded windows, which have no
     * address bar — an instruction the officer cannot carry out reads
     * as the application being broken.
     */
    // Against the code, not the file: the comment above the fix explains
    // the address bar, and asserting on the raw text matches the
    // explanation rather than the copy.
    expect(CODE).not.toContain("address bar");
  });

  it("names the browser doing the refusing, not a settings screen", () => {
    /*
     * Each browser keeps its own permission store. An officer who
     * allowed the microphone in one browser and opened Seaphore in
     * another is otherwise told the setting they just checked is wrong.
     */
    expect(HOOK).toContain("The browser Seaphore is running in");
  });

  it("always leaves a way to keep working", () => {
    // Every issue offers a route forward; none is a dead end.
    const entries = [...CODE.matchAll(/hint: `?"?([^`"]+)/g)].map((match) => match[1]!);
    expect(entries.length).toBeGreaterThan(5);
    for (const hint of entries) {
      expect(hint.trim(), `empty hint: ${hint}`).not.toBe("");
    }
  });
});
