// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("@/services/geospatial/renderers/cesium-renderer", () => ({
  CesiumRenderer: class { id = "cesium"; },
}));
describe("dyn", () => {
  it("resolves mock", async () => {
    const m = await import("@/services/geospatial/renderers/cesium-renderer");
    expect(typeof m.CesiumRenderer).toBe("function");
  }, 20000);
});
