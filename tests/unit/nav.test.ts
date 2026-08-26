import { describe, it, expect } from "vitest";
import { NAV_GROUPS } from "@/lib/nav";

describe("navigation model", () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  it("declares the fixed group order", () => {
    /*
     * Six environments, consolidated deliberately.
     *
     * NAV-1 is unchanged and still asserted below: the lifecycle order is
     * fixed, and Intelligence Lifecycle still sits directly beneath
     * Mission. What changed is everything under it. "Workflows & Queues"
     * and "Evidence & Knowledge" still grouped routes by implementation
     * shape rather than by how an officer works, and eleven entries were
     * really sub-surfaces of a larger environment.
     *
     * Every route those groups contained still exists and is still
     * reachable — asserted route-by-route in navigation-ia.test.ts, which
     * now also requires each consolidated route to declare the
     * environment that owns it. This is a consolidation, not a removal.
     *
     * Screen Inventory & Navigation Map (Part 05) records the older
     * grouping and needs updating to match.
     */
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Mission",
      "Intelligence Lifecycle",
      "Maritime Operations",
      "Intelligence & Evidence",
      "Risk & Compliance",
      "System",
    ]);
  });

  it("includes the five lifecycle stages in order", () => {
    /*
     * Detect → Understand → Investigate → Decide & Coordinate → Memory.
     *
     * `/share` is no longer a stage of its own: sharing is part of
     * deciding and coordinating, and it now sits behind that environment
     * (see CONSOLIDATED_ROUTES). `/ownership` became Understand, which is
     * what building entity context actually is.
     */
    const lifecycle = NAV_GROUPS.find((g) => g.label === "Intelligence Lifecycle")!;
    expect(lifecycle.items.map((i) => i.url)).toEqual([
      "/detect",
      "/ownership",
      "/investigate",
      "/decide",
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
