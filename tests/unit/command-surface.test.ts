/**
 * Command surface — behavioural contract.
 *
 * The failures worth guarding are the ones that still look like a
 * working search box:
 *
 *   A port name classified as a vessel identifier and sent to an exact
 *   lookup that can only miss.
 *   A high-risk vessel outranking the exact IMO the officer typed.
 *   A lens quietly filtering results instead of reordering them, so a
 *   port stops existing in Revenue Assurance.
 *   An empty result set rendering as a blank panel rather than saying
 *   nothing matched.
 *   A "3" badge on an approvals screen that does not exist.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { MISSION_MODES, MISSION_MODE_ORDER } from "@/features/mission-control/modes";
import { deriveCopilotContext } from "@/features/mission-control/useCopilotContextBinding";
import {
  buildCommandActions,
  commandDestination,
  MANIFEST_INGESTION_AVAILABLE,
  type CommandActionId,
} from "@/features/command/actions";
import { detectQueryKind, isIdentifier, parseCommandQuery } from "@/features/command/query";
import { focusSubjectFromResult, isFocusable } from "@/features/command/focus-bridge";
import {
  groupResults,
  isSearchable,
  rankResults,
  toSearchState,
  type CommandEntityRow,
} from "@/features/command/results";
import {
  RECENT_SEARCH_LIMIT,
  useRecentSearchStore,
  withRecentSearch,
} from "@/features/command/recent-searches";
import type { Role } from "@/lib/permissions";

const MODE = MISSION_MODES["national-picture"];
const q = (s: string) => parseCommandQuery(s);

const row = (over: Partial<CommandEntityRow> & { id: string; name: string }): CommandEntityRow => ({
  type: "vessel",
  ...over,
});

/* ═══════ 1–3. Query understanding ═══════ */

describe("query classification", () => {
  it("recognises an IMO, with or without its prefix", () => {
    expect(detectQueryKind("9328374")).toBe("imo");
    expect(q("IMO 9328374").kind).toBe("imo");
    expect(q("IMO 9328374").normalized).toBe("9328374");
  });

  it("recognises an MMSI and keeps it distinct from an IMO", () => {
    // Nine digits vs seven. Conflating them would send a radio identity
    // to a hull-number lookup.
    expect(detectQueryKind("123456789")).toBe("mmsi");
    expect(detectQueryKind("9328374")).toBe("imo");
  });

  it("treats a name as free text rather than an identifier", () => {
    for (const name of ["MV Ocean Melody", "Apapa", "CMA CGM"]) {
      expect(detectQueryKind(name), name).toBe("free-text");
      expect(isIdentifier(detectQueryKind(name))).toBe(false);
    }
  });

  it("still recognises the identifier forms the dispatcher already knew", () => {
    expect(detectQueryKind("MSCU1234567")).toBe("container");
    expect(detectQueryKind("BOL-2401")).toBe("bol");
  });

  it("reports an empty query as empty rather than as a failed search", () => {
    expect(q("").kind).toBe("empty");
    expect(q("   ").kind).toBe("empty");
  });

  it("searches identifiers immediately and free text only once it is worth it", () => {
    expect(isSearchable(q("9328374"))).toBe(true);
    expect(isSearchable(q("A"))).toBe(false);
    expect(isSearchable(q("Ap"))).toBe(true);
    expect(isSearchable(q(""))).toBe(false);
  });
});

/* ═══════ 4, 8. Ranking ═══════ */

