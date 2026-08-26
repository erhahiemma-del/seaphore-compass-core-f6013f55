/**
 * Mission Control operational modes.
 *
 * The properties worth pinning are the ones a mode could quietly break:
 *
 *   A mode must not conceal. Reordering is the mechanism; an officer in
 *   Revenue Assurance who stops seeing a critical incident because the
 *   lens dropped the panel is the failure a national picture exists to
 *   prevent.
 *
 *   A mode must not touch truth. It selects which KPI domains lead. It
 *   cannot supply a value, and there is no value in this module to
 *   supply — the coverage model owns those, along with their
 *   AWAITING_CREDENTIALS states.
 *
 *   The table must stay total. Eight modes, every one reachable from the
 *   tab order, every one resolvable from a URL.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { KpiDomainKey } from "@/lib/intelligence/coverage-model";
import {
  DEFAULT_MISSION_MODE,
  MISSION_MODES,
  MISSION_MODE_ORDER,
  orderKpis,
  orderPanels,
  panelRank,
  resolveMissionMode,
  type MissionPanelId,
} from "@/features/mission-control/modes";

const ALL_PANELS: readonly MissionPanelId[] = [
  "maritime-picture",
  "priority-queue",
  "my-workspace",
  "decisions-approvals",
  "handoffs-blockers",
  "recent-work",
  "intelligence-events",
  "focus-rail",
];

const ALL_KPIS: readonly KpiDomainKey[] = [
  "manifest",
  "vessel",
  "container",
  "revenue",
  "risk",
  "historical",
];

/* ═══════ 1. The table is total ═══════ */

describe("the mode table covers every declared mode", () => {
  it("declares exactly the eight specified modes", () => {
    expect(MISSION_MODE_ORDER).toHaveLength(8);
    expect(Object.keys(MISSION_MODES).sort()).toEqual([...MISSION_MODE_ORDER].sort());
  });

  it("gives every mode a label and a stated purpose", () => {
    for (const id of MISSION_MODE_ORDER) {
      const mode = MISSION_MODES[id];
      expect(mode.label.length).toBeGreaterThan(0);
      // The purpose is the tab's title attribute — a mode nobody can
      // explain is a tab nobody knows when to press.
      expect(mode.purpose.length).toBeGreaterThan(10);
    }
  });

  it("defaults to the national picture", () => {
    expect(DEFAULT_MISSION_MODE).toBe("national-picture");
    expect(MISSION_MODE_ORDER[0]).toBe(DEFAULT_MISSION_MODE);
  });
});

/* ═══════ 2. Modes reorder, never conceal ═══════ */

describe("a mode demotes panels rather than hiding them", () => {
  it("lists every panel in every mode", () => {
    for (const id of MISSION_MODE_ORDER) {
      expect([...MISSION_MODES[id].panels].sort()).toEqual([...ALL_PANELS].sort());
    }
  });

  it("returns every panel from orderPanels, whatever the mode", () => {
    for (const id of MISSION_MODE_ORDER) {
      const ordered = orderPanels(MISSION_MODES[id], ALL_PANELS);
      expect(ordered).toHaveLength(ALL_PANELS.length);
      expect([...ordered].sort()).toEqual([...ALL_PANELS].sort());
    }
  });

  it("returns every KPI domain from orderKpis, whatever the mode", () => {
    // Revenue Assurance still has to show that the vessel feed is down —
    // it is the reason half the revenue picture is unverifiable.
    for (const id of MISSION_MODE_ORDER) {
      const ordered = orderKpis(MISSION_MODES[id], ALL_KPIS);
      expect([...ordered].sort()).toEqual([...ALL_KPIS].sort());
    }
  });

  it("appends an unlisted panel instead of dropping it", () => {
    const mode = MISSION_MODES["national-picture"];
    const withUnknown = [...ALL_PANELS, "future-panel" as MissionPanelId];
    const ordered = orderPanels(mode, withUnknown);
    expect(ordered).toHaveLength(withUnknown.length);
    expect(ordered[ordered.length - 1]).toBe("future-panel");
  });
});

/* ═══════ 3. Each lens actually leads with something different ═══════ */

describe("modes are genuinely distinct lenses", () => {
  it("promotes revenue in Revenue Assurance and risk in Incident Response", () => {
    expect(MISSION_MODES["revenue-assurance"].leadKpis[0]).toBe("revenue");
    expect(MISSION_MODES["incident-response"].leadKpis[0]).toBe("risk");
  });

  it("gives each mode its own leading panel where the purpose differs", () => {
    // The panels are the approved composition's regions now, so a lens
    // leads with the region an officer in that lens reads first.
    expect(orderPanels(MISSION_MODES["revenue-assurance"], ALL_PANELS)[0]).toBe("priority-queue");
    expect(orderPanels(MISSION_MODES["investigation"], ALL_PANELS)[0]).toBe("focus-rail");
    expect(orderPanels(MISSION_MODES["national-picture"], ALL_PANELS)[0]).toBe("maritime-picture");
  });

  it("produces more than one distinct panel ordering across the eight", () => {
    const orderings = new Set(
      MISSION_MODE_ORDER.map((id) => orderPanels(MISSION_MODES[id], ALL_PANELS).join(">")),
    );
    // If every mode ordered identically the tabs would be decorative,
    // which the specification explicitly forbids.
    expect(orderings.size).toBeGreaterThan(5);
  });

  it("ranks a listed panel ahead of an unlisted one", () => {
    const mode = MISSION_MODES["incident-response"];
    expect(panelRank(mode, "priority-queue")).toBeLessThan(
      panelRank(mode, "future" as MissionPanelId),
    );
  });
});

