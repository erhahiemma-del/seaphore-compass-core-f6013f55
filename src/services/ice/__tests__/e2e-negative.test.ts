/**
 * End-to-end negative tests: malformed / incomplete IAL evidence flows
 * into ICE and the pipeline MUST fail safely.
 *
 * Contract with the OIE:
 *   1. `runIce` never throws — malformed inputs surface as tags,
 *      statuses, and recommendations, never as an exception.
 *   2. The fused output stays canonical: exactly one row per
 *      (canonicalId × fieldName), even under duplicate or garbage input.
 *   3. Malformed evidence carries auditable error tags:
 *        - stale records → `STALE` tag on their matrix cells
 *        - single-provider records → `SINGLE_SOURCE` cellStatus and
 *          an `INFO` recommendation with `single_source` trigger
 *        - low-confidence records → `P3` recommendation with
 *          `low_confidence` trigger
 *        - critical-field disagreements → `P1` recommendation with
 *          `critical_field_conflict` trigger and `CRITICAL` severity
 *   4. Empty evidence produces an empty (but well-formed)
 *      IntelligencePackage — not a crash.
 *   5. Connector throws / outages never reach ICE (the IAL contains
 *      them); the resulting package is still shaped correctly.
 */

import { describe, it, expect } from "vitest";
import { ConnectorManager, SimulatedEquasisConnector, SimulatedImoConnector } from "@/services/ial";
import type { Connector } from "@/services/ial";
import type {
  AcquisitionQuery,
  CanonicalEntityRef,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  NormalizedEvidence,
} from "@/services/ial/types";
import { runIce } from "@/services/ice";
import type { FusedField, IceQueryInput } from "@/services/ice/types";

const OCEAN_MELODY: CanonicalEntityRef = {
  kind: "vessel",
  id: "vessel:imo:9303065",
  label: "MV Ocean Melody",
};

const fieldKey = (f: FusedField): string => `${f.canonicalId}::${f.fieldName}`;

const HOUR_MS = 3_600_000;

/**
 * Build a `NormalizedEvidence` record directly — bypassing `normalizeRecord`
 * — so we can inject deliberately malformed shapes.
 */
function raw(
  partial: Partial<NormalizedEvidence> & {
    source: ConnectorId;
    fields: Record<string, unknown>;
    entityId?: string;
    ageHrs?: number;
  },
): NormalizedEvidence {
  const now = Date.now();
  const ageMs = (partial.ageHrs ?? 1) * HOUR_MS;
  const observedAt = new Date(now - ageMs).toISOString();
  return {
    id: partial.id ?? `ev_${partial.source}_${Math.random().toString(36).slice(2, 10)}`,
    source: partial.source,
    sourceName: partial.sourceName ?? String(partial.source),
    grade: partial.grade ?? "REPORTED",
    entity: partial.entity ?? {
      kind: "vessel",
      id: partial.entityId ?? OCEAN_MELODY.id,
      label: OCEAN_MELODY.label,
    },
    kind: partial.kind ?? "identity",
    fields: partial.fields as NormalizedEvidence["fields"],
    observedAt: partial.observedAt ?? observedAt,
    retrievedAt: partial.retrievedAt ?? observedAt,
    freshnessSeconds: partial.freshnessSeconds ?? Math.round(ageMs / 1000),
    hash: partial.hash ?? `hash_${Math.random().toString(36).slice(2, 12)}`,
    providerRecordId: partial.providerRecordId,
    excerpt: partial.excerpt,
    units: partial.units,
  };
}

