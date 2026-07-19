import { describe, it, expect, beforeEach } from "vitest";
import {
  startTrace,
  traceSync,
  subscribe,
  subscribeAlerts,
  getRecentAlerts,
  clearTraces,
  summarize,
} from "@/lib/perf/monitor";

describe("perf monitor", () => {
  beforeEach(() => clearTraces());

  it("records a trace with duration", () => {
    const end = startTrace("feed.render");
    end();
    const s = summarize();
    expect(s["feed.render"].count).toBe(1);
    expect(s["feed.render"].max).toBeGreaterThanOrEqual(0);
  });

  it("fires alerts only when duration exceeds the budget", async () => {
    const alerts: string[] = [];
    const unsub = subscribeAlerts((t) => alerts.push(t.name));

    // Fast trace — inside every budget.
    traceSync("pan.frame", () => 1);

    // Slow trace — synthesize by advancing perf.now via busy wait.
    const end = startTrace("pan.frame");
    const t0 = performance.now();
    while (performance.now() - t0 < 30) {
      /* burn ~30ms > 16ms budget */
    }
    end();

    unsub();
    expect(alerts).toContain("pan.frame");
    expect(getRecentAlerts().some((a) => a.name === "pan.frame")).toBe(true);
  });

  it("broadcasts every trace to subscribers", () => {
    const names: string[] = [];
    const unsub = subscribe((t) => names.push(t.name));
    traceSync("feed.render", () => {});
    traceSync("zoom.step", () => {});
    unsub();
    expect(names).toEqual(["feed.render", "zoom.step"]);
  });

  it("ignores unknown trace names (no budget => never overBudget)", () => {
    const end = startTrace("some.custom.trace");
    const trace = end();
    expect(trace.overBudget).toBe(false);
    expect(trace.budgetMs).toBeUndefined();
  });
});
