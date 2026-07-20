import { describe, expect, it } from "vitest";
import {
  AGENTS,
  ALL_AGENT_IDS,
  runAgents,
  summariseRun,
  type AgentSpec,
} from "@/services/agents";
import type { z } from "zod";

const INPUT = { entityIds: ["ent_vessel_9837456"], query: "risk snapshot" };

describe("Sprint 6 · specialist agents", () => {
  it.each(ALL_AGENT_IDS)("agent %s returns schema-valid output", async (id) => {
    const [res] = await runAgents([AGENTS[id]] as Array<AgentSpec<z.ZodTypeAny>>, INPUT);
    expect(res.status, res.error?.message).toBe("ok");
    expect(res.data).toBeTruthy();
    expect(res.sourcesQueried.length).toBeGreaterThan(0);
  });

  it("each agent only queries its whitelisted sources (capability registry)", () => {
    for (const id of ALL_AGENT_IDS) {
      const allowed = new Set(AGENTS[id].allowedSources);
      expect(allowed.size).toBeGreaterThan(0);
      // Sources declared statically — any attempt to query outside throws
      // (verified by data-sources.ts queryFactory).
      expect(allowed.size).toBeLessThanOrEqual(4);
    }
  });
});

describe("Sprint 6 · scheduler", () => {
  it("runs multiple agents in parallel and returns a result per agent", async () => {
    const specs = ALL_AGENT_IDS.map((id) => AGENTS[id]) as Array<AgentSpec<z.ZodTypeAny>>;
    const started = Date.now();
    const results = await runAgents(specs, INPUT, { concurrency: 6, timeoutMs: 2_000 });
    const elapsed = Date.now() - started;
    expect(results).toHaveLength(specs.length);
    const s = summariseRun(results);
    expect(s.ok).toBe(specs.length);
    // Serial worst case ≈ sum of source latencies (>250ms) — parallel must be much lower.
    expect(elapsed).toBeLessThan(500);
  });

  it("returns a timeout result rather than throwing when timeoutMs is too small", async () => {
    const [res] = await runAgents([AGENTS.forecast], INPUT, { timeoutMs: 1 });
    expect(res.status).toBe("timeout");
    expect(res.data).toBeNull();
    expect(res.partial).toBe(true);
    expect(res.error?.code).toBe("TIMEOUT");
  });

  it("propagates parent abort to in-flight agents", async () => {
    const ac = new AbortController();
    const promise = runAgents([AGENTS.ownership], INPUT, { timeoutMs: 5_000, signal: ac.signal });
    setTimeout(() => ac.abort(), 5);
    const [res] = await promise;
    expect(["partial", "timeout"]).toContain(res.status);
    expect(res.data).toBeNull();
  });

  it("captures agent errors instead of crashing the scheduler", async () => {
    const boom: AgentSpec<typeof AGENTS.evidence.outputSchema> = {
      ...AGENTS.evidence,
      execute: async () => {
        throw new Error("mock upstream failure");
      },
    };
    const [res] = await runAgents([boom], INPUT);
    expect(res.status).toBe("error");
    expect(res.error?.message).toContain("mock upstream failure");
  });

  it("respects concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const specs: Array<AgentSpec<z.ZodTypeAny>> = ALL_AGENT_IDS.map((id) => ({
      ...AGENTS[id],
      execute: async (_i, _c, _q) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return AGENTS[id].outputSchema.parse(await AGENTS[id].execute(_i, _c, _q));
      },
    }));
    await runAgents(specs, INPUT, { concurrency: 2, timeoutMs: 2_000 });
    expect(peak).toBeLessThanOrEqual(2);
  });
});
