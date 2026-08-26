/**
 * M2.10 Phase 1.5 — Mission Control composition.
 *
 * Three properties, each with a failure that looks like a feature until
 * an officer hits it:
 *
 *   A lens must not overrule the operator. Writing a mode's recommended
 *   layers into the active set would silently destroy a map an officer
 *   deliberately arranged — helpful-looking, and the reason the
 *   recommendation model is advisory.
 *
 *   Mode and focus must stay independent. Merging them would make
 *   selecting a vessel change the lens, or changing the lens clear the
 *   subject; neither is something the officer asked for.
 *
 *   Decision & Coordination must lead with decisions. It inherited an
 *   incident-first ordering from an earlier taxonomy where it was
 *   "Incident Response", and the two answer different questions.
 */
import { describe, expect, it } from "vitest";

import {
  COMPOSABLE_PANELS,
  MISSION_MODES,
  MISSION_MODE_ORDER,
  orderPanels,
} from "@/features/mission-control/modes";
import {
  applyRecommendation,
  recommendMapLayers,
} from "@/features/mission-control/map-recommendation";
import { contextualEmphasis } from "@/features/mission-control/useMissionMode";

type ModeId = (typeof MISSION_MODE_ORDER)[number];

/* ═══════ 1. Map recommendation never overrules the officer ═══════ */

describe("map recommendations are advisory, never applied automatically", () => {
  it("reports what a lens suggests without changing anything", () => {
    const mode = MISSION_MODES["port-intelligence"];
    const officerLayers = ["vessels", "graticule"];
    const rec = recommendMapLayers(mode, officerLayers);

    expect(rec.recommended).toEqual(mode.mapLayers);
    expect(rec.missing).toContain("ports");
    expect(rec.missing).toContain("buildings");
    // The function is pure — the officer's array is untouched.
    expect(officerLayers).toEqual(["vessels", "graticule"]);
  });

  it("treats a satisfied recommendation as satisfied", () => {
    const mode = MISSION_MODES["national-picture"];
    const rec = recommendMapLayers(mode, [...mode.mapLayers]);
    expect(rec.satisfied).toBe(true);
    expect(rec.missing).toHaveLength(0);
  });

  it("does not treat an officer's extra layer as a deviation to correct", () => {
    // A lens suggesting four layers has no opinion about a fifth the
    // officer added. Reporting it as wrong would be the same overreach
    // in a quieter form.
    const mode = MISSION_MODES["national-picture"];
    const rec = recommendMapLayers(mode, [...mode.mapLayers, "buildings"]);
    expect(rec.satisfied).toBe(true);
    expect(rec.extra).toEqual(["buildings"]);
  });

  it("applies additively when the officer explicitly asks", () => {
    // Apply-recommended-view must not be a destructive action wearing a
    // helpful label — the officer asked to see the lens's layers, not to
    // lose the ones they chose.
    const mode = MISSION_MODES["port-intelligence"];
    const next = applyRecommendation(mode, ["investigArea", "vessels"]);
    expect(next).toContain("investigArea");
    for (const layer of mode.mapLayers) expect(next).toContain(layer);
  });

  it("never drops an officer layer when applying", () => {
    for (const id of MISSION_MODE_ORDER) {
      const officer = ["investigArea", "buildings", "voyages"];
      const next = applyRecommendation(MISSION_MODES[id], officer);
      for (const layer of officer) expect(next).toContain(layer);
    }
  });

  it("produces no duplicates when a layer is both chosen and recommended", () => {
    const mode = MISSION_MODES["national-picture"];
    const next = applyRecommendation(mode, ["vessels", "vessels", "ports"]);
    expect(new Set(next).size).toBe(next.length);
  });
});

/* ═══════ 2. Composable panels ═══════ */

describe("only panels that can move safely are composable", () => {
  it("limits composition to the uniform operational grid", () => {
    // The map and feed share an asymmetric row and anchor the page.
    // Reordering them would resize both and read as instability.
    expect(COMPOSABLE_PANELS).not.toContain("maritime-picture");
    expect(COMPOSABLE_PANELS).not.toContain("intelligence-feed");
    expect(COMPOSABLE_PANELS).toHaveLength(4);
  });

  it("orders the composable set differently across lenses", () => {
    const orderings = new Set(
      MISSION_MODE_ORDER.map((id) => orderPanels(MISSION_MODES[id], COMPOSABLE_PANELS).join(">")),
    );
    expect(orderings.size).toBeGreaterThan(2);
  });

  it("keeps all four panels present in every lens", () => {
    for (const id of MISSION_MODE_ORDER) {
      const ordered = orderPanels(MISSION_MODES[id], COMPOSABLE_PANELS);
      expect([...ordered].sort()).toEqual([...COMPOSABLE_PANELS].sort());
    }
  });

  it("leads the operational grid with the column the lens works from", () => {
    /*
     * The composable panels are now the four lower-workspace columns.
     * They previously named the supporting-intelligence panels, which
     * left Mission Control with the approved composition — so the lens
     * ranks what is actually on the page.
     */
    const lead = (id: ModeId) => orderPanels(MISSION_MODES[id], COMPOSABLE_PANELS)[0];
    expect(lead("revenue-assurance")).toBe("my-workspace");
    expect(lead("incident-response")).toBe("handoffs-blockers");
    expect(lead("executive-briefing")).toBe("recent-work");
  });

  it("uses logical panel ids, never JSX or routes", () => {
    for (const id of MISSION_MODE_ORDER) {
      for (const panel of MISSION_MODES[id].panels) {
        expect(panel).not.toMatch(/^\/|</);
      }
    }
  });
});

