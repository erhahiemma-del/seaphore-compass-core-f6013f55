/**
 * Semantic state tokens.
 *
 * The risk this guards is a second palette arriving quietly. Seaphore
 * already had a considered colour system; what it lacked was a layer
 * naming those colours by *meaning*, so components referenced `--green`
 * and `--amber` directly and the significance of a colour lived at each
 * call site.
 *
 * Aliases fix that only if they stay aliases. The moment a `--state-*`
 * token carries a raw hex in `:root`, the palette has been forked and
 * the design system has two sources of truth for what "attention" looks
 * like. So the light block is asserted to contain no literal colours at
 * all.
 *
 * The dark block is the deliberate exception, and narrowly: three hues
 * genuinely fail contrast against the dark surface and are re-pointed,
 * which is a derivation rather than a fork.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Extract a `--token: value;` map from the first block matching `selector`. */
function tokensIn(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in styles.css`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const root = tokensIn(":root");
const dark = tokensIn(".dark");

const SEMANTIC = [
  "--state-verified",
  "--state-attention",
  "--state-critical",
  "--state-active",
  "--state-informational",
  "--state-investigative",
  "--state-neutral",
  "--state-unavailable",
  "--state-authority",
] as const;

describe("semantic state tokens alias the existing palette", () => {
  it("declares every operational state", () => {
    for (const token of SEMANTIC) {
      expect(root[token], `${token} missing from :root`).toBeDefined();
    }
  });

  it("never introduces a raw colour in the light block", () => {
    // A hex here means a second palette has arrived quietly.
    for (const token of SEMANTIC) {
      expect(root[token], `${token} must alias, not redefine`).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });

  it("points every alias at a token that actually exists", () => {
    for (const token of SEMANTIC) {
      const target = root[token].replace(/^var\(|\)$/g, "");
      expect(root[target], `${token} → ${target} is undefined`).toBeDefined();
    }
  });

  it("maps each state onto the colour its meaning implies", () => {
    // Pins the vocabulary itself: verified is the controlled green,
    // attention is amber, critical is red — not merely "some colour".
    expect(root["--state-verified"]).toBe("var(--green)");
    expect(root["--state-attention"]).toBe("var(--amber)");
    expect(root["--state-critical"]).toBe("var(--red)");
    expect(root["--state-active"]).toBe("var(--teal)");
    expect(root["--state-authority"]).toBe("var(--navy)");
  });

  it("keeps unavailable distinct from critical", () => {
    // "No provider connected" is not a failure, and rendering it in the
    // critical colour would train officers to ignore the critical colour.
    expect(root["--state-unavailable"]).not.toBe(root["--state-critical"]);
    expect(root["--state-neutral"]).not.toBe(root["--state-critical"]);
  });
});

describe("dark derivation lifts contrast without forking the palette", () => {
  it("re-points only the states that fail contrast on a dark surface", () => {
    const lifted = SEMANTIC.filter((t) => dark[t] !== undefined);
    expect(lifted.sort()).toEqual(
      ["--state-attention", "--state-authority", "--state-critical", "--state-verified"].sort(),
    );
  });

  it("does not make authority invisible against the dark background", () => {
    // Navy *is* the dark background; an authority colour equal to the
    // surface behind it would make primary actions disappear.
    expect(dark["--state-authority"]).toBe("var(--foreground)");
    expect(dark["--state-authority"]).not.toBe("var(--navy)");
  });

  it("leaves every other state inheriting from the light block", () => {
    for (const token of SEMANTIC) {
      if (dark[token] !== undefined) continue;
      expect(root[token]).toBeDefined();
    }
  });
});

describe("the existing palette is untouched", () => {
  it("still declares the original brand and confidence tokens", () => {
    // Regression guard: this phase adds a naming layer and must not
    // rename, remove or re-value anything components already use.
    for (const token of [
      "--navy",
      "--teal",
      "--gold",
      "--ink",
      "--slate",
      "--red",
      "--amber",
      "--green",
      "--blue",
      "--purple",
      "--conf-verified",
      "--conf-observed",
      "--conf-inferred",
      "--conf-unconfirmed",
    ]) {
      expect(root[token], `${token} was removed or renamed`).toBeDefined();
    }
  });

  it("keeps the light surfaces as the primary working environment", () => {
    expect(root["--background"]).toBe("#f7f9fb");
    expect(root["--surface"]).toBe("#ffffff");
  });
});
