/**
 * Mission Control composition contract.
 *
 * These are guardrails for a visual enhancement pass, not design tests.
 * They exist because the next change to this surface is expected to come
 * from a tool optimising for appearance, and the failures that matters
 * most are the ones that still *look* right:
 *
 *   A hard-coded "128 vessels" replacing an AWAITING_CREDENTIALS state.
 *   A second KPI list inlined because the real one renders as dashes.
 *   Progressive disclosure flattened back into four stacked cards.
 *   `sgs.setActiveLayers` called on mode change, quietly discarding the
 *   officer's map.
 *
 * None of those throw. All of them are visible only as a screenshot that
 * looks better than the truth.
 *
 * ## Why these read the source rather than render
 *
 * `MissionControl` needs a router, a query client and an auth session to
 * mount, so a render test here would assert more about the harness than
 * the contract. Reading the composition layer's own source catches the
 * specific regressions above directly, and stays silent about spacing,
 * colour, typography and layout — which the visual pass is entitled to
 * change freely.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), "src/features/mission-control");

/**
 * The Mission Control composition layer.
 *
 * `CommandCenter.tsx` shares this directory and is deliberately
 * excluded: it is a separate route with its own surface and its own
 * (currently fixture-backed) content. Scanning it here would make this
 * contract fail for reasons that have nothing to do with Mission
 * Control, and would tempt someone to weaken the honesty checks to get
 * green — which is the opposite of what they are for.
 */
const EXCLUDED = new Set(["CommandCenter.tsx"]);

const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .filter((f) => !EXCLUDED.has(f));

const sourceOf = (file: string) => readFileSync(resolve(DIR, file), "utf8");

const MISSION_CONTROL = sourceOf("MissionControl.tsx");

/**
 * Source with comments and Tailwind class strings removed.
 *
 * Both are full of digits — `gap-4`, `xl:col-span-3`, `opacity-[0.72]`,
 * and prose explaining why a threshold is what it is. Scanning them for
 * fabricated metrics would fail on styling and documentation, so they
 * come out before any literal check.
 */
function readableText(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/className=(?:"[^"]*"|\{[^}]*\})/g, " ")
    .replace(/data-testid="[^"]*"/g, " ")
    .replace(/import[\s\S]*?from\s+"[^"]+";/g, " ");
}

/* ═══════ 1. Every region survives ═══════ */

