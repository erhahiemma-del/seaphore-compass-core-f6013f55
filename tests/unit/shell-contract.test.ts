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
    expect(MISSION_CONTROL).toContain("<CommandSurfaceHost />");
    expect(MISSION_CONTROL).toContain("<OperationalOrientation");
    expect(MISSION_CONTROL).toContain("<FocusWorkspaceHost />");
  });
});
