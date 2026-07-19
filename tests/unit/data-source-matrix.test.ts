/**
 * Contract tests: the Data Source Matrix must enforce status semantics —
 * PLANNED and NOT_IN_SCOPE sources cannot silently return fabricated data.
 */
import { describe, expect, it } from "vitest";
import { DATA_SOURCE_MATRIX } from "@/adapters/matrix";
import { getAdapter, listAdapters } from "@/adapters/matrix-registry";
import { OutOfScopeSourceError, PlannedSourceError } from "@/adapters/status";

describe("Data Source Matrix", () => {
  it("registers exactly the 17 rows defined in Part H v1.0", () => {
    expect(DATA_SOURCE_MATRIX).toHaveLength(17);
  });

  it("has an adapter for every matrix id", () => {
    for (const entry of DATA_SOURCE_MATRIX) {
      expect(() => getAdapter(entry.id)).not.toThrow();
    }
  });

  it("PLANNED sources throw PlannedSourceError instead of fabricating data", async () => {
    const planned = DATA_SOURCE_MATRIX.filter((e) => e.status === "PLANNED");
    expect(planned.length).toBeGreaterThan(0);
    for (const entry of planned) {
      const adapter = getAdapter(entry.id) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const method =
        adapter.getLatestPosition ||
        adapter.spot ||
        adapter.lookup ||
        adapter.observe;
      expect(method, `adapter ${entry.id} must expose a fetch method`).toBeTypeOf("function");
      await expect(method.call(adapter, "TEST")).rejects.toBeInstanceOf(PlannedSourceError);
    }
  });

  it("NOT_IN_SCOPE sources throw OutOfScopeSourceError", async () => {
    const oos = DATA_SOURCE_MATRIX.filter((e) => e.status === "NOT_IN_SCOPE");
    expect(oos.length).toBeGreaterThan(0);
    for (const entry of oos) {
      const adapter = getAdapter(entry.id) as unknown as { observe?: () => Promise<unknown> };
      await expect(adapter.observe?.()).rejects.toBeInstanceOf(OutOfScopeSourceError);
    }
  });

  it("INFERRED sources tag their envelope with inferred=true", async () => {
    const { portCongestion } = await import("@/adapters/models/port-congestion.adapter");
    const res = await portCongestion.score("LOS", 4, 12);
    expect(res.inferred).toBe(true);
    expect(res.confidence).toBe("INFERRED");
  });

  it("every registered adapter surfaces a health report shape", async () => {
    for (const { adapter } of listAdapters()) {
      const rep = await adapter.healthCheck();
      expect(rep.state).toMatch(/^(OK|DEGRADED|DOWN|UNKNOWN|NOT_APPLICABLE)$/);
      expect(rep.checkedAt).toBeTypeOf("string");
    }
  });
});