describe("result ranking", () => {
  const rows = [
    row({ id: "1", name: "Ocean Melody Shipping", type: "company" }),
    row({ id: "2", name: "MV Ocean Melody", type: "vessel" }),
    row({ id: "3", name: "Apapa", type: "port", aliases: ["Lagos Port Complex"] }),
  ];

  it("puts an exact name match first", () => {
    const ranked = rankResults(rows, q("Apapa"), MODE);
    expect(ranked[0].title).toBe("Apapa");
  });

  it("ranks a prefix match above a mid-string one", () => {
    const ranked = rankResults(rows, q("Ocean"), MODE);
    expect(ranked[0].title).toBe("Ocean Melody Shipping");
  });

  it("finds an entity by an alias and says which one matched", () => {
    const ranked = rankResults(rows, q("Lagos Port"), MODE);
    expect(ranked[0].title).toBe("Apapa");
    expect(ranked[0].matchedAlias).toBe("Lagos Port Complex");
  });

  it("never lets the lens outrank a better textual match", () => {
    // Revenue Assurance favours companies. An exact vessel name must
    // still win, or the officer's own words stop deciding the answer.
    const ranked = rankResults(rows, q("MV Ocean Melody"), MISSION_MODES["revenue-assurance"]);
    expect(ranked[0].title).toBe("MV Ocean Melody");
  });

  it("reorders equal matches by lens", () => {
    const tied = [
      row({ id: "c", name: "Ocean", type: "company" }),
      row({ id: "p", name: "Ocean", type: "port" }),
    ];
    const revenue = rankResults(tied, q("Ocean"), MISSION_MODES["revenue-assurance"]);
    const ports = rankResults(tied, q("Ocean"), MISSION_MODES["port-intelligence"]);
    expect(revenue[0].kind).toBe("company");
    expect(ports[0].kind).toBe("port");
  });

  it("never removes a kind the lens does not favour", () => {
    // Search stays universal: demote, never conceal.
    for (const id of MISSION_MODE_ORDER) {
      const ranked = rankResults(rows, q("Ocean"), MISSION_MODES[id]);
      expect(ranked, id).toHaveLength(rows.length);
    }
  });

  it("does not rank on risk", () => {
    // "Most relevant to what I typed" is not "most dangerous".
    const withRisk = [
      { ...row({ id: "hi", name: "Unrelated Vessel" }), risk_score: 99 },
      row({ id: "hit", name: "Apapa", type: "port" }),
    ] as CommandEntityRow[];
    expect(rankResults(withRisk, q("Apapa"), MODE)[0].id).toBe("hit");
  });

  it("leads the strongest group, not the biggest one", () => {
    const many = [
      row({ id: "v", name: "Apapa", type: "port" }),
      row({ id: "c1", name: "Apapa Traders", type: "company" }),
      row({ id: "c2", name: "Apapa Logistics", type: "company" }),
      row({ id: "c3", name: "Apapa Freight", type: "company" }),
    ];
    const groups = groupResults(rankResults(many, q("Apapa"), MODE));
    expect(groups[0].kind).toBe("port");
  });

  it("reports evidence count only when the column is present", () => {
    const [withEvidence, without] = rankResults(
      [row({ id: "a", name: "A", evidence_ids: ["e1", "e2"] }), row({ id: "b", name: "B" })],
      q("A"),
      MODE,
    ).sort((x, y) => x.id.localeCompare(y.id));
    expect(withEvidence.evidenceCount).toBe(2);
    // Absent column is undefined, never 0.
    expect(without.evidenceCount).toBeUndefined();
  });
});

/* ═══════ 15. Empty and no-match ═══════ */

describe("empty states stay distinct", () => {
  it("reports no-match rather than an empty result list", () => {
    const state = toSearchState([], q("Nonexistent Vessel"), MODE);
    expect(state.state).toBe("no-match");
  });

  it("reports idle for an empty query rather than no-match", () => {
    // Nothing was asked. That is not the same as nothing being found.
    expect(toSearchState([], q(""), MODE).state).toBe("idle");
  });

  it("returns results when there are any", () => {
    const state = toSearchState([row({ id: "1", name: "Apapa", type: "port" })], q("Apapa"), MODE);
    expect(state.state).toBe("results");
    if (state.state === "results") expect(state.total).toBe(1);
  });
});

/* ═══════ 6, 7. Recent searches ═══════ */

