import { describe, it, expect } from "vitest";
import { NAV_GROUPS } from "@/lib/nav";

describe("navigation model", () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  it("declares the fixed group order", () => {
    /*
     * Regrouped in Phase 2, deliberately.
     *
     * NAV-1 is unchanged and still asserted below: the lifecycle order
     * is fixed, and Intelligence Lifecycle still sits directly beneath
     * Mission. What changed is the groups under it. "Intelligence
     * Centres" and "Command & Risk" grouped routes by implementation
     * history rather than by how an officer thinks, so vessels sat
     * beside knowledge graphs and the decision queue had no home.
     *
     * Every route those groups contained is still reachable — asserted
     * against the full previous list in navigation-ia.test.ts. This is a
     * reorganisation, not a removal.
     *
     * Screen Inventory & Navigation Map (Part 05) records the older
     * grouping and needs updating to match.
     */
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Mission",
      "Intelligence Lifecycle",
      "Workflows & Queues",
      "Maritime Operations",
      "Risk & Compliance",
      "Evidence & Knowledge",
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
