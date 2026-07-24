import { describe, it, expect } from "vitest";
import { PROJECTION_CONTRACT } from "@/lib/projection-contract/registry";
import { validateContract } from "@/lib/projection-contract/validate";

describe("Projection Contract (Golden Rule)", () => {
  it("has no validation issues", () => {
    const report = validateContract();
    if (!report.ok) {
      // Print helpful diagnostics on failure.
      // eslint-disable-next-line no-console
      console.error(report.issues);
    }
    expect(report.ok).toBe(true);
  });

  it("registers at least one artifact per major backend layer", () => {
    const producers = new Set(PROJECTION_CONTRACT.map((e) => e.producer));
    for (const p of ["IAL", "IFE", "ICE", "OIE", "IBE", "REASONING"] as const) {
      expect(producers.has(p), `missing contract entry for ${p}`).toBe(true);
    }
  });

  it("uses unique ids", () => {
    const ids = PROJECTION_CONTRACT.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
