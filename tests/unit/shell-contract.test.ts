/**
 * One shell, optional capabilities, environment-specific content.
 *
 * Not one shell per environment. Before Phase 5 there were three tiers:
 * a root that rendered no chrome, `AppShell`, and `IntelCentreShell`
 * wrapping `AppShell` with a second layout — so five environments could
 * not be light and could not opt out of a filter rail they did not use.
 * Meanwhile the command surface, the mission-mode lens, the focus rail
 * and the Copilot binding were mounted by Mission Control alone.
 *
 * These pin the shape that replaced it: one shell component, capabilities
 * that are off unless an environment asks, and no second shell.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const SHELL = "src/components/layout/AppShell.tsx";
const SOURCE = read(SHELL);

describe("there is one shell", () => {
  it("lives under its own name", () => {
    // It was called IntelligenceCentreShell.tsx while exporting AppShell
    // and serving every screen — a name that described one caller.
    expect(() => read(SHELL)).not.toThrow();
    expect(SOURCE).toContain("export function AppShell(");
  });

  it("leaves no file importing the old path", () => {
    const stale = sourceFiles()
      .filter((f) => f !== "tests/unit/shell-contract.test.ts")
      .filter((f) => read(f).includes("layout/IntelligenceCentreShell"));
    expect(stale).toEqual([]);
  });

  it("mounts the global chrome exactly once", () => {
    for (const part of ["<AppSidebar />", "<TopBar ", "<GoToPalette />", "<AppFooter />"]) {
      expect(SOURCE.split(part).length - 1).toBe(1);
    }
  });
});

describe("capabilities are opt-in", () => {
  it("declares the six slots", () => {
    for (const slot of ["commandSurface", "missionMode", "focus", "copilotContext", "chromeless"]) {
      expect(SOURCE).toContain(`readonly ${slot}?: boolean`);
    }
    // Content, not a boolean: there is nothing generic to render when an
    // environment has no actions.
    expect(SOURCE).toMatch(/pageActions\?: ReactNode/);
  });

  it("defaults every one of them off", () => {
    // A shell that turned capabilities on by itself would put controls in
    // front of officers that the environment cannot honour.
    for (const slot of ["commandSurface", "missionMode", "focus", "copilotContext", "chromeless"]) {
      expect(SOURCE).toContain(`${slot} = false`);
    }
  });

  it("renders each region only when asked", () => {
    expect(SOURCE).toMatch(/\{commandSurface && \(/);
    expect(SOURCE).toMatch(/\{missionMode && <ShellMissionMode \/>\}/);
    expect(SOURCE).toMatch(/\{focus && <ContextRail/);
    expect(SOURCE).toMatch(/\{copilotContext && <CopilotContextBinding \/>\}/);
  });

  it("omits the header strip entirely when nothing occupies it", () => {
    // An empty bordered strip reads as a control area that failed to
    // load, not one that was never requested.
    expect(SOURCE).toMatch(/\{\(missionMode \|\| pageActions\) && \(/);
  });

  it("keeps navigation out of chromeless", () => {
    // Chromeless drops the footer so a map can own the area. The sidebar
    // and top bar stay: navigation is not chrome.
    expect(SOURCE).toMatch(/\{!chromeless && <AppFooter \/>\}/);
    expect(SOURCE).not.toMatch(/!chromeless && <AppSidebar/);
    expect(SOURCE).not.toMatch(/!chromeless && <TopBar/);
  });
});

describe("capabilities reuse the existing singletons", () => {
  it("binds the mission-mode selector to the one mission-mode store", () => {
    // Not a second copy of the active mode held by the shell.
    expect(SOURCE).toContain("useMissionMode()");
    expect(SOURCE).not.toMatch(/useState<MissionModeId>/);
  });

  it("adds no store of its own", () => {
    expect(SOURCE).not.toMatch(/\bcreate\(/);
    expect(SOURCE).not.toMatch(/createContext/);
  });

  it("reuses the one focus rail, search surface and copilot binding", () => {
    expect(SOURCE).toContain('from "@/components/layout/ContextRail"');
    expect(SOURCE).toContain('from "@/features/command/CommandSurfaceHost"');
    expect(SOURCE).toContain('from "@/features/mission-control/useCopilotContextBinding"');
  });
});

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), d), { withFileTypes: true })) {
      const p = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) out.push(p);
    }
  };
  walk("src");
  walk("tests");
  return out;
}

describe("an environment never mounts a capability twice", () => {
  /*
   * The failure this prevents is two search boxes, or two lens
   * selectors, on one screen — one from the shell and one from the
   * environment that composed its own before the shell offered it.
   *
   * Mission Control is the case that matters: it keeps composing the
   * command surface and the lens itself, because it argues for their
   * placement, so it must NOT also switch those capabilities on. It
   * takes `copilotContext`, which renders nothing and is therefore the
   * same thing wherever it is mounted.
   */
  const MISSION_CONTROL = read("src/features/mission-control/MissionControl.tsx");

  it("has Mission Control declare only the invisible capability", () => {
    const declared = /capabilities=\{\{([^}]*)\}\}/.exec(MISSION_CONTROL)?.[1] ?? "";
    expect(declared).toContain("copilotContext: true");
    for (const visible of ["commandSurface", "missionMode", "focus", "chromeless"]) {
      expect(declared).not.toContain(visible);
    }
  });

  it("stops Mission Control calling the moved binding directly", () => {
    // Declared and called would bind twice, publishing the context on
    // every render of either.
    expect(MISSION_CONTROL).not.toContain("useCopilotContextBinding");
  });

  it("keeps the composition Mission Control argues for", () => {
    // The point of the migration was the binding, not a redesign.
    // Composed here rather than taken from the shell. The `showCues`
    // opt-out is a Mission-Control decision about a second chip row, not
    // a change of owner.
    expect(MISSION_CONTROL).toContain("<CommandSurfaceHost showCues={false} />");
    expect(MISSION_CONTROL).toContain("<OperationalOrientation");
    expect(MISSION_CONTROL).toContain("<FocusWorkspaceHost />");
  });
});