describe("all Mission Control regions remain composed", () => {
  /*
   * The approved Mission Control composition, in order.
   *
   * Intelligence Feed, Supporting Intelligence, the cargo strip,
   * Today's Priorities, Recent Briefings and Intelligence Readiness are
   * deliberately absent — each capability lives in the environment that
   * owns it, and a Mission Control that renders all of them is the
   * drifted composition this list exists to prevent returning.
   */
  const REQUIRED_REGIONS = [
    "OperationalOrientation",
    "RecommendedNextActionPanel",
    "MapRecommendationNotice",
    "MaritimePicturePanel",
    "PriorityQueuePanel",
    "MyWorkspacePanel",
    "DecisionsApprovalsPanel",
    "HandoffsBlockersPanel",
    "RecentWorkPanel",
    "IntelligenceEventsStrip",
  ] as const;

  /** Sections whose capability moved to a dedicated environment. */
  const EXCLUDED_REGIONS = [
    "IntelligenceFeedPanel",
    "SupportingIntelligence",
    "CargoWorkspaceStrip",
    "TodaysPrioritiesPanel",
    "RecentBriefingsPanel",
    "IntelligenceReadinessCard",
  ] as const;

  it("renders every required region", () => {
    for (const region of REQUIRED_REGIONS) {
      expect(MISSION_CONTROL, `${region} is no longer rendered`).toContain(`<${region}`);
    }
  });

  it("renders none of the sections that moved to their environments", () => {
    for (const region of EXCLUDED_REGIONS) {
      expect(MISSION_CONTROL, `${region} returned to Mission Control`).not.toContain(`<${region}`);
    }
  });

  it("puts the priority queue beside the map, not below the page", () => {
    // The queue and the map answer one question between them. The queue
    // used to sit far below as "Today's Priorities" while an
    // observations feed held this slot.
    const grid = MISSION_CONTROL.slice(
      MISSION_CONTROL.indexOf("<MaritimePicturePanel"),
      MISSION_CONTROL.indexOf("<MaritimePicturePanel") + 900,
    );
    expect(grid).toContain("<PriorityQueuePanel");
  });

  it("keeps the four workspace columns together", () => {
    const workspace = MISSION_CONTROL.slice(MISSION_CONTROL.indexOf("<MyWorkspacePanel"));
    for (const panel of ["DecisionsApprovalsPanel", "HandoffsBlockersPanel", "RecentWorkPanel"]) {
      expect(workspace.slice(0, 500), `${panel} left the workspace row`).toContain(panel);
    }
  });

  it("keeps the landmarks a visual pass must not remove", () => {
    // These are how the surface is verified at runtime. A redesign may
    // restyle them freely; deleting them removes the only handle on
    // whether the composition still works.
    const all = FILES.map(sourceOf).join("\n");
    for (const testid of [
      "operational-orientation",
      "recommended-next-action",
      "mission-mode-selector",
      "mission-kpi-ribbon",
      "panel-my-workspace",
      "panel-decisions-approvals",
      "panel-handoffs-blockers",
      "panel-recent-work",
      "map-recommendation",
    ]) {
      expect(all, `data-testid="${testid}" was removed`).toContain(`data-testid="${testid}"`);
    }
  });

  it("still binds the Copilot to real application context", () => {
    /*
     * The binding moved into the shell as an opt-in capability, so the
     * assertion follows what it is rather than where it lived. Mission
     * Control declares it; the shell mounts it. Asserting the hook name
     * in this file would now fail for a screen that is correctly bound,
     * and pass for one that imported the hook and never called it.
     */
    expect(MISSION_CONTROL).toMatch(/capabilities=\{\{[^}]*copilotContext:\s*true/);
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/layout/AppShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("useCopilotContextBinding()");
    expect(shell).toMatch(/\{copilotContext && <CopilotContextBinding \/>\}/);
  });
});

/* ═══════ 2. One source of truth per concern ═══════ */

describe("the composition layer introduces no parallel systems", () => {
  it("renders the shared KpiCoverageCard rather than a replacement", () => {
    // A visual pass tempted to restyle KPIs should wrap this, not
    // reimplement it — the card carries the state and root cause.
    expect(MISSION_CONTROL).toContain("KpiCoverageCard");
  });

  it("reads KPI rows from the shared configuration", () => {
    expect(MISSION_CONTROL).toContain("RIBBON_KPIS");
    // A literal array of KPI definitions inlined here would be a second
    // KPI system, whatever it was named.
    expect(readableText(MISSION_CONTROL)).not.toMatch(/const\s+\w*KPIS?\w*\s*[:=]\s*\[/);
  });

  it("declares exactly one store in the whole layer", () => {
    // useMissionMode owns the active lens. Anything else creating a
    // zustand store here is duplicating state that already exists.
    const creators = FILES.filter((f) => /\bcreate<|\bcreate\(/.test(sourceOf(f)));
    expect(creators).toEqual(["useMissionMode.ts"]);
  });

  it("reads focus from the shared store rather than tracking its own", () => {
    const all = FILES.map(sourceOf).join("\n");
    expect(all).toContain("useFocusSubjectStore");
    expect(readableText(all)).not.toMatch(/const\s*\[\s*focus\w*\s*,\s*set\w*Focus/i);
  });
});

/* ═══════ 3. Officer map precedence ═══════ */

describe("map layers stay under officer control", () => {
  it("writes active layers from exactly one place", () => {
    const writers = FILES.filter((f) => sourceOf(f).includes("setActiveLayers"));
    // Only the explicit "apply recommended view" interaction may write.
    expect(writers).toEqual(["MapRecommendationNotice.tsx"]);
  });

  it("never writes layers from the mode-change path", () => {
    for (const file of ["useMissionMode.ts", "modes.ts", "OperationalOrientation.tsx"]) {
      expect(sourceOf(file), `${file} must not write map layers`).not.toContain("setActiveLayers");
    }
  });

  it("keeps the recommendation dismissible and explicit", () => {
    const notice = sourceOf("MapRecommendationNotice.tsx");
    expect(notice).toContain("apply-recommended-view");
    expect(notice).toContain("dismiss-recommendation");
    // Additive, via the engine — not a wholesale replacement of the set.
    expect(notice).toContain("applyRecommendation");
  });
});

/* ═══════ 4. Progressive disclosure ═══════ */

describe("the lower workspace shows four columns, not a switcher", () => {
  /*
   * This block previously guarded progressive disclosure of the four
   * supporting-intelligence panels: one open, three a click away. Those
   * panels left Mission Control for the environments that own them, and
   * the four columns that replaced them are all visible at once because
   * they are short summaries rather than full panels — showing one and
   * hiding three would cost a click to learn a number.
   */
  const COLUMNS = [
    "MyWorkspacePanel",
    "DecisionsApprovalsPanel",
    "HandoffsBlockersPanel",
    "RecentWorkPanel",
  ] as const;

  it("renders each column exactly once", () => {
    // Twice would mean a row was duplicated rather than moved.
    for (const panel of COLUMNS) {
      const uses = MISSION_CONTROL.split(`<${panel}`).length - 1;
      expect(uses, `${panel} rendered ${uses} times`).toBe(1);
    }
  });

  it("keeps every column honest when it has nothing to show", () => {
    // An empty queue is a fact. A panel that vanishes when empty cannot
    // be distinguished from one that failed to load.
    const workspace = sourceOf("lower-workspace.tsx");
    expect(workspace).toContain('data-testid="workspace-empty-note"');
    // Rendered strings only — the file's own docstring discusses the
    // congratulatory phrasing it forbids, and would match itself.
    const rendered = readableText(workspace);
    expect(rendered).not.toMatch(/All clear|Nothing to do!|Great job/i);
  });

  it("derives every figure from the workspace store, inventing none", () => {
    const workspace = sourceOf("lower-workspace.tsx");
    expect(workspace).toContain("useWorkspaceStore");
    // No second store, and no fabricated deadline model.
    expect(workspace).not.toMatch(/\bcreate\(/);
    expect(workspace).not.toMatch(/Math\.random|faker|MOCK_/i);
  });
});

/* ═══════ 5. Data honesty ═══════ */

describe("the composition layer fabricates no intelligence", () => {
  const layerText = FILES.map((f) => readableText(sourceOf(f))).join("\n");

  it("contains no currency figure", () => {
    // The reference design shows "₦872.4M Revenue at Risk". No provider
    // supplies it, so it must not appear as a literal.
    expect(layerText).not.toMatch(/₦\s*[\d.]/);
    expect(layerText).not.toMatch(/\$\s*[\d.]+\s*[MBK]\b/);
  });

  it("contains no percentage literal", () => {
    // "87% Data Confidence" is the specific temptation. Coverage
    // percentages come from KpiCoverage at runtime, never from source.
    expect(layerText).not.toMatch(/["'`][^"'`]*\d+(\.\d+)?\s*%[^"'`]*["'`]/);
  });

  it("contains no hard-coded operational count", () => {
    // Guards strings like "128 vessels" or "24 investigations".
    expect(layerText).not.toMatch(
      /\d+\s+(vessels?|ports?|incidents?|investigations?|alerts?|arrivals?|departures?)\b/i,
    );
  });

  it("makes no claim that a provider is connected", () => {
    for (const claim of ["Live data", "Real-time feed", "All systems operational"]) {
      expect(layerText.toLowerCase()).not.toContain(claim.toLowerCase());
    }
  });

  it("makes no unsupported AI capability claim", () => {
    const copilot = readableText(sourceOf("useCopilotContextBinding.ts"));
    for (const claim of ["analysis complete", "i can ", "i have analysed", "fully connected"]) {
      expect(copilot.toLowerCase()).not.toContain(claim);
    }
  });
});

/* ═══════ 6. Modes stay dynamic ═══════ */

describe("mode-driven behaviour is not flattened", () => {
  it("orders KPIs through the mode engine", () => {
    /*
     * `orderPanels` was asserted against SupportingIntelligence, which
     * has left Mission Control. The ranking mechanism itself is
     * unchanged and still tested in `mission-hierarchy.test.ts`; what
     * this file guards is that the ribbon goes through it rather than
     * sorting KPIs by hand.
     */
    expect(MISSION_CONTROL).toContain("tierKpis");
    expect(MISSION_CONTROL).not.toMatch(/\.sort\(\s*\(\s*a\s*,\s*b\s*\)\s*=>[^)]*kpi/i);
  });

  it("keeps the selector wired to the mode store, not local state", () => {
    const orientation = sourceOf("OperationalOrientation.tsx");
    expect(orientation).toContain("useMissionMode");
    expect(orientation).toContain("MissionModeSelector");
  });

  it("derives the recommended action rather than hard-coding one", () => {
    expect(sourceOf("RecommendedNextActionPanel.tsx")).toContain("deriveRecommendedAction");
  });
});
