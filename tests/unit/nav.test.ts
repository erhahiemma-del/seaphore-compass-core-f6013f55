import { describe, it, expect } from "vitest";
import { NAV_GROUPS } from "@/lib/nav";

describe("navigation model", () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  it("declares the fixed group order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Mission",
      "Intelligence Lifecycle",
      "Intelligence Centres",
      "Command & Risk",
      "System",
    ]);
  });

  it("includes the five lifecycle workspaces", () => {
    const lifecycle = NAV_GROUPS.find((g) => g.label === "Intelligence Lifecycle")!;
    expect(lifecycle.items.map((i) => i.url)).toEqual([
      "/detect",
      "/investigate",
      "/decide",
      "/share",
      "/memory",
    ]);
  });

  it("every item has a unique, absolute route", () => {
    const urls = allItems.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u.startsWith("/")).toBe(true);
  });

  it("every item has an icon and title", () => {
    for (const item of allItems) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.icon).toBeDefined();
    }
  });
});
