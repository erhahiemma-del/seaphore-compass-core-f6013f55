// @vitest-environment jsdom
/**
 * One writer of `.dark`.
 *
 * `AppShell` used to write the class from its `mode` prop while
 * `ThemeProvider` wrote it from the stored preference. Two writers of one
 * class race on effect order; the shell ran second and won. The visible
 * consequences were that the theme toggle did nothing on every screen
 * declaring a mode, and that the shell's unmount cleanup removed `.dark`
 * — so navigating away from a dark screen silently reset an officer who
 * had chosen dark.
 *
 * These pin the ownership rule and the resolution order that replaced it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { resolveTheme, useThemeStore } from "@/stores/theme.store";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const SHELL = "src/components/layout/IntelligenceCentreShell.tsx";
const PROVIDER = "src/components/theme/ThemeProvider.tsx";

describe("only ThemeProvider writes the dark class", () => {
  it("has exactly one writer in the whole source tree", () => {
    // Source-level because the defect was two components each behaving
    // correctly in isolation. Only counting the writers catches it.
    const writers = ["src/components", "src/stores", "src/features", "src/routes", "src/lib"]
      .flatMap((dir) => filesUnder(dir))
      .filter((file) => /classList\.(add|remove|toggle)\(\s*"dark"/.test(read(file)));
    expect(writers).toEqual([PROVIDER]);
  });

  it("writes at the document, where portals can see it", () => {
    // A class on a shell wrapper cannot reach the popovers and dialogs
    // shadcn renders through portals outside that wrapper.
    expect(read(PROVIDER)).toContain("document.documentElement");
  });

  it("no longer removes the class on unmount", () => {
    // The cleanup that wiped a chosen preference on navigation.
    expect(read(SHELL)).not.toMatch(/classList\.remove/);
  });

  it("keeps the shell from scoping a dark class to its own subtree", () => {
    // The other half of the same mistake: styling the tree but not the
    // portals, so a dark screen showed light popovers.
    expect(read(SHELL)).not.toMatch(/mode === "dark" && "dark"/);
  });

  it("has the shell declare its tone instead", () => {
    expect(read(SHELL)).toContain("setEnvironmentDefault(mode)");
  });
});

describe("environment tone yields to the officer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useThemeStore.setState({ theme: "light", preferenceSet: false, environmentDefault: "light" });
  });

  it("shows the environment's tone before anyone has chosen", () => {
    useThemeStore.getState().setEnvironmentDefault("dark");
    expect(resolveTheme(useThemeStore.getState())).toBe("dark");
  });

  it("lets the officer override a dark environment", () => {
    // The behaviour that was impossible before: the toggle had no effect
    // on any screen that declared a mode.
    useThemeStore.getState().setEnvironmentDefault("dark");
    useThemeStore.getState().setTheme("light");
    expect(resolveTheme(useThemeStore.getState())).toBe("light");
  });

  it("keeps that choice when the environment changes", () => {
    useThemeStore.getState().setEnvironmentDefault("dark");
    useThemeStore.getState().toggleTheme(); // -> light, explicitly
    useThemeStore.getState().setEnvironmentDefault("light");
    useThemeStore.getState().setEnvironmentDefault("dark");
    expect(resolveTheme(useThemeStore.getState())).toBe("light");
  });

  it("toggles from what is on screen, not from the unset preference", () => {
    // On a dark environment nobody has overridden, the stored preference
    // still reads "light". Toggling from that would appear to do nothing.
    useThemeStore.getState().setEnvironmentDefault("dark");
    useThemeStore.getState().toggleTheme();
    expect(resolveTheme(useThemeStore.getState())).toBe("light");
  });

  it("does not persist the environment tone", () => {
    // It belongs to whichever screen is mounted; persisting it would let
    // the last screen visited decide how the next session opens.
    useThemeStore.getState().setEnvironmentDefault("dark");
    expect(window.localStorage.getItem("seaphore.theme") ?? "").not.toContain("environmentDefault");
  });
});

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), d), { withFileTypes: true })) {
      const p = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}