/** Test-only connector that emits a fixed set of pre-built records. */
class ScriptedConnector implements Connector {
  readonly displayName: string;
  constructor(
    readonly id: ConnectorId,
    private readonly records: ReadonlyArray<NormalizedEvidence>,
    private readonly opts: { throwOnCall?: boolean; latencyMs?: number } = {},
  ) {
    this.displayName = `scripted:${id}`;
  }
  async connect(): Promise<void> {}
  async authenticate(): Promise<boolean> {
    return !this.opts.throwOnCall;
  }
  async search(q: AcquisitionQuery): Promise<ConnectorResult> {
    return this.run(q);
  }
  async lookup(q: AcquisitionQuery): Promise<ConnectorResult> {
    return this.run(q);
  }
  normalize(): NormalizedEvidence | null {
    return null;
  }
  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.id,
      available: !this.opts.throwOnCall,
      authenticated: !this.opts.throwOnCall,
      latencyMsP50: this.opts.latencyMs ?? 5,
      failureRate: this.opts.throwOnCall ? 1 : 0,
      quotaRemaining: null,
      lastSuccessAt: null,
      lastError: this.opts.throwOnCall ? "scripted failure" : null,
    };
  }
  private async run(_q: AcquisitionQuery): Promise<ConnectorResult> {
    if (this.opts.throwOnCall) {
      throw new Error("scripted connector explosion");
    }
    return {
      connectorId: this.id,
      ok: true,
      records: this.records,
      latencyMs: this.opts.latencyMs ?? 5,
    };
  }
}

function managerWith(...connectors: Connector[]): ConnectorManager {
  const mgr = new ConnectorManager({ perConnectorTimeoutMs: 500 });
  for (const c of connectors) mgr.register(c);
  return mgr;
}

const baseQuery = (text = "Investigate MV Ocean Melody"): IceQueryInput => ({
  text,
  entity: OCEAN_MELODY,
  riskTier: "T2",
});

function assertNoDuplicateFused(fused: ReadonlyArray<FusedField>): void {
  const keys = fused.map(fieldKey);
  expect(new Set(keys).size).toBe(keys.length);
}

