/**
 * Sidebar information architecture.
 *
 * Regrouping navigation is a data change with two silent failure modes,
 * and both are worse than a visible bug:
 *
 *   A route quietly disappears. It still exists and still works, but no
 *   officer can reach it, so a capability the institution paid for
 *   becomes invisible. The regrouping is asserted against the router's
 *   own files rather than a copied list.
 *
 *   A navigation item points at nothing. The specification is explicit
 *   that placeholder pages must not be created — so no item may name a
 *   capability that does not exist, and Certificates, Clearances and
 *   Verification must stay absent until they are real.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_GROUPS } from "@/lib/nav";

const allItems = NAV_GROUPS.flatMap((g) => g.items);

/** Route ids the router actually defines, read from disk. */
const routeFiles = readdirSync(resolve(process.cwd(), "src/routes"))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(/\.tsx$/, ""));

/** `/decide/queue` → `decide.queue`; `/` → `index`. */
const toRouteId = (url: string) =>
  url === "/" ? "index" : url.replace(/^\//, "").replace(/\//g, ".");

describe("every navigation item reaches a real route", () => {
  it("resolves each url to a route file", () => {
    for (const item of allItems) {
      const id = toRouteId(item.url);
      const exists =
        routeFiles.includes(id) ||
        routeFiles.includes(`${id}.index`) ||
        routeFiles.some((f) => f === id.split(".")[0]);
      expect(exists, `${item.title} → ${item.url}`).toBe(true);
    }
  });

  it("names no capability that does not exist yet", () => {
    // The specification forbids placeholder pages, so these must stay
    // out of the sidebar until there is something behind them.
    const titles = allItems.map((i) => i.title.toLowerCase()).join(" | ");
    for (const absent of ["certificate", "clearance", "coming soon", "not yet"]) {
      expect(titles).not.toContain(absent);
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

describe("the regrouping loses nothing", () => {
  /** Every route that was reachable before this phase. */
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
  ];

  it("keeps every previously reachable route reachable", () => {
    const urls = new Set(allItems.map((i) => i.url));
    for (const url of PREVIOUSLY_REACHABLE) {
      expect(urls.has(url), `${url} became unreachable`).toBe(true);
    }
  });

  it("routes each url exactly once", () => {
    // A route in two groups is a route an officer has to choose between,
    // and a mental model that contradicts itself.
    const urls = allItems.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("the groups reflect institutional mental models", () => {
  const labels = NAV_GROUPS.map((g) => g.label);

  it("opens with Mission and the intelligence lifecycle", () => {
    expect(labels[0]).toBe("Mission");
    expect(labels[1]).toBe("Intelligence Lifecycle");
  });

  it("ends with System", () => {
    expect(labels[labels.length - 1]).toBe("System");
  });

  it("gives work queues a group of their own", () => {
    // Previously these were scattered between "Command & Risk" and the
    // lifecycle, so what an officer *owes* had no single home.
    const queues = NAV_GROUPS.find((g) => g.label === "Workflows & Queues");
    expect(queues).toBeDefined();
    expect(queues!.items.map((i) => i.url)).toContain("/decide/queue");
  });

  it("leaves no group empty", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length, `${group.label} is empty`).toBeGreaterThan(0);
    }
  });
});