describe("capabilities are enabled where they mean something", () => {
  /*
   * `commandSurface` and `focus` are only useful together on these
   * screens. Selecting a search result is what establishes a focus
   * subject, so the rail has something to show; turning the rail on
   * alone would render nothing on a screen that never sets a subject,
   * and turning search on alone would establish focus with nowhere to
   * display it.
   *
   * `copilotContext` is deliberately absent from all of them.
   * `useCopilotContextBinding` infers context from the mission lens and
   * the focused subject, and its own docstring records why it is not
   * mounted globally: these surfaces know more about their case than it
   * could infer, and a broader binding would overwrite them.
   */
  const environments = [
    "src/features/detect/Detect.tsx",
    "src/features/memory/Memory.tsx",
    "src/features/investigate/InvestigateList.tsx",
    "src/features/decision-support/DecideList.tsx",
    "src/features/share/ShareList.tsx",
    // The screens an officer actually lands on: /investigate, /decide
    // and /share render these, not the list variants above.
    "src/features/investigate/InvestigateCase.tsx",
    "src/features/decision-support/DecideCase.tsx",
    "src/features/share/ShareCase.tsx",
    "src/features/compliance/Compliance.tsx",
    "src/features/evidence/EvidenceLibrary.tsx",
  ];

  it("pairs search with the rail that displays what it focuses", () => {
    for (const path of environments) {
      const declared = /capabilities=\{\{([^}]*)\}\}/.exec(read(path))?.[1] ?? "";
      expect(`${path}: ${declared}`).toContain("commandSurface: true");
      expect(`${path}: ${declared}`).toContain("focus: true");
    }
  });

  it("leaves the Copilot binding to the surfaces that know their own case", () => {
    for (const path of environments) {
      expect(`${path}: ${read(path)}`).not.toContain("copilotContext");
    }
  });

  it("mounts no capability the shell already provides", () => {
    // Declaring `commandSurface` and also rendering CommandSurfaceHost
    // would put two search boxes on one screen.
    for (const path of environments) {
      expect(`${path}: ${read(path)}`).not.toContain("<CommandSurfaceHost");
      expect(`${path}: ${read(path)}`).not.toContain("<ContextRail");
    }
  });
});

