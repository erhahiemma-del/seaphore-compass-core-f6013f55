// @vitest-environment node
/**
 * Sprint UX-04 — intent hint inference. Presentation-only labelling: the hint
 * never filters or routes the query, so the contract is simply "label honestly
 * or stay silent".
 */
import { describe, expect, it } from "vitest";

import { detectIntentHint } from "@/lib/copilot/intent-hints";

describe("detectIntentHint", () => {
  it("stays silent on text too short to label", () => {
    expect(detectIntentHint("")).toBeNull();
    expect(detectIntentHint("MV")).toBeNull();
  });

  it.each([
    ["IMO 9438291", "IMO"],
    ["9438291", "IMO"],
    ["MV Ocean Pearl", "VESSEL"],
    ["Show vessels owned by ABC Marine Ltd", "COMPANY"],
    ["Analyze manifest MFT-2291", "MANIFEST"],
    ["Trace container MSCU1234567", "CONTAINER"],
    ["Check bill of lading 88213", "BOL"],
    ["Track previous voyages", "VOYAGE"],
    ["Find suspicious cargo entering Apapa", "PORT"],
    ["Screen the operator for sanctions", "SANCTIONS"],
  ] as const)("labels %s", (text, key) => {
    expect(detectIntentHint(text)?.key).toBe(key);
  });

  it("never throws on arbitrary officer input", () => {
    for (const text of ["???", "who owns it", "12", "...", "北京"]) {
      expect(() => detectIntentHint(text)).not.toThrow();
    }
  });
});