/* ═══════ 3. Decision & Coordination is not Incident Response ═══════ */

describe("Incident Response leads with incidents", () => {
  const mode = MISSION_MODES["incident-response"];

  /*
   * This lens was previously "Decision & Coordination", and this block
   * asserted the opposite of what it asserts now — that the work queue
   * led and that the purpose named no incident. That reasoning was
   * sound on its own terms: incident response asks "what is happening",
   * a decision queue asks "what is waiting on a decision, and who owes
   * it".
   *
   * The approved composition names this lens Incident Response, so the
   * behaviour follows the label. The decision work it used to lead with
   * is not lost — it is a standing region of the page now, in Decisions
   * & Approvals and Handoffs & Blockers, visible under every lens
   * instead of only under one.
   */
  it("puts what is happening first", () => {
    expect(mode.panels[0]).toBe("priority-queue");
    expect(mode.panels).toContain("maritime-picture");
  });

  it("states an incident-shaped purpose", () => {
    expect(mode.purpose).toMatch(/incident/i);
  });

  it("leads with risk, then the subject the incident is usually about", () => {
    expect(mode.leadKpis[0]).toBe("risk");
    expect(mode.leadKpis[1]).toBe("vessel");
  });

  it("recommends the layers that show incidents", () => {
    // Both are registered `pending-source`. Recommending them is still
    // honest: the lens says what it wants to see and the layer says
    // whether anything is behind it.
    expect(mode.mapLayers).toContain("incidents");
    expect(mode.mapLayers).toContain("weather");
  });

  it("points its first action at what has been raised", () => {
    expect(mode.actions[0].href).toBe("/alerts");
  });
});

/* ═══════ 4. Mode and focus coexist without competing ═══════ */

describe("mission mode and focus subject stay independent", () => {
  it("describes the lens alone when nothing is focused", () => {
    const out = contextualEmphasis(MISSION_MODES["investigation"], null);
    expect(out.mode).toBe("investigation");
    expect(out.focus).toBeNull();
    expect(out.summary).toMatch(/no subject focused/i);
  });

  it("narrows the lens without reassigning it", () => {
    // Investigation plus a vessel is still an investigation view,
    // pointed at that hull — focus must not turn it into a vessel view.
    const out = contextualEmphasis(MISSION_MODES["investigation"], "vessel");
    expect(out.mode).toBe("investigation");
    expect(out.focus).toBe("vessel");
  });

  it("keeps the same focus meaningful under a different lens", () => {
    const port = contextualEmphasis(MISSION_MODES["port-intelligence"], "vessel");
    const invest = contextualEmphasis(MISSION_MODES["investigation"], "vessel");
    expect(port.focus).toBe(invest.focus);
    // Same subject, different lens — and the lens is what differs.
    expect(port.mode).not.toBe(invest.mode);
  });

  it("returns only mode, focus and a summary — never intelligence", () => {
    const out = contextualEmphasis(MISSION_MODES["national-picture"], "port");
    expect(Object.keys(out).sort()).toEqual(["focus", "mode", "summary"]);
  });
});

/* ═══════ 5. Composition introduces no fabricated metric ═══════ */

describe("composition carries no production values", () => {
  it("keeps the mode table free of metric-shaped fields", () => {
    const serialised = JSON.stringify(MISSION_MODES);
    for (const forbidden of ["value", "display", "confidence", "count", "percent"]) {
      expect(serialised).not.toContain(`"${forbidden}":`);
    }
  });

  it("contains no currency or percentage literals", () => {
    // Guards the exact failure the reference design invites: a lens
    // shipping a naira figure or a confidence percentage as config.
    const serialised = JSON.stringify(MISSION_MODES);
    expect(serialised).not.toMatch(/₦|\$\d|\d+(\.\d+)?%/);
  });
});