describe("recent searches", () => {
  beforeEach(() => useRecentSearchStore.setState({ queries: [] }));

  it("orders by recency", () => {
    expect(withRecentSearch(["b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("de-duplicates case-insensitively and keeps the newest casing", () => {
    // "apapa" after "Apapa" must move the entry, not add a visual twin.
    expect(withRecentSearch(["Apapa", "x"], "apapa")).toEqual(["apapa", "x"]);
  });

  it("caps the list", () => {
    let list: readonly string[] = [];
    for (let i = 0; i < RECENT_SEARCH_LIMIT + 5; i++) list = withRecentSearch(list, `q${i}`);
    expect(list).toHaveLength(RECENT_SEARCH_LIMIT);
  });

  it("ignores blank queries", () => {
    expect(withRecentSearch(["a"], "   ")).toEqual(["a"]);
  });

  it("starts empty and is never seeded", () => {
    // The reference shows five example chips. Shipping them would tell an
    // officer they had searched for vessels they have never seen.
    expect(useRecentSearchStore.getState().queries).toEqual([]);
  });

  it("remembers and clears", () => {
    useRecentSearchStore.getState().remember("Apapa");
    expect(useRecentSearchStore.getState().queries).toEqual(["Apapa"]);
    useRecentSearchStore.getState().clear();
    expect(useRecentSearchStore.getState().queries).toEqual([]);
  });
});

/* ═══════ 9. Search → Focus ═══════ */

describe("search results converge on the focus subject", () => {
  it("focuses the kinds that have an exact focus equivalent", () => {
    for (const [entity, focus] of [
      ["vessel", "vessel"],
      ["port", "port"],
      ["company", "company"],
      ["voyage", "voyage"],
      ["manifest", "manifest"],
      ["cargo_item", "cargo"],
    ] as const) {
      const subject = focusSubjectFromResult({
        id: "x",
        kind: entity,
        title: "T",
        score: 1,
      });
      expect(subject?.kind, entity).toBe(focus);
      expect(subject?.id).toBe("x");
    }
  });

  it("refuses to coerce kinds with no focus equivalent", () => {
    // A container is not cargo; a person is not a company.
    for (const kind of ["container", "person", "document", "agency", "signal"]) {
      expect(focusSubjectFromResult({ id: "x", kind, title: "T", score: 1 }), kind).toBeNull();
      expect(isFocusable(kind)).toBe(false);
    }
  });

  it("invents no descriptor when the row carried no source", () => {
    const subject = focusSubjectFromResult({ id: "x", kind: "vessel", title: "T", score: 1 });
    expect(subject?.descriptor).toBeUndefined();
  });
});

/* ═══════ 10–14. Actions ═══════ */

describe("command actions", () => {
  const build = (roles: readonly Role[] | null, mode = MODE) =>
    buildCommandActions({ mode, roles });
  const find = (roles: readonly Role[] | null, id: CommandActionId, mode = MODE) =>
    build(roles, mode).find((a) => a.id === id);

  it("permits an officer and refuses a partner agency", () => {
    expect(find(["officer"], "investigate")?.availability.state).toBe("ready");
    expect(find(["external_agency"], "investigate")?.availability.state).toBe("permission-denied");
  });

  it("names the permission it required", () => {
    const availability = find(["external_agency"], "investigate")?.availability;
    if (availability?.state === "permission-denied") {
      expect(availability.permission).toBe("investigation.create");
    } else {
      throw new Error("expected permission-denied");
    }
  });

  it("gives an unauthenticated officer no ready action", () => {
    for (const action of build(null)) {
      expect(action.availability.state, action.id).not.toBe("ready");
    }
  });

  it("reports the two unbuilt shortcuts as unbuilt, not as empty", () => {
    // The reference shows a "3" badge on Review Approvals. There is no
    // store behind it, and inventing one is the fabricated metric this
    // system refuses everywhere else.
    for (const id of ["review-approvals", "watchlist"] as CommandActionId[]) {
      const availability = find(["admin"], id)?.availability;
      expect(availability?.state, id).toBe("not-built");
    }
  });

  it("gives every unavailable action a reason", () => {
    for (const action of build(["external_agency"])) {
      if (action.availability.state !== "ready") {
        expect(action.availability, action.id).not.toEqual({ state: action.availability.state });
      }
    }
  });

  it("keeps every action present under every lens", () => {
    for (const id of MISSION_MODE_ORDER) {
      expect(build(["admin"], MISSION_MODES[id]), id).toHaveLength(8);
    }
  });

  it("reorders by lens without interleaving the groups", () => {
    const revenue = build(["admin"], MISSION_MODES["revenue-assurance"]);
    const investigation = build(["admin"], MISSION_MODES["investigation"]);
    expect(revenue[0].id).toBe("upload-manifest");
    expect(investigation[0].id).toBe("investigate");
    const groups = revenue.map((a) => a.group);
    expect(groups.indexOf("shortcut")).toBeGreaterThan(groups.lastIndexOf("primary"));
  });

  it("starts a new investigation when there is no open case", () => {
    expect(commandDestination("investigate", {})).toEqual({ kind: "investigate-new" });
  });

  it("continues an open case rather than opening a second one", () => {
    expect(commandDestination("investigate", { openCaseId: "case_1" })).toEqual({
      kind: "investigate-case",
      id: "case_1",
    });
  });

  it("routes report generation and manifest review at real surfaces", () => {
    expect(commandDestination("generate-report")).toEqual({ kind: "briefings" });
    expect(commandDestination("upload-manifest")).toEqual({ kind: "manifest" });
    expect(commandDestination("decision-queue")).toEqual({ kind: "decision-queue" });
    expect(commandDestination("evidence-packages")).toEqual({ kind: "evidence" });
  });

  it("has nowhere to send the unbuilt shortcuts", () => {
    expect(commandDestination("review-approvals")).toBeNull();
    expect(commandDestination("watchlist")).toBeNull();
  });

  it("declares manifest ingestion unavailable", () => {
    // The adapter matrix marks OCR ACTIVE, but the real call lives in
    // ocr.functions.ts "once wired" and that file does not exist.
    expect(MANIFEST_INGESTION_AVAILABLE).toBe(false);
  });

  it("names only routes that exist on disk", () => {
    const routes = readdirSync(resolve(process.cwd(), "src/routes"));
    for (const file of [
      "investigate.tsx",
      "investigate.$id.tsx",
      "manifest.tsx",
      "briefing-centre.tsx",
      "decide.queue.tsx",
      "evidence.tsx",
      "entity.$id.tsx",
    ]) {
      expect(routes, `${file} is missing`).toContain(file);
    }
  });
});

/* ═══════ 19. Copilot ═══════ */

describe("copilot context follows the command surface", () => {
  it("reports a focused search result as its own kind", () => {
    const ctx = deriveCopilotContext(MODE, { kind: "vessel", title: "MV Ocean Melody" });
    expect(ctx.kind).toBe("vessel");
    expect(ctx.label).toBe("MV Ocean Melody");
    expect(ctx.detail).toContain(MODE.label);
  });

  it("still refuses kinds the vocabulary cannot express", () => {
    expect(deriveCopilotContext(MODE, { kind: "cargo", title: "X" }).kind).toBe("investigation");
  });
});

/* ═══════ 20. No parallel systems ═══════ */

describe("the command surface introduces no parallel systems", () => {
  const DIR = resolve(process.cwd(), "src/features/command");
  const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const sourceOf = (f: string) => readFileSync(resolve(DIR, f), "utf8");
  const all = FILES.map(sourceOf).join("\n");

  it("declares exactly one store, for recent searches only", () => {
    const creators = FILES.filter((f) => /\bcreate<|\bcreate\(/.test(sourceOf(f)));
    expect(creators).toEqual(["recent-searches.ts"]);
  });

  it("reads focus from the shared store rather than tracking its own", () => {
    expect(all).toContain("useFocusSubjectStore");
    expect(all).not.toMatch(/const\s*\[\s*focus\w*\s*,\s*set\w*Focus/i);
  });

  it("builds no second permission check", () => {
    expect(all).not.toMatch(/ROLE_RANK|isOfficerOrAbove\s*\(/);
  });

  it("builds no second identity or entity search", () => {
    // The registry is reached through the existing repository only.
    expect(all).toContain("entityRepository");
    expect(all).not.toMatch(/from\(["']entities["']\)/);
    expect(all).not.toContain("supabase");
  });

  it("makes no direct provider call from the browser", () => {
    expect(all).not.toMatch(/https?:\/\/(?!localhost)/);
    expect(all).not.toMatch(/\bfetch\s*\(/);
  });

  it("uses the existing audit log rather than a second one", () => {
    expect(all).toContain("writeAuditLog");
  });

  it("keeps the landmarks a visual pass must not remove", () => {
    for (const testid of ["command-surface", "command-input", "command-results"]) {
      expect(all, `data-testid="${testid}" was removed`).toContain(`data-testid="${testid}"`);
    }
  });

  it("fabricates no operational figure or seeded history", () => {
    const readable = all
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ")
      .replace(/className=(?:"[^"]*"|\{[^}]*\})/g, " ");
    expect(readable).not.toMatch(/₦\s*[\d.]/);
    // The reference's five example recent searches must not be shipped.
    for (const seeded of ["MV Ocean Melody", "CMA CGM Tema", "Lagos Anchorage", "9328374"]) {
      expect(readable, `${seeded} was seeded as real data`).not.toContain(seeded);
    }
  });
});
