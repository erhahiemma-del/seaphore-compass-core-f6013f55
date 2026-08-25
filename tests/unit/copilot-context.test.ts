/**
 * Copilot context derivation.
 *
 * The failure guarded here is the Copilot claiming to know something it
 * does not. Context must describe what the officer is doing — never what
 * the assistant can answer, which depends on providers that are
 * currently unconnected.
 *
 * The second failure is coercion: `CopilotContextKind` is narrower than
 * `FocusSubjectKind`, and mapping a company onto "vessel" to fill the
 * slot would tell the Copilot something false.
 */
import { describe, expect, it } from "vitest";

import { MISSION_MODES } from "@/features/mission-control/modes";
import { deriveCopilotContext } from "@/features/mission-control/useCopilotContextBinding";

describe("copilot context describes the officer's screen", () => {
  it("reports the lens when nothing is focused", () => {
    const ctx = deriveCopilotContext(MISSION_MODES["revenue-assurance"], null);
    expect(ctx.label).toBe("Revenue Assurance");
    expect(ctx.detail).toBe(MISSION_MODES["revenue-assurance"].purpose);
  });

  it("makes a focused vessel the subject, with the lens as detail", () => {
    // The kind describes what is being examined; the lens describes how
    // it is being read, which is secondary once a subject is in hand.
    const ctx = deriveCopilotContext(MISSION_MODES["investigation"], {
      kind: "vessel",
      title: "OCEAN PEARL",
      descriptor: "IMO 9111111",
    });
    expect(ctx.kind).toBe("vessel");
    expect(ctx.label).toBe("OCEAN PEARL");
    expect(ctx.detail).toContain("IMO 9111111");
    expect(ctx.detail).toContain("Investigation");
  });

  it("keeps the same subject across different lenses", () => {
    const a = deriveCopilotContext(MISSION_MODES["investigation"], {
      kind: "port",
      title: "Apapa",
    });
    const b = deriveCopilotContext(MISSION_MODES["port-intelligence"], {
      kind: "port",
      title: "Apapa",
    });
    expect(a.kind).toBe(b.kind);
    expect(a.label).toBe(b.label);
    expect(a.detail).not.toBe(b.detail);
  });

  it("refuses to coerce a subject the vocabulary cannot express", () => {
    // Telling the Copilot a company is a vessel would be worse than
    // telling it nothing at all.
    const ctx = deriveCopilotContext(MISSION_MODES["national-picture"], {
      kind: "company",
      title: "OceanLine Shipping SA",
    });
    expect(ctx.kind).not.toBe("vessel");
    expect(ctx.kind).not.toBe("port");
    expect(ctx.label).toBe("National Picture");
  });

  it("never claims a capability or a data source", () => {
    for (const id of Object.keys(MISSION_MODES) as (keyof typeof MISSION_MODES)[]) {
      const ctx = deriveCopilotContext(MISSION_MODES[id], null);
      const text = `${ctx.label} ${ctx.detail ?? ""}`.toLowerCase();
      for (const claim of ["i can", "ask me", "analysis complete", "confidence:", "connected"]) {
        expect(text).not.toContain(claim);
      }
    }
  });

  it("always produces a usable context", () => {
    for (const id of Object.keys(MISSION_MODES) as (keyof typeof MISSION_MODES)[]) {
      const ctx = deriveCopilotContext(MISSION_MODES[id], null);
      expect(ctx.kind).toBeTruthy();
      expect(ctx.label.length).toBeGreaterThan(0);
    }
  });
});
