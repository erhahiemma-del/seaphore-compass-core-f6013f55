/**
 * The approved Mission Control composition.
 *
 * Mission Control drifted once already: an entity-type row appeared
 * above the lens, an observations feed took the slot beside the map, the
 * decisions queue sank to the bottom of the page as "Today's
 * Priorities", and four supporting panels, a cargo strip, a briefings
 * panel and a readiness card accumulated below. Every one of those was a
 * reasonable addition on its own, and together they buried the thing an
 * officer opens this page to see.
 *
 * These assertions pin the composition itself — order, membership and
 * the honesty of what fills it — so the next reasonable addition has to
 * argue with a test rather than simply land.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MISSION_MODES, MISSION_MODE_ORDER } from "@/features/mission-control/modes";
import { RIBBON_KPIS } from "@/lib/mission-control-data";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const MISSION_CONTROL = read("src/features/mission-control/MissionControl.tsx");
const SELECTOR = read("src/features/mission-control/MissionModeSelector.tsx");
const BANNER = read("src/features/mission-control/RecommendedNextActionPanel.tsx");
const WORKSPACE = read("src/features/mission-control/lower-workspace.tsx");

/* ═══════ 1. Section order ═══════ */

describe("the page is composed in the approved order", () => {
  it("places each section after the one before it", () => {
    /*
     * Order is the composition. Asserting membership alone would pass
     * for a page with the KPI ribbon above the map and the timeline in
     * the middle — which is a different product.
     */
    const order = [
      "<CommandSurfaceHost",
      "<OperationalOrientation",
      "<RecommendedNextActionPanel",
      "<MaritimePicturePanel",
      // The call site, not the `Ribbon` definition — that sits
      // below the composition and would compare definition order.
      "<Ribbon />",
      "<MyWorkspacePanel",
      "<IntelligenceEventsStrip",
    ];
    const positions = order.map((marker) => MISSION_CONTROL.indexOf(marker));
    for (const [index, position] of positions.entries()) {
      expect(position, `${order[index]} is not rendered`).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

/* ═══════ 2. Mission Mode ═══════ */

describe("eight lenses, named as approved", () => {
  it("lists exactly the eight approved labels in order", () => {
    expect(MISSION_MODE_ORDER.map((id) => MISSION_MODES[id].label)).toEqual([
      "National Overview",
      "Vessel Operations",
      "Revenue Assurance",
      "Risk & Compliance",
      "Investigation",
      "Port Intelligence",
      "Incident Response",
      "Executive Briefing",
    ]);
  });

  it("gives each lens a purpose that matches its label", () => {
    /*
     * The label and the behaviour have to agree. "Incident Response"
     * over a lens that leads with a decision queue is the drift this
     * catches — and it is the specific drift that happened, in the
     * other direction, before the approved composition settled it.
     */
    expect(MISSION_MODES["national-picture"].purpose).toMatch(/whole picture|across Nigerian/i);
    expect(MISSION_MODES["vessel-operations"].purpose).toMatch(/movement|voyage/i);
    expect(MISSION_MODES["revenue-assurance"].purpose).toMatch(/collected|leakage|revenue/i);
    expect(MISSION_MODES["risk-compliance"].purpose).toMatch(/risk|exception|requirement/i);
    expect(MISSION_MODES["investigation"].purpose).toMatch(/case|evidence/i);
    expect(MISSION_MODES["port-intelligence"].purpose).toMatch(/port|estate|approach/i);
    expect(MISSION_MODES["incident-response"].purpose).toMatch(/incident/i);
    expect(MISSION_MODES["executive-briefing"].purpose).toMatch(/leadership|summary/i);
  });

  it("marks the selected lens in Seaphore's sky blue", () => {
    /*
     * `--color-blue` (#2563EB), the same blue the command surface uses
     * for its primary action — not the teal accent, which reads as a
     * different kind of control, and not the white-chip-on-grey it was,
     * which at a glance read as the disabled one rather than the active
     * one.
     */
    expect(SELECTOR).toContain("bg-[color:var(--color-blue)] text-white");
    expect(SELECTOR).not.toContain("bg-[color:var(--ocean)]");
  });

  it("keeps the state in more than colour", () => {
    // A fill alone fails greyscale and colour-blindness.
    expect(SELECTOR).toContain("aria-selected={selected}");
  });

  it("holds no lens state of its own", () => {
    expect(SELECTOR).not.toMatch(/useState|\bcreate\(/);
  });
});

/* ═══════ 3. The six KPI cards ═══════ */

describe("six equal KPI cards", () => {
  it("names exactly the six approved measures, in order", () => {
    expect(RIBBON_KPIS.map((k) => k.title)).toEqual([
      "Revenue at Risk",
      "Manifest Exceptions",
      "Pending Assessments",
      "Vessels at Sea",
      "Ports Active",
      "Investigations",
    ]);
  });

  it("opens on the approved reading order", () => {
    /*
     * National Overview is the lens Mission Control opens on, so its
     * ordering is what an officer sees before choosing anything. The
     * other lenses still reorder — that is what a lens is for.
     */
    expect(MISSION_MODES["national-picture"].leadKpis).toEqual([
      "revenue",
      "manifest",
      "risk",
      "vessel",
      "container",
      "historical",
    ]);
  });

  it("gives every card the same width", () => {
    /*
     * The lead card used to span three columns and background cards were
     * dimmed. Comparing revenue exposure against manifest exceptions
     * then meant comparing two numbers drawn at different sizes, which
     * reads as a claim about importance the coverage model never made.
     */
    expect(MISSION_CONTROL).toContain("xl:grid-cols-6");
    expect(MISSION_CONTROL).not.toContain("xl:col-span-3");
    expect(MISSION_CONTROL).not.toMatch(/opacity-\[0\.72\]/);
  });

  it("still ranks them by lens, and records the ranking", () => {
    // Order is the honest way to express a lens; area is not.
    expect(MISSION_CONTROL).toContain("tierKpis");
    expect(MISSION_CONTROL).toContain("data-tier={tier}");
  });

  it("labels each card with the approved title, not the coverage taxonomy", () => {
    /*
     * Coverage names its domains "Vessel Intelligence", "Risk
     * Intelligence" and so on — the capability ribbon the approved
     * composition explicitly excludes. The card takes the measure, the
     * state and the root cause from coverage and the label from
     * `RIBBON_KPIS`, which has held the approved titles all along.
     */
    /*
     * The ribbon renders `MissionKpiCard`, which takes the approved
     * title as a prop. `KpiCoverageCard` — the provider-readiness card
     * that was rendering "Awaiting credentials" and "Coverage 33%" in
     * this row — is untouched and still used where it belongs.
     */
    expect(MISSION_CONTROL).toContain("<MissionKpiCard");
    expect(MISSION_CONTROL).toContain("title={kpi.title}");
    expect(MISSION_CONTROL).not.toContain("<KpiCoverageCard");
  });

  it("heads the map with the approved name", () => {
    expect(MISSION_CONTROL).toContain('title="National Maritime Picture"');
  });

  it("invents no value", () => {
    // Every metric ships as an em dash; coverage supplies the number.
    expect(RIBBON_KPIS.every((k) => k.metric === "—")).toBe(true);
  });
});

/* ═══════ 4. Next Best Action ═══════ */

describe("the next best action is a navy banner", () => {
  it("renders on the navy surface", () => {
    expect(BANNER).toContain("bg-[color:var(--color-navy)]");
  });

  it("carries all six approved regions", () => {
    for (const region of [
      "Next best action",
      "Why this matters",
      "Evidence summary",
      "Status",
      "Assigned to",
      "Due in",
    ]) {
      expect(BANNER, `${region} region missing`).toContain(region);
    }
  });

  it("reports the four regions the model cannot answer", () => {
    /*
     * Impact, evidence counts, owner and deadline have no source:
     * `deriveRecommendedAction` reads coverage state, and there is no
     * assignment model and no SLA clock. They are rendered as absent so
     * the composition is ready when the data exists and the gap is
     * visible in the product rather than only in a backlog.
     */
    expect(BANNER).toContain('const UNAVAILABLE = "—"');
    expect(BANNER).toContain("impact not quantified");
    expect(BANNER).toContain("Unassigned");
  });

  it("fabricates no figure, owner or deadline", () => {
    // A naira value or a countdown here is the kind of number an officer
    // would plan a shift around.
    expect(BANNER).not.toMatch(/₦[\d,.]+/);
    expect(BANNER).not.toMatch(/\b\d+h\s*\d*m\b/);
    expect(BANNER).not.toMatch(/\b\d+\s+(Records|Sources|Conflicts)\b/);
  });

  it("carries urgency in words as well as colour", () => {
    // The badge and the Status column both say it, so the distinction
    // survives greyscale and colour-blindness.
    expect(BANNER).toContain("Verification Required");
    expect(BANNER).toContain("action-priority-badge");
  });

  it("keeps the Evidence Summary whole at zero", () => {
    /*
     * Three counts, a verification state, a bar and a percentage — all
     * rendered at zero rather than collapsed. An officer scanning for
     * verification progress must find the bar in the same place whether
     * it is empty or full; a bar that disappears when empty cannot be
     * told apart from one that failed to render.
     */
    expect(BANNER).toContain("<EvidenceSummary records={0} sources={0} conflicts={0}");
    expect(BANNER).toContain('data-testid="evidence-progress"');
    expect(BANNER).toContain('data-testid="evidence-percent"');
    expect(BANNER).toContain('role="progressbar"');
    // The counts are counts, not em dashes: none is a number.
    expect(BANNER).toContain("{value}");
  });

  it("uses the approved semantic colours", () => {
    expect(BANNER).toContain('oxblood: "#992D2D"');
    expect(BANNER).toContain('critical: "#DC3545"');
    expect(BANNER).toContain('attention: "#F59E0B"');
    expect(BANNER).toContain('information: "#2563EB"');
    expect(BANNER).toContain('track: "#425269"');
  });
});

/* ═══════ 5. The lower workspace ═══════ */

describe("four workspace columns, honestly filled", () => {
  it("renders all four", () => {
    for (const panel of [
      "panel-my-workspace",
      "panel-decisions-approvals",
      "panel-handoffs-blockers",
      "panel-recent-work",
    ]) {
      expect(WORKSPACE, `${panel} missing`).toContain(panel);
    }
  });

  it("reads the existing workspace store and adds none", () => {
    expect(WORKSPACE).toContain("useWorkspaceStore");
    expect(WORKSPACE).not.toMatch(/\bcreate\(/);
  });

  it("derives the stage ratio from real tasks, or omits it", () => {
    /*
     * The reference shows "Stage 4/7". Completed-over-total is a real
     * ratio; a case with no tasks has no stage, and gets none rather
     * than a plausible-looking fraction.
     */
    expect(WORKSPACE).toContain('t.status === "COMPLETED"');
    expect(WORKSPACE).toContain("if (total === 0) return null");
  });

  it("ships no SLA column", () => {
    /*
     * The reference's "2h" has no source: there is no deadline model in
     * this application. Rendered strings only — the file's own docstring
     * explains that absence and would otherwise match itself.
     */
    const rendered = WORKSPACE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(rendered).not.toMatch(/\bdue in\b/i);
    expect(rendered).not.toMatch(/\bSLA\b/);
  });

  it("states an empty queue rather than celebrating it", () => {
    expect(WORKSPACE).toContain('data-testid="workspace-empty-note"');
  });
});

/* ═══════ 6. What left ═══════ */

describe("the drifted sections do not return", () => {
  it("renders no entity-type row above the lens", () => {
    /*
     * "National activity · ports · vessels" and its suggestion chips sat
     * directly above the Mission Mode selector — a second vocabulary for
     * the same surface. Two rows of chips one above the other teach an
     * officer that neither is the real control, which is why the
     * previous command bar's eight chips were removed.
     *
     * Suppressed here, not deleted: on every other environment there is
     * no lens selector beneath them and the cues are the only thing
     * saying what search will favour.
     */
    expect(MISSION_CONTROL).toContain("<CommandSurfaceHost showCues={false} />");
  });

  it("renders none of them", () => {
    for (const section of [
      "IntelligenceFeedPanel",
      "SupportingIntelligence",
      "CargoWorkspaceStrip",
      "TodaysPrioritiesPanel",
      "RecentBriefingsPanel",
      "IntelligenceReadinessCard",
    ]) {
      expect(MISSION_CONTROL, `${section} returned`).not.toContain(`<${section}`);
    }
  });

  it("keeps every destination environment that received one", () => {
    /*
     * Removed from Mission Control, not deleted. Each capability has an
     * environment that owns it, and this fails if one of those routes
     * disappears — which would turn a move into a loss.
     */
    for (const route of [
      "src/routes/detect.tsx",
      "src/routes/revenue.tsx",
      "src/routes/manifest.tsx",
      "src/routes/compliance.tsx",
      "src/routes/ports.tsx",
      "src/routes/memory.tsx",
      "src/routes/data-sources.tsx",
    ]) {
      expect(() => read(route), `${route} is gone`).not.toThrow();
    }
  });

  it("reuses the projections rather than recomputing them", () => {
    // The queue and the timeline take the projections Mission Control
    // already computed. A second projection would be a second answer.
    expect(MISSION_CONTROL).toContain("projection={prioritiesProjection}");
    expect(MISSION_CONTROL).toContain("projection={feedProjection}");
  });
});

/* ═══════ 7. The composition cannot regress ═══════ */

describe("Mission Control renders the approved composition and nothing else", () => {
  /*
   * This block exists because the composition appeared to regress once,
   * and the cause turned out to be absence rather than reintroduction:
   * the approved KPI work sat on a branch that a later branch was not
   * built from, so the page rendered provider-readiness cards again. No
   * commit brought the legacy sections back — one simply never carried
   * the fix forward.
   *
   * Membership assertions catch that. A section is either in the render
   * path or it is not, whatever route the code took to get there.
   */
  const PRESENT = [
    "CommandSurfaceHost",
    "OperationalOrientation",
    "RecommendedNextActionPanel",
    "MaritimePicturePanel",
    "PriorityQueuePanel",
    "MissionKpiCard",
    "MyWorkspacePanel",
    "DecisionsApprovalsPanel",
    "HandoffsBlockersPanel",
    "RecentWorkPanel",
    "IntelligenceEventsStrip",
  ] as const;

  /** Removed from this page. Every one still lives somewhere else. */
  const ABSENT = [
    "IntelligenceReadinessCard",
    "IntelligenceFeedPanel",
    "SupportingIntelligence",
    "CargoWorkspaceStrip",
    "TodaysPrioritiesPanel",
    "RecentBriefingsPanel",
    "ConfidenceLegend",
    "KpiCoverageCard",
  ] as const;

  it("renders every approved section", () => {
    for (const section of PRESENT) {
      expect(MISSION_CONTROL, `${section} is missing`).toContain(`<${section}`);
    }
  });

  it("renders no excluded section", () => {
    for (const section of ABSENT) {
      expect(MISSION_CONTROL, `${section} is rendering again`).not.toContain(`<${section}`);
    }
  });

  it("imports no excluded section either", () => {
    // An unused import is how a removed section finds its way back.
    const importLines = MISSION_CONTROL.split("\n").filter((line) => line.startsWith("import "));
    for (const section of ABSENT) {
      const offenders = importLines.filter((line) => line.includes(section));
      expect(offenders, `${section} is still imported`).toEqual([]);
    }
  });

  it("shows no provider-readiness diagnostics", () => {
    /*
     * Mission Control answers "what is happening"; Data Sources and
     * Provider Health answer "why is a feed quiet". Those are different
     * questions for different moments, and the six cards were answering
     * the second one six times over.
     */
    // Comments here discuss the phrases they forbid, so this reads the
    // code only — otherwise the guard matches its own explanation.
    const rendered = MISSION_CONTROL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const phrase of ["Waiting for Credentials", "PROVIDER OFFLINE", "Coverage details"]) {
      expect(rendered, `"${phrase}" is rendered here`).not.toContain(phrase);
    }
    expect(rendered).not.toMatch(/Coverage \{|coveragePct/);
  });

  it("keeps a home for everything it stopped rendering", () => {
    /*
     * Removed from the composition, not from the application. This fails
     * if a destination environment disappears, which would turn a move
     * into a loss.
     */
    const homes: Readonly<Record<string, string>> = {
      IntelligenceFeedPanel: "src/routes/detect.tsx",
      ConfidenceLegend: "src/features/detect/Detect.tsx",
      IntelligenceReadinessCard: "src/routes/data-sources.tsx",
      CargoWorkspaceStrip: "src/routes/manifest.tsx",
      RecentBriefingsPanel: "src/routes/briefing-centre.tsx",
      SupportingIntelligence: "src/routes/compliance.tsx",
    };
    for (const [section, home] of Object.entries(homes)) {
      expect(() => read(home), `${section} has no home at ${home}`).not.toThrow();
    }
    // The provider-readiness card itself must still exist, unchanged.
    expect(() => read("src/components/intelligence/KpiCoverageCard.tsx")).not.toThrow();
  });

  it("uses the approved KPI card, and only that", () => {
    // One card component in the ribbon. Two would let the fork that
    // rendered diagnostics grow back beside the one that does not.
    expect(MISSION_CONTROL.split("<MissionKpiCard").length - 1).toBe(1);
  });
});
