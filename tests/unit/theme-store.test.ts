// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "@/stores/theme.store";

describe("theme store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useThemeStore.setState({ theme: "light" });
  });

  it("defaults to light", () => {
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("toggles between light and dark", () => {
    const { toggleTheme } = useThemeStore.getState();
    toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
    toggleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("setTheme applies value", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("persists selection to localStorage", async () => {
    useThemeStore.getState().setTheme("dark");
    // zustand persist writes synchronously in this middleware version
    const stored = window.localStorage.getItem("seaphore.theme");
    expect(stored).toBeTruthy();
    expect(stored).toContain("dark");
  });
});
