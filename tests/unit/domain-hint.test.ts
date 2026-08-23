/**
 * The domain lens as a soft prior.
 *
 * The rule under test: a lens may break a tie the words did not settle,
 * and may never overrule words that did.
 */
import { describe, expect, it } from "vitest";

import { understand } from "@/services/orchestration";

const NOW = Date.parse("2026-08-23T10:00:00.000Z");
const at = { now: NOW };

/* ═══════ 1. Explicit intent always wins ═══════ */

describe("an explicit request outranks the lens", () => {
  it("does not let a vessel lens capture a port question", () => {
    // The example from the brief. Asserted as "the lens changed nothing"
    // rather than against a specific label, because which intent the
    // classifier assigns this phrasing is its business, not the lens's.
    const plain = understand("Show me ports in Ghana", at);
    const lensed = understand("Show me ports in Ghana", {
      ...at,
      domainHint: "vessel-investigation",
    });

    expect(lensed.intent).toBe(plain.intent);
    expect(lensed.intent).not.toBe("vessel-investigation");
  });

  it("keeps a vessel question a vessel question under a port lens", () => {
    const result = understand("Investigate vessel 9074729", {
      ...at,
      domainHint: "port-intelligence",
    });
    expect(result.intent).not.toBe("port-intelligence");
  });

  it("leaves a classified query's confidence untouched", () => {
    const plain = understand("Show me ports in Ghana", at);
    const lensed = understand("Show me ports in Ghana", {
      ...at,
      domainHint: "vessel-investigation",
    });
    // The lens contributed nothing, so it must not show up as certainty.
    expect(lensed.intentConfidence).toBe(plain.intentConfidence);
  });
});

/* ═══════ 2. The lens breaks genuine ties ═══════ */

describe("the lens speaks only where the words did not", () => {
  it("adopts the lens for input carrying no intent", () => {
    const bare = understand("Lagos", at);
    expect(bare.intent).toBe("unknown");

    const lensed = understand("Lagos", { ...at, domainHint: "port-intelligence" });
    expect(lensed.intent).toBe("port-intelligence");
  });

  it("marks a lens-derived reading as weaker than any real match", () => {
    const lensed = understand("Lagos", { ...at, domainHint: "port-intelligence" });
    const classified = understand("Show me ports in Ghana", at);
    // 0.3 is the floor for a rule match; a lens must sit below it so
    // downstream can tell a guess from a reading.
    expect(lensed.intentConfidence).toBeLessThan(0.3);
    expect(lensed.intentConfidence).toBeLessThan(classified.intentConfidence);
  });

  it("stays unknown when there is no lens", () => {
    expect(understand("Lagos", at).intent).toBe("unknown");
  });

  it("stays unknown when the lens is explicitly cleared", () => {
    // The "All" chip passes null, which must behave as no lens at all.
    expect(understand("Lagos", { ...at, domainHint: null }).intent).toBe("unknown");
  });
});

/* ═══════ 3. Anti-contamination is unaffected ═══════ */

describe("the lens does not weaken context isolation", () => {
  const oceanPearl = {
    kind: "vessel",
    id: "9074729",
    label: "MV Ocean Pearl",
    confidence: 1,
  } as never;

  it("keeps a fleet-wide question fleet-wide", () => {
    // The regression that matters most: a global question must not pick
    // up the open investigation, lens or no lens.
    const result = understand("Which vessels are live today?", {
      ...at,
      ambientEntity: oceanPearl,
      domainHint: "risk-assessment",
    });
    expect(result.entities).toEqual([]);
    expect(result.scope).not.toBe("entity");
  });

  it("lets a subject-less follow-up inherit once the lens supplies an intent", () => {
    // A documented consequence, not an accident. Giving an otherwise
    // unclassifiable question an intent also gives it a scope, and a
    // subject-less follow-up under an active lens is exactly the case
    // that *should* inherit the open subject.
    const plain = understand("Why did that happen?", { ...at, ambientEntity: oceanPearl });
    const lensed = understand("Why did that happen?", {
      ...at,
      ambientEntity: oceanPearl,
      domainHint: "risk-assessment",
    });

    expect(plain.contextPolicy).toBe("passive");
    expect(lensed.contextPolicy).toBe("inherit");
  });

  it("still refuses to inherit into a globally scoped question under any lens", () => {
    // The guard that must survive the above: widening inheritance for
    // vague follow-ups must not widen it for fleet-wide questions.
    for (const hint of ["risk-assessment", "vessel-investigation", "port-intelligence"] as const) {
      const result = understand("Which vessels are live today?", {
        ...at,
        ambientEntity: oceanPearl,
        domainHint: hint,
      });
      expect(result.entities).toEqual([]);
    }
  });

  it("does not let a lens invent an entity", () => {
    // A lens names a domain, never a subject.
    const result = understand("Lagos", { ...at, domainHint: "vessel-investigation" });
    expect(result.entities.every((e) => e.kind !== "vessel" || e.id !== "unknown")).toBe(true);
  });
});

/* ═══════ 4. Every lens value is a real intent ═══════ */

describe("the lens reuses the canonical vocabulary", () => {
  it.each([
    "vessel-investigation",
    "port-intelligence",
    "cargo-intelligence",
    "risk-assessment",
    "compliance-intelligence",
  ] as const)("accepts %s and returns it for bare input", (hint) => {
    // Typed as OfficerIntent rather than a parallel domain enum, so there
    // is no mapping table between them that could drift.
    expect(understand("Lagos", { ...at, domainHint: hint }).intent).toBe(hint);
  });
});