describe("the intelligence centres use a layout, not a second shell", () => {
  /*
   * `IntelCentreShell` wrapped `AppShell` and added a second layout on
   * top of it. That made it a competing shell: the five centres using it
   * could not be light, could not opt out of the filter rail, and
   * carried a centre header strip repeating the name the top bar was
   * already showing.
   */
  const LAYOUT = read("src/components/intel-centre/shell.tsx");
  const centres = [
    "src/features/cargo/Cargo.tsx",
    "src/features/manifest/Manifest.tsx",
    "src/features/ports/Ports.tsx",
    "src/features/revenue/Revenue.tsx",
    "src/features/vessel/Vessel.tsx",
  ];

  it("renders no shell of its own", () => {
    expect(LAYOUT).not.toContain("<AppShell");
    expect(LAYOUT).not.toContain("IntelCentreShell");
    expect(LAYOUT).toContain("export function IntelCentreLayout(");
  });

  it("takes no title, because the navigation model owns the name", () => {
    expect(LAYOUT).not.toMatch(/^\s*title: string;/m);
    expect(LAYOUT).not.toMatch(/^\s*subtitle: string;/m);
    // The strip that printed the name a second time, under the top bar.
    expect(LAYOUT).not.toContain("Centre header strip");
  });

  it("drops the controls that did nothing", () => {
    // Each rendered as an ordinary affordance and had no handler and no
    // state behind it. A control that does nothing teaches officers the
    // surface is decorative.
    expect(LAYOUT).not.toContain("Save Current View");
    expect(LAYOUT).not.toContain("View Full Audit Trail");
    expect(LAYOUT).not.toContain("export function FilterSearch");
    for (const path of centres) {
      expect(`${path}: ${read(path)}`).not.toContain("<FilterSearch");
    }
  });

  it("has each centre compose the layout inside the one shell", () => {
    for (const path of centres) {
      const source = read(path);
      expect(`${path}`).toBeTruthy();
      expect(source).toContain("<IntelCentreLayout");
      expect(source).toContain("<AppShell");
      // One shell per screen, not one per component.
      expect(source.split("<AppShell").length - 1).toBe(1);
    }
  });

  it("gives the centres the search and rail they already had subjects for", () => {
    // They set a focus subject through `useCentreFocus` and had no rail
    // to show it in, because the old layout did not render one.
    for (const path of centres) {
      const declared = /capabilities=\{\{([^}]*)\}\}/.exec(read(path))?.[1] ?? "";
      expect(`${path}: ${declared}`).toContain("focus: true");
      expect(`${path}: ${declared}`).toContain("commandSurface: true");
    }
  });
});

describe("Maritime Command keeps its map inside the shell", () => {
  /*
   * It was the one environment with no shell at all: it drew its own
   * full-viewport layout, so an officer there had no sidebar and no way
   * back except the browser.
   */
  const MARITIME = read("src/features/maritime/MaritimeCommand.tsx");
  const SHELL = read("src/components/layout/AppShell.tsx");

  it("adopts the shell chromelessly", () => {
    expect(MARITIME).toMatch(/capabilities=\{\{ chromeless: true \}\}/);
  });

  it("sizes against the shell, not the viewport", () => {
    /*
     * `h-dvh` on the content pinned it to the viewport, which inside the
     * shell overshoots by exactly the height of the top bar. Filling the
     * shell's flex area is the same fix expressed against the right
     * parent.
     */
    // Comments here still discuss `h-dvh` — the history is the point —
    // so this looks at class names rather than the file's prose.
    const classNames = MARITIME.match(/className="[^"]*"/g) ?? [];
    expect(classNames.filter((c) => c.includes("h-dvh"))).toEqual([]);
    expect(MARITIME).toContain("flex min-h-0 flex-1 flex-col overflow-hidden");
  });

  it("gives the chromeless column a definite height", () => {
    /*
     * The regression this catches: `min-h-screen` sets a *minimum*, so a
     * `flex-1` map resolves against nothing and grows to its own content
     * — observed as a 337x2298 canvas in a 1250px viewport, a tall narrow
     * sliver of ocean with the coastline off-frame.
     */
    expect(SHELL).toMatch(/chromeless \? "h-dvh overflow-hidden" : "min-h-screen"/);
    expect(SHELL).toMatch(/chromeless && "min-h-0 overflow-hidden"/);
  });

  it("stops naming the product where the shell names the screen", () => {
    // Its own header printed "Seaphore" beside the top bar that now
    // carries "Maritime Command" from the navigation model.
    expect(MARITIME).not.toMatch(/<h1[^>]*>\s*Seaphore\s*<\/h1>/);
  });

  it("keeps the controls that act on the map", () => {
    for (const control of ["<MapSearch", "<OperatingModeBar", "<CommandToolbar", "<MapCanvas"]) {
      expect(MARITIME).toContain(control);
    }
  });
});