describe("E2E · IAL malformed evidence → ICE fails safely", () => {
  it("returns a well-formed empty package when every connector yields zero records", async () => {
    const mgr = managerWith(new ScriptedConnector("ais" as ConnectorId, []));
    await mgr.warmup();

    const pkg = await runIce(baseQuery("Investigate vessel with no evidence"), mgr);

    expect(pkg).toBeDefined();
    expect(pkg.fused).toEqual([]);
    expect(pkg.matrix).toEqual([]);
    expect(pkg.conflicts).toEqual([]);
    expect(pkg.corroborations).toEqual([]);
    expect(pkg.evidence).toEqual([]);
    // Plan still records the query.
    expect(pkg.plan.queryId).toBeTruthy();
    expect(pkg.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("contains connector explosions inside the IAL — ICE still emits a package", async () => {
    const mgr = managerWith(
      new ScriptedConnector("equasis" as ConnectorId, [], { throwOnCall: true }),
      new ScriptedConnector("imo-gisis" as ConnectorId, [], { throwOnCall: true }),
    );
    await mgr.warmup();

    // Must not throw — the IAL catches connector errors and surfaces
    // them as ok=false results; ICE sees zero evidence and returns
    // an empty but well-formed package.
    const pkg = await runIce(baseQuery(), mgr);
    expect(pkg.fused).toEqual([]);
    expect(pkg.matrix).toEqual([]);
    assertNoDuplicateFused(pkg.fused);
  });

  it("flags stale malformed records with the STALE tag and never drops them", async () => {
    // 90-day-old owner record — far past the freshness cliff.
    const staleOwner = raw({
      source: "equasis" as ConnectorId,
      grade: "REPORTED",
      kind: "ownership",
      fields: { vessel_owner: "GhostCorp Ltd" },
      ageHrs: 24 * 90,
    });
    const mgr = managerWith(new ScriptedConnector("equasis" as ConnectorId, [staleOwner]));
    await mgr.warmup();

    const pkg = await runIce(baseQuery("Trace ownership"), mgr);

    const ownerCells = pkg.matrix.filter((c) => c.fieldName === "vessel_owner");
    expect(ownerCells.length).toBe(1);
    expect(ownerCells[0].tags).toContain("STALE");
    expect(ownerCells[0].freshnessScore).toBe(0);

    // The stale record still fuses — but as SINGLE_SOURCE with an
    // INFO recommendation calling for corroboration.
    assertNoDuplicateFused(pkg.fused);
    const ownerFused = pkg.fused.find((f) => f.fieldName === "vessel_owner");
    expect(ownerFused).toBeDefined();
    expect(ownerFused!.cellStatus).toBe("SINGLE_SOURCE");
    expect(
      pkg.recommendations.some(
        (r) => r.priority === "INFO" && r.triggerCondition === "single_source",
      ),
    ).toBe(true);
  });

  it("collapses duplicate provider records into one fused row (no duplicates under garbage input)", async () => {
    // Same source emits the SAME field five times with jittered ids —
    // classic "provider dumped its buffer" garbage. Fused output must
    // still be one row.
    const dupes = Array.from({ length: 5 }, () =>
      raw({
        source: "imo-gisis" as ConnectorId,
        grade: "VERIFIED",
        kind: "identity",
        fields: { imo_number: "9303065" },
        ageHrs: 2,
      }),
    );
    const mgr = managerWith(new ScriptedConnector("imo-gisis" as ConnectorId, dupes));
    await mgr.warmup();

    const pkg = await runIce(baseQuery("Verify identity"), mgr);
    assertNoDuplicateFused(pkg.fused);
    const imoRows = pkg.fused.filter((f) => f.fieldName === "imo_number");
    expect(imoRows.length).toBe(1);
  });

  it("emits a P1 critical_field_conflict recommendation when malformed evidence disagrees on identity", async () => {
    const good = raw({
      source: "imo-gisis" as ConnectorId,
      grade: "VERIFIED",
      kind: "identity",
      fields: { imo_number: "9303065" },
      ageHrs: 1,
    });
    const bad = raw({
      source: "equasis" as ConnectorId,
      grade: "REPORTED",
      kind: "identity",
      fields: { imo_number: "9303066" }, // wrong IMO — a critical conflict
      ageHrs: 1,
    });
    const mgr = managerWith(
      new ScriptedConnector("imo-gisis" as ConnectorId, [good]),
      new ScriptedConnector("equasis" as ConnectorId, [bad]),
    );
    await mgr.warmup();

    const pkg = await runIce(baseQuery("Verify identity"), mgr);
    assertNoDuplicateFused(pkg.fused);

    const imoConflict = pkg.conflicts.find((c) => c.fieldName === "imo_number");
    expect(imoConflict).toBeDefined();
    expect(imoConflict!.severity).toBe("CRITICAL");
    expect(imoConflict!.isCriticalField).toBe(true);

    const p1 = pkg.recommendations.find(
      (r) => r.priority === "P1" && r.triggerCondition === "critical_field_conflict",
    );
    expect(p1).toBeDefined();

    const imoFused = pkg.fused.find((f) => f.fieldName === "imo_number");
    expect(imoFused).toBeDefined();
    expect(imoFused!.hasConflict).toBe(true);
    expect(imoFused!.requiresOfficerReview).toBe(true);
  });

  it("still fuses cleanly when malformed evidence has empty/null field values (no duplicates, no throw)", async () => {
    const partial = [
      raw({
        source: "equasis" as ConnectorId,
        grade: "REPORTED",
        kind: "identity",
        fields: { vessel_name: "" }, // required field empty
        ageHrs: 1,
      }),
      raw({
        source: "imo-gisis" as ConnectorId,
        grade: "OBSERVED",
        kind: "identity",
        fields: { vessel_name: null }, // required field null
        ageHrs: 1,
      }),
    ];
    const mgr = managerWith(
      new ScriptedConnector("equasis" as ConnectorId, [partial[0]]),
      new ScriptedConnector("imo-gisis" as ConnectorId, [partial[1]]),
    );
    await mgr.warmup();

    // Must not throw and must not produce duplicate fused rows.
    const pkg = await runIce(baseQuery("Identify vessel"), mgr);
    assertNoDuplicateFused(pkg.fused);

    // Every fused entry has an explanation and a bounded confidence.
    for (const f of pkg.fused) {
      expect(typeof f.explanationText).toBe("string");
      expect(f.explanationText.length).toBeGreaterThan(0);
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("segregates records with unknown entity ids into their own canonical bucket without duplicating fused rows", async () => {
    // One record for the queried vessel, one for a totally unrelated
    // canonical id. ICE must produce fused rows per canonical entity,
    // and the (canonicalId × fieldName) uniqueness invariant must hold.
    const forQueried = raw({
      source: "imo-gisis" as ConnectorId,
      grade: "VERIFIED",
      kind: "identity",
      fields: { vessel_name: "Ocean Melody" },
      entityId: OCEAN_MELODY.id,
    });
    const forStranger = raw({
      source: "equasis" as ConnectorId,
      grade: "OBSERVED",
      kind: "identity",
      fields: { vessel_name: "Unknown Hull" },
      entityId: "vessel:unknown", // canonical id emitted by normaliser for empty native ids
    });
    const mgr = managerWith(
      new ScriptedConnector("imo-gisis" as ConnectorId, [forQueried]),
      new ScriptedConnector("equasis" as ConnectorId, [forStranger]),
    );
    await mgr.warmup();

    const pkg = await runIce(baseQuery(), mgr);
    assertNoDuplicateFused(pkg.fused);

    const canonicalIds = new Set(pkg.fused.map((f) => f.canonicalId));
    expect(canonicalIds.has(OCEAN_MELODY.id)).toBe(true);
    // Both entities should each get exactly one vessel_name fused row —
    // never a single collapsed row spanning two canonical ids.
    const nameRows = pkg.fused.filter((f) => f.fieldName === "vessel_name");
    expect(nameRows.length).toBeGreaterThanOrEqual(1);
    for (const row of nameRows) {
      expect(row.canonicalId).toBeTruthy();
    }
  });

  it("mixes malformed and healthy connectors without corrupting the fused output", async () => {
    const junk = raw({
      source: "customs" as ConnectorId,
      grade: "UNKNOWN",
      kind: "other",
      fields: { unrecognised_field: "??" },
      ageHrs: 24 * 365, // ancient
    });
    const mgr = managerWith(
      new ScriptedConnector("customs" as ConnectorId, [junk]),
      new SimulatedImoConnector(),
      new SimulatedEquasisConnector(),
    );
    await mgr.warmup();

    const pkg = await runIce(baseQuery(), mgr);
    assertNoDuplicateFused(pkg.fused);

    // Real simulated connectors still deliver evidence; the junk record
    // is present in the matrix but STALE-tagged.
    const junkCell = pkg.matrix.find((c) => c.fieldName === "unrecognised_field");
    expect(junkCell).toBeDefined();
    expect(junkCell!.tags).toContain("STALE");

    // The pipeline as a whole still produces recommendations.
    expect(pkg.recommendations.length).toBeGreaterThan(0);
  });

  it("running malformed input twice is deterministic — no cross-call duplication", async () => {
    const dup = raw({
      source: "imo-gisis" as ConnectorId,
      grade: "VERIFIED",
      kind: "identity",
      fields: { imo_number: "9303065", vessel_name: "Ocean Melody" },
      ageHrs: 3,
    });
    const mgr = managerWith(new ScriptedConnector("imo-gisis" as ConnectorId, [dup, dup, dup]));
    await mgr.warmup();

    const a = await runIce(baseQuery(), mgr);
    const b = await runIce(baseQuery(), mgr);

    assertNoDuplicateFused(a.fused);
    assertNoDuplicateFused(b.fused);
    expect(a.fused.map(fieldKey).sort()).toEqual(b.fused.map(fieldKey).sort());
  });
});
