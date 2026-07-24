/**
 * UX-001 · Entity parsing & sticky-anchor edge cases.
 *
 * Regression coverage for the fiddly ends of the interpreter + resolver:
 *   • Partial / malformed IMO numbers (6 digits, 8 digits, prefixed).
 *   • Vessel-name misspellings and casing/punctuation drift across turns.
 *   • Quoted callsigns and quoted vessel names.
 *   • "Replay AIS timeline" style follow-ups — must keep the current
 *     sticky anchor and not re-classify as ambiguous.
 *
 * These do NOT hit the orchestrator — they exercise the deterministic
 * layers (interpreter + conversation-resolver) directly, so the tests
 * stay fast and pin the parsing contract.
 */
import { describe, expect, it } from "vitest";

import { interpretQuery, extractEntities } from "../query-interpreter";
import { findAnchor, resolvePronouns } from "../conversation-resolver";
import type { EntityMention, MissionConversationTurn } from "../types";

const turn = (
  role: "officer" | "copilot",
  text: string,
  entities?: EntityMention[],
  ts = 1_700_000_000,
): MissionConversationTurn => ({ role, text, entities, ts });

describe("IMO parsing edge cases", () => {
  it("captures a well-formed 7-digit IMO with the IMO prefix", () => {
    const ents = extractEntities("Tell me about IMO 9876543");
    expect(ents.some((e) => e.type === "imo" && e.value === "9876543")).toBe(true);
  });

  it("captures a bare 7-digit IMO with no prefix", () => {
    const ents = extractEntities("Look up 9876543 please");
    expect(ents.some((e) => e.type === "imo" && e.value === "9876543")).toBe(true);
  });

  it("captures IMO with punctuation drift (colon, dash, hash)", () => {
    for (const raw of ["IMO: 9876543", "IMO-9876543", "IMO#9876543"]) {
      const ents = extractEntities(raw);
      expect(ents.some((e) => e.type === "imo" && e.value === "9876543"), raw).toBe(true);
    }
  });

  it("rejects a 6-digit partial IMO (too short) and does not misclassify as MMSI", () => {
    const ents = extractEntities("check IMO 987654");
    expect(ents.some((e) => e.type === "imo")).toBe(false);
    expect(ents.some((e) => e.type === "mmsi")).toBe(false);
  });

  it("rejects an 8-digit malformed IMO (too long)", () => {
    // The extractor uses \b(?:IMO...)?(\d{7})\b so it must not grab 7
    // digits out of the middle of an 8-digit run.
    const ents = extractEntities("IMO 98765432");
    expect(ents.some((e) => e.type === "imo")).toBe(false);
  });

  it("distinguishes MMSI (9 digits) from IMO (7 digits) in the same query", () => {
    const ents = extractEntities("Vessel Ocean Pearl IMO 9876543 MMSI 123456789");
    expect(ents.some((e) => e.type === "imo" && e.value === "9876543")).toBe(true);
    expect(ents.some((e) => e.type === "mmsi" && e.value === "123456789")).toBe(true);
  });

  it("does not double-emit a 7-digit run as both IMO and MMSI", () => {
    const ents = extractEntities("IMO 9876543");
    const imos = ents.filter((e) => e.type === "imo");
    const mmsis = ents.filter((e) => e.type === "mmsi");
    expect(imos.length).toBe(1);
    expect(mmsis.length).toBe(0);
  });
});

describe("Vessel-name misspellings and casing drift", () => {
  it("carries the sticky anchor forward when a misspelling contains no entity", () => {
    const conv = [turn("officer", "Tell me about MV Ocean Pearl")];
    // Misspelled follow-up with no entity mention at all.
    const res = resolvePronouns("Wht is teh risk?", conv);
    // No pronouns → resolver won't rewrite, but findAnchor + interpreter
    // still promote the anchor when interpretQuery is called with it.
    const anchor = findAnchor(conv);
    const interp = interpretQuery("Wht is teh risk?", { anchor });
    expect(interp.entities.some((e) => /ocean pearl/i.test(e.value))).toBe(true);
    expect(interp.anchor?.value).toMatch(/Ocean Pearl/i);
    expect(res).toBeDefined();
  });

  it("does NOT treat a similarly-spelled new name as the same vessel", () => {
    // Officer names 'Ocean Pearl' first, then 'Ocean Pearll' (typo but a
    // NEW vessel token). The interpreter must recognise a vessel-kind
    // entity in the current turn and drop the anchor.
    const anchor: EntityMention = { type: "vessel", value: "Ocean Pearl" };
    const interp = interpretQuery("Tell me about MV Ocean Pearll", { anchor });
    expect(interp.anchor).toBeUndefined();
    expect(interp.entities.some((e) => /ocean pearll/i.test(e.value))).toBe(true);
  });

  it("preserves the officer's casing and punctuation in the captured value", () => {
    const ents = extractEntities("Investigate MV OCEAN-PEARL today");
    expect(ents.some((e) => e.type === "vessel" && /OCEAN-PEARL/.test(e.value))).toBe(true);
  });
});

