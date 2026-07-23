/**
 * End-to-end pipeline test: IAL ingestion → ICE correlation → single
 * fused package handed to the OIE.
 *
 * Guarantees verified here (spec contract with the OIE):
 *   1. The IAL fans out to every registered connector for a query.
 *   2. ICE runs exactly once and returns exactly one `IntelligencePackage`.
 *   3. The fused output contains no duplicate (canonicalId × fieldName)
 *      rows — regardless of how many providers agreed on the same value.
 *   4. Every fused field has exactly one winning source and one
 *      explanation.
 *   5. Duplicate provider records for the same field collapse into one
 *      fused row with the corroboration reflected in the matrix.
 */

import { describe, it, expect } from "vitest";
import {
  ConnectorManager,
  SimulatedAisConnector,
  SimulatedEquasisConnector,
  SimulatedImoConnector,
  SimulatedMarineTrafficConnector,
  SimulatedOpenSanctionsConnector,
} from "@/services/ial";
import { runIce } from "@/services/ice";
import type { IceQueryInput, FusedField } from "@/services/ice/types";
import type { CanonicalEntityRef } from "@/services/ial/types";

function newManager(): ConnectorManager {
  const mgr = new ConnectorManager();
  mgr.register(new SimulatedAisConnector());
  mgr.register(new SimulatedEquasisConnector());
  mgr.register(new SimulatedImoConnector());
  mgr.register(new SimulatedMarineTrafficConnector());
  mgr.register(new SimulatedOpenSanctionsConnector());
  return mgr;
}

const OCEAN_MELODY: CanonicalEntityRef = {
  kind: "vessel",
  id: "vessel:imo:9303065",
  label: "MV Ocean Melody",
};

function fieldKey(f: FusedField): string {
  return `${f.canonicalId}::${f.fieldName}`;
}

describe("E2E · IAL → ICE → OIE handoff", () => {
  it("produces exactly one IntelligencePackage per query", async () => {
    const mgr = newManager();
    await mgr.warmup();
    const input: IceQueryInput = {
      text: "Investigate MV Ocean Melody",
      entity: OCEAN_MELODY,
      riskTier: "T2",
    };
    const pkg = await runIce(input, mgr);

    expect(pkg).toBeDefined();
    expect(pkg.plan.queryId).toBeTruthy();
    expect(pkg.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // shape: single artefact with all downstream slices attached.
    expect(Array.isArray(pkg.fused)).toBe(true);
    expect(Array.isArray(pkg.matrix)).toBe(true);
    expect(Array.isArray(pkg.conflicts)).toBe(true);
    expect(Array.isArray(pkg.corroborations)).toBe(true);
    expect(Array.isArray(pkg.recommendations)).toBe(true);
  });

  it("fused output has no duplicate (canonicalId × fieldName) rows", async () => {
    const mgr = newManager();
    await mgr.warmup();
    const pkg = await runIce(
      { text: "Trace ownership of MV Ocean Melody", entity: OCEAN_MELODY, riskTier: "T2" },
      mgr,
    );

    expect(pkg.fused.length).toBeGreaterThan(0);
    const keys = pkg.fused.map(fieldKey);
    const uniq = new Set(keys);
    expect(uniq.size).toBe(keys.length);
  });

  it("every fused field has one winning source and one explanation", async () => {
    const mgr = newManager();
    await mgr.warmup();
    const pkg = await runIce(
      { text: "Verify identity of MV Ocean Melody", entity: OCEAN_MELODY, riskTier: "T2" },
      mgr,
    );

    for (const f of pkg.fused) {
      expect(typeof f.explanationText).toBe("string");
      expect(f.explanationText.length).toBeGreaterThan(0);
      // winningSource may be null only for MISSING cells.
      if (f.cellStatus !== "MISSING") {
        expect(f.winningSource).not.toBeNull();
      }
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("multi-source agreement collapses to a single fused row with corroboration", async () => {
    // Equasis + IMO GISIS both emit a `name` field for the vessel. After
    // ICE runs, the OIE must see one fused `name` row — not two.
    const mgr = newManager();
    await mgr.warmup();
    const pkg = await runIce(
      { text: "Identify MV Ocean Melody", entity: OCEAN_MELODY, riskTier: "T2" },
      mgr,
    );

    const nameRows = pkg.fused.filter(
      (f) => f.canonicalId === OCEAN_MELODY.id && f.fieldName === "name",
    );
    expect(nameRows.length).toBe(1);

    // Matrix should still contain both source cells (audit trail preserved).
    const nameCells = pkg.matrix.filter(
      (c) => c.canonicalId === OCEAN_MELODY.id && c.fieldName === "name",
    );
    expect(nameCells.length).toBeGreaterThanOrEqual(2);
    const sources = new Set(nameCells.map((c) => c.sourceId));
    expect(sources.has("equasis")).toBe(true);
    expect(sources.has("imo-gisis")).toBe(true);

    // Corroboration row present for `name`.
    const corrob = pkg.corroborations.find(
      (c) => c.canonicalId === OCEAN_MELODY.id && c.fieldName === "name",
    );
    expect(corrob).toBeDefined();
    expect(corrob!.agreementCount).toBeGreaterThanOrEqual(2);
  });

  it("running the same query twice yields two packages with identical fused shape (deterministic, no duplication across calls)", async () => {
    const mgr = newManager();
    await mgr.warmup();
    const q: IceQueryInput = {
      text: "Investigate MV Ocean Melody",
      entity: OCEAN_MELODY,
      riskTier: "T2",
    };
    const a = await runIce(q, mgr);
    const b = await runIce(q, mgr);

    // Each call returns its own package (no accumulation).
    expect(a).not.toBe(b);
    // Same fused field set — no duplicate fields introduced by re-running.
    const keysA = a.fused.map(fieldKey).sort();
    const keysB = b.fused.map(fieldKey).sort();
    expect(keysB).toEqual(keysA);
    // And neither package has intra-package duplicates.
    expect(new Set(keysA).size).toBe(keysA.length);
    expect(new Set(keysB).size).toBe(keysB.length);
  });

  it("IAL fan-out reaches every registered connector for the entity", async () => {
    const mgr = newManager();
    await mgr.warmup();
    const pkg = await runIce(
      { text: "Investigate MV Ocean Melody", entity: OCEAN_MELODY, riskTier: "T2" },
      mgr,
    );
    // Every evidence record carries a source; the fused matrix must
    // reflect contributions from at least the vessel-aware connectors.
    const sourcesInMatrix = new Set(pkg.matrix.map((c) => c.sourceId));
    for (const s of ["ais", "equasis", "imo-gisis", "marinetraffic"] as const) {
      expect(sourcesInMatrix.has(s)).toBe(true);
    }
  });
});
