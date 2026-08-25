/**
 * Mission Control visual hierarchy.
 *
 * Emphasis is where "demote, never conceal" is easiest to break. A
 * filter reads almost identically to a sort in code, and the difference
 * only shows up as a KPI an officer can no longer see — no error, no
 * warning, just a blocked provider that stopped being mentioned.
 *
 * The second risk is the supporting switcher. Progressive disclosure is
 * only legitimate while nothing blocking sits behind a tab, and while
 * the officer's own selection is not thrown away by an unrelated action.
 */
import { describe, expect, it } from "vitest";

import type { KpiDomainKey } from "@/lib/intelligence/coverage-model";
import {
  defaultSupportingPanel,
  resolveSupportingPanel,
  tierKpis,
} from "@/features/mission-control/hierarchy";
import {
  COMPOSABLE_PANELS,
  MISSION_MODES,
  MISSION_MODE_ORDER,
  type MissionPanelId,
} from "@/features/mission-control/modes";

interface Row {
  readonly key: string;
  readonly metricKey: KpiDomainKey;
}

const ROWS: readonly Row[] = [
  { key: "manifest-intelligence", metricKey: "manifest" },
  { key: "vessel-intelligence", metricKey: "vessel" },
  { key: "container-intelligence", metricKey: "container" },
  { key: "revenue-intelligence", metricKey: "revenue" },
  { key: "risk-intelligence", metricKey: "risk" },
  { key: "historical-intelligence", metricKey: "historical" },
];

const keyOf = (row: Row) => row.metricKey;

/* ═══════ 1. Tiering demotes, never conceals ═══════ */

describe("KPI tiering keeps every KPI on screen", () => {
  it("returns every input exactly once, in every lens", () => {
    for (const id of MISSION_MODE_ORDER) {
      const tiered = tierKpis(MISSION_MODES[id], ROWS, keyOf);
      expect(tiered).toHaveLength(ROWS.length);
      expect(tiered.map((t) => t.item.key).sort()).toEqual(ROWS.map((r) => r.key).sort());
    }
  });

  it("names exactly one lead", () => {
    for (const id of MISSION_MODE_ORDER) {
      const leads = tierKpis(MISSION_MODES[id], ROWS, keyOf).filter((t) => t.tier === "lead");
      expect(leads).toHaveLength(1);
    }
  });

  it("leads with the domain the lens leads with", () => {
    const lead = (id: (typeof MISSION_MODE_ORDER)[number]) =>
      tierKpis(MISSION_MODES[id], ROWS, keyOf).find((t) => t.tier === "lead")!.item.metricKey;
    expect(lead("revenue-assurance")).toBe("revenue");
    expect(lead("risk-compliance")).toBe("risk");
    expect(lead("port-intelligence")).toBe("container");
    expect(lead("strategic-intelligence")).toBe("historical");
  });

  it("changes the lead when the lens changes", () => {
    const leads = new Set(
      MISSION_MODE_ORDER.map(
        (id) => tierKpis(MISSION_MODES[id], ROWS, keyOf).find((t) => t.tier === "lead")!.item.key,
      ),
    );
    // If every lens led with the same KPI, tiering would be decoration.
    expect(leads.size).toBeGreaterThan(2);
  });

  it("still renders the background tier", () => {
    // The whole reason for three tiers rather than a filter: a blocked
    // provider must stay visible even when the lens does not lead with it.
    const tiered = tierKpis(MISSION_MODES["revenue-assurance"], ROWS, keyOf);
    const background = tiered.filter((t) => t.tier === "background");
    expect(background.length).toBeGreaterThan(0);
    for (const entry of background) expect(entry.item).toBeTruthy();
  });

  it("orders lead, then secondary, then background", () => {
    const tiers = tierKpis(MISSION_MODES["national-picture"], ROWS, keyOf).map((t) => t.tier);
    const rank = { lead: 0, secondary: 1, background: 2 } as const;
    const ranks = tiers.map((t) => rank[t]);
    expect([...ranks].sort()).toEqual(ranks);
  });

  it("handles an empty input without inventing a lead", () => {
    expect(tierKpis(MISSION_MODES["national-picture"], [], keyOf)).toHaveLength(0);
  });
});

/* ═══════ 2. Supporting panel selection ═══════ */

describe("supporting panel selection respects both lens and officer", () => {
  it("opens each lens on its own leading panel", () => {
    expect(defaultSupportingPanel(MISSION_MODES["revenue-assurance"])).toBe("revenue-assurance");
    expect(defaultSupportingPanel(MISSION_MODES["port-intelligence"])).toBe("port-operations");
    expect(defaultSupportingPanel(MISSION_MODES["risk-compliance"])).toBe("compliance-watchlist");
  });

  it("always resolves to a composable panel", () => {
    for (const id of MISSION_MODE_ORDER) {
      expect(COMPOSABLE_PANELS).toContain(defaultSupportingPanel(MISSION_MODES[id]));
    }
  });

  it("lets the officer's choice win within a lens", () => {
    const mode = MISSION_MODES["revenue-assurance"];
    expect(resolveSupportingPanel(mode, { [mode.id]: "port-operations" })).toBe("port-operations");
  });

  it("remembers choices per lens rather than globally", () => {
    // One global choice would mean switching to Revenue Assurance and
    // still staring at ports — the lens change would do nothing.
    const choices = { "revenue-assurance": "port-operations" as MissionPanelId };
    expect(resolveSupportingPanel(MISSION_MODES["revenue-assurance"], choices)).toBe(
      "port-operations",
    );
    expect(resolveSupportingPanel(MISSION_MODES["risk-compliance"], choices)).toBe(
      "compliance-watchlist",
    );
  });

  it("restores the officer's choice on returning to that lens", () => {
    const choices = { "port-intelligence": "revenue-assurance" as MissionPanelId };
    // Away and back — the deliberate selection survives.
    expect(resolveSupportingPanel(MISSION_MODES["investigation"], choices)).toBe(
      defaultSupportingPanel(MISSION_MODES["investigation"]),
    );
    expect(resolveSupportingPanel(MISSION_MODES["port-intelligence"], choices)).toBe(
      "revenue-assurance",
    );
  });

  it("falls back when a remembered choice is no longer composable", () => {
    const stale = { "national-picture": "maritime-picture" as MissionPanelId };
    expect(resolveSupportingPanel(MISSION_MODES["national-picture"], stale)).toBe(
      defaultSupportingPanel(MISSION_MODES["national-picture"]),
    );
  });

  it("keeps every supporting panel reachable in every lens", () => {
    // Progressive disclosure, not removal: all four must remain
    // selectable whichever lens is active.
    for (const id of MISSION_MODE_ORDER) {
      for (const panel of COMPOSABLE_PANELS) {
        expect(resolveSupportingPanel(MISSION_MODES[id], { [id]: panel })).toBe(panel);
      }
    }
  });
});