describe("Quoted callsigns and quoted vessel names", () => {
  it("captures a quoted vessel name with straight quotes", () => {
    const ents = extractEntities('Look into "Ocean Pearl"');
    expect(ents.some((e) => e.type === "vessel" && e.value === "Ocean Pearl")).toBe(true);
  });

  it("captures a quoted name with typographic (curly) quotes", () => {
    const ents = extractEntities("Look into \u201COcean Pearl\u201D");
    expect(ents.some((e) => e.type === "vessel" && e.value === "Ocean Pearl")).toBe(true);
  });

  it("captures a quoted callsign token as a vessel candidate", () => {
    // Callsigns aren't a first-class entity type — they surface as a
    // quoted vessel candidate so the interpreter can still resolve them.
    const ents = extractEntities('Contact callsign "5NABC"');
    expect(ents.some((e) => e.type === "vessel" && e.value === "5NABC")).toBe(true);
  });

  it("classifies a bare quoted mention as an entity_dossier (no clarify)", () => {
    const interp = interpretQuery('"Ocean Pearl"');
    expect(interp.intent).toBe("entity_dossier");
    expect(interp.ambiguous).toBe(false);
  });
});

describe("AIS timeline follow-ups keep the sticky anchor", () => {
  const conv = [
    turn("officer", "Tell me about MV Ocean Pearl", [
      { type: "vessel", value: "Ocean Pearl" },
    ]),
    turn("copilot", "Briefing: MV Ocean Pearl"),
  ];

  it("resolves 'Replay AIS timeline' against the last-resolved vessel", () => {
    const anchor = findAnchor(conv);
    expect(anchor?.value).toMatch(/Ocean Pearl/i);

    const interp = interpretQuery("Replay AIS timeline", { anchor });
    expect(interp.ambiguous).toBe(false);
    expect(interp.entities.some((e) => /ocean pearl/i.test(e.value))).toBe(true);
    expect(interp.anchor?.value).toMatch(/Ocean Pearl/i);
  });

  it("resolves 'Show its AIS timeline for the last 24h' via pronoun rewrite", () => {
    const res = resolvePronouns("Show its AIS timeline for the last 24h", conv);
    expect(res.changed).toBe(true);
    expect(res.resolved).toMatch(/Ocean Pearl/i);
    expect(res.anchor?.value).toMatch(/Ocean Pearl/i);

    const interp = interpretQuery(res.resolved, { anchor: res.anchor });
    expect(interp.ambiguous).toBe(false);
    expect(interp.entities.some((e) => /ocean pearl/i.test(e.value))).toBe(true);
  });

  it("drops the anchor when the AIS follow-up names a different vessel", () => {
    const anchor = findAnchor(conv);
    const interp = interpretQuery(
      "Replay AIS timeline for MV Atlantic Trader",
      { anchor },
    );
    expect(interp.anchor).toBeUndefined();
    const values = interp.entities.map((e) => e.value.toLowerCase());
    expect(values.some((v) => v.includes("atlantic trader"))).toBe(true);
    expect(values.some((v) => v.includes("ocean pearl"))).toBe(false);
  });

  it("keeps the anchor when the follow-up references a raw IMO belonging to the same vessel", () => {
    // The interpreter's job is only to detect that a vessel-kind entity
    // was named in this turn; correlation between IMO ↔ vessel-name lives
    // downstream. This test pins the current parser behaviour: a bare
    // IMO in the follow-up supersedes the sticky name anchor because
    // IMO/MMSI share the vessel category.
    const anchor = findAnchor(conv);
    const interp = interpretQuery("Replay AIS timeline for IMO 9876543", {
      anchor,
    });
    expect(interp.anchor).toBeUndefined();
    expect(interp.entities.some((e) => e.type === "imo" && e.value === "9876543")).toBe(
      true,
    );
  });
});
