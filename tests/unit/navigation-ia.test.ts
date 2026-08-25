/**
 * Sidebar information architecture.
 *
 * Regrouping navigation is a data change with three silent failure modes,
 * and all three are worse than a visible bug:
 *
 *   A route quietly disappears. It still exists and still works, but no
 *   officer can reach it, so a capability the institution paid for
 *   becomes invisible.
 *
 *   A navigation item points at nothing. Placeholder pages must not be
 *   created, so no item may name a capability that does not exist.
 *
 *   A consolidation loses its trail. When an entry is folded into a
 *   parent environment, "it moved" has to be checkable rather than
 *   asserted in a commit message.
 *
 * ## Why "reachable" changed meaning here
 *
 * This file previously required every previously-listed route to appear
 * *in the sidebar*. Consolidation makes that the wrong test: eleven
 * routes deliberately lost their own entry and now live behind the
 * environment that owns them. The rule is therefore stricter in the way
 * that matters — a route may leave the sidebar only if it is still a real
 * route AND declares which environment owns it, and that owner must
 * itself be reachable.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CONSOLIDATED_ROUTES, NAV_GROUPS, reachableRoutes } from "@/lib/nav";

const allItems = NAV_GROUPS.flatMap((g) => g.items);
const sidebarUrls = new Set(allItems.map((i) => i.url));

/** Route ids the router actually defines, read from disk. */
const routeFiles = readdirSync(resolve(process.cwd(), "src/routes"))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(/\.tsx$/, ""));

/** `/decide/queue` → `decide.queue`; `/` → `index`. */
const toRouteId = (url: string) =>
  url === "/" ? "index" : url.replace(/^\//, "").replace(/\//g, ".");

const routeExists = (url: string) => {
  const id = toRouteId(url);
  return (
    routeFiles.includes(id) ||
    routeFiles.includes(`${id}.index`) ||
    routeFiles.some((f) => f === id.split(".")[0])
  );
};

describe("every navigation item reaches a real route", () => {
  it("resolves each url to a route file", () => {
    for (const item of allItems) {
      expect(routeExists(item.url), `${item.title} → ${item.url}`).toBe(true);
    }
  });

  it("names no capability that does not exist yet", () => {
    /*
     * The target model names Assess, Verification & Inspection, Clearance
     * & Approvals, Enforcement Cases and Settings. None has a route — the
     * concepts live inside Compliance, DecideCase, Ports, Vessel and
     * investigations-workflow — so they stay out until they are real.
     * An entry that lands somewhere other than its label is worse than an
     * absent one.
     */
    const titles = allItems.map((i) => i.title.toLowerCase()).join(" | ");
    for (const absent of [
      "certificate",
      "clearance",
      "verification",
      "inspection",
      "enforcement",
      "assess",
      "coming soon",
      "not yet",
    ]) {
      expect(titles, `"${absent}" has no environment behind it`).not.toContain(absent);
    }
  });

  it("gives every item a title, a url and an icon", () => {
    for (const item of allItems) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.startsWith("/")).toBe(true);
      expect(item.icon).toBeTruthy();
    }
  });
});

describe("the consolidation loses nothing", () => {
  /**
   * Every route reachable from the sidebar before this phase.
   *
   * Each must still be reachable — as its own entry, or behind the
   * environment that absorbed it.
   */
  const PREVIOUSLY_REACHABLE = [
    "/",
    "/maritime",
    "/command-center",
    "/copilot",
    "/detect",
    "/investigate",
    "/decide",
    "/share",
    "/memory",
    "/manifest",
    "/cargo",
    "/cargo-workspace",
    "/revenue",
    "/vessel",
    "/ports",
    "/ownership",
    "/compliance",
    "/evidence",
    "/intelligence-evidence",
    "/knowledge-graph",
    "/predictions",
    "/operational-knowledge",
    "/alerts",
    "/missions",
    "/investigations-workflow",
    "/investigations",
    "/briefing-centre",
    "/revenue-leakage",
    "/national-risk",
    "/data-sources",
    "/admin",
    "/decide/queue",
    "/share/queue",
  ];

  it("keeps every previously reachable route reachable", () => {
    const reachable = new Set(reachableRoutes());
    for (const url of PREVIOUSLY_REACHABLE) {
      expect(reachable.has(url), `${url} became unreachable`).toBe(true);
    }
  });

  it("keeps the route itself alive for everything consolidated", () => {
    // Consolidation is a navigation change. Deleting the route would be a
    // capability change, and is not what this phase does.
    for (const url of Object.keys(CONSOLIDATED_ROUTES)) {
      expect(routeExists(url), `${url} was consolidated but no longer exists`).toBe(true);
    }
  });

  it("gives every consolidated route an owner that is itself in the sidebar", () => {
    // An owner that is not reachable would just move the dead end.
    for (const [url, owner] of Object.entries(CONSOLIDATED_ROUTES)) {
      expect(
        sidebarUrls.has(owner),
        `${url} is owned by ${owner}, which is not in the sidebar`,
      ).toBe(true);
    }
  });

  it("never lists a consolidated route in the sidebar as well", () => {
    // Exposed twice is the duplication the consolidation exists to remove.
    for (const url of Object.keys(CONSOLIDATED_ROUTES)) {
      expect(sidebarUrls.has(url), `${url} is both consolidated and listed`).toBe(false);
    }
  });

  it("routes each url exactly once", () => {
    // A route in two groups is a route an officer has to choose between,
    // and a mental model that contradicts itself.
    const urls = allItems.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("surfaces capabilities that had no entry before", () => {
    // Three real environments existed with no way to reach them.
    for (const url of ["/workspace", "/observability", "/admin/connectors"]) {
      expect(sidebarUrls.has(url), `${url} should now be reachable`).toBe(true);
    }
  });
});

describe("the groups are an operating model", () => {
  const labels = NAV_GROUPS.map((g) => g.label);

  it("declares exactly the six environments, in order", () => {
    expect(labels).toEqual([
      "Mission",
      "Intelligence Lifecycle",
      "Maritime Operations",
      "Intelligence & Evidence",
      "Risk & Compliance",
      "System",
    ]);
  });

  it("retires the groups that named implementation history", () => {
    for (const retired of ["Intelligence Centres", "Command & Risk", "Workflows & Queues"]) {
      expect(labels).not.toContain(retired);
    }
  });

  it("keeps the three mission environments distinct", () => {
    // Mission Control asks what matters nationally, Maritime Command what
    // is happening operationally, Command Center what needs coordinated
    // action. Merging any two loses a question nobody else asks.
    const mission = NAV_GROUPS.find((g) => g.label === "Mission")!;
    const urls = mission.items.map((i) => i.url);
    expect(urls).toContain("/");
    expect(urls).toContain("/maritime");
    expect(urls).toContain("/command-center");
  });

  it("leaves no group empty", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length, `${group.label} is empty`).toBeGreaterThan(0);
    }
  });
});