/* ═══════ 4. Map layers stay logical, and honest ═══════ */

describe("mode map layers are logical registry keys", () => {
  it("never names a MapLibre render layer", () => {
    // A mode asks for "ports"; which render layers that resolves to is
    // the registry's decision, exactly as for an officer's own toggle.
    for (const id of MISSION_MODE_ORDER) {
      for (const layer of MISSION_MODES[id].mapLayers) {
        expect(layer).not.toMatch(/-layer$/);
      }
    }
  });

  it("lights buildings only in the lens that can actually use them", () => {
    // Buildings draw nothing below zoom 13. Enabling them nationally
    // would be a toggle with no visible effect.
    const withBuildings = MISSION_MODE_ORDER.filter((id) =>
      MISSION_MODES[id].mapLayers.includes("buildings"),
    );
    expect(withBuildings).toEqual(["port-intelligence"]);
  });

  it("gives every mode at least one layer", () => {
    for (const id of MISSION_MODE_ORDER) {
      expect(MISSION_MODES[id].mapLayers.length).toBeGreaterThan(0);
    }
  });
});

/* ═══════ 5. Resolution from untrusted input ═══════ */

describe("resolving a mode from a URL never throws", () => {
  it("resolves each declared id to itself", () => {
    for (const id of MISSION_MODE_ORDER) {
      expect(resolveMissionMode(id).id).toBe(id);
    }
  });

  it("falls back to the national picture for anything unrecognised", () => {
    // A stale shared link is a reason to show the whole picture, not an
    // error page.
    for (const bad of ["", "nope", null, undefined, "__proto__"]) {
      expect(resolveMissionMode(bad).id).toBe(DEFAULT_MISSION_MODE);
    }
  });
});

/* ═══════ 6. Modes carry no intelligence ═══════ */

describe("a mode cannot invent a value", () => {
  it("declares KPI domains, never KPI values", () => {
    // Structural: if a mode could carry a number, a lens could disagree
    // with the coverage model about what is true.
    const serialised = JSON.stringify(MISSION_MODES);
    expect(serialised).not.toMatch(/"value"\s*:/);
    expect(serialised).not.toMatch(/"display"\s*:/);
    expect(serialised).not.toMatch(/"confidence"\s*:/);
  });

  it("keeps every mode's KPI list to declared domain keys", () => {
    for (const id of MISSION_MODE_ORDER) {
      for (const key of MISSION_MODES[id].leadKpis) {
        expect(ALL_KPIS).toContain(key);
      }
    }
  });
});

/* ═══════ 7. M2.10 — every recommended action leads somewhere real ═══════ */

describe("recommended actions resolve to routes that exist", () => {
  /**
   * The router's real route files, read from disk.
   *
   * Asserting against the filesystem rather than a hand-copied list is
   * the point: a route deleted in a later phase breaks this test rather
   * than silently leaving a dead action in Mission Control.
   */
  const routeFiles = readdirSync(resolve(process.cwd(), "src/routes"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, ""));

  /** `/decide/queue` → `decide.queue`; `/ports` → `ports`. */
  const toRouteId = (href: string) => href.replace(/^\//, "").replace(/\//g, ".");

  it("finds a route file for every action in every mode", () => {
    for (const id of MISSION_MODE_ORDER) {
      for (const action of MISSION_MODES[id].actions) {
        const routeId = toRouteId(action.href);
        const exists =
          routeFiles.includes(routeId) ||
          routeFiles.includes(`${routeId}.index`) ||
          // Nested routes may live under a parent file.
          routeFiles.some((f) => f === routeId.split(".")[0]);
        expect(exists, `${id}: "${action.label}" → ${action.href}`).toBe(true);
      }
    }
  });

  it("gives every mode at least one action", () => {
    // A lens that suggests nothing is a tab with no purpose.
    for (const id of MISSION_MODE_ORDER) {
      expect(MISSION_MODES[id].actions.length).toBeGreaterThan(0);
    }
  });

  it("gives every action a label, an href and a stated rationale", () => {
    for (const id of MISSION_MODE_ORDER) {
      for (const action of MISSION_MODES[id].actions) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(action.href.startsWith("/")).toBe(true);
        // The rationale is why *this lens* suggests it — without one an
        // action is a link, not a recommendation.
        expect(action.rationale.length).toBeGreaterThan(10);
      }
    }
  });

  it("suggests genuinely different work in different lenses", () => {
    const first = (id: (typeof MISSION_MODE_ORDER)[number]) => MISSION_MODES[id].actions[0].href;
    const distinct = new Set(MISSION_MODE_ORDER.map(first));
    expect(distinct.size).toBeGreaterThan(5);
  });

  it("never points an action at a placeholder or an anchor", () => {
    for (const id of MISSION_MODE_ORDER) {
      for (const action of MISSION_MODES[id].actions) {
        expect(action.href).not.toMatch(/^#|todo|placeholder|coming-soon/i);
      }
    }
  });
});
