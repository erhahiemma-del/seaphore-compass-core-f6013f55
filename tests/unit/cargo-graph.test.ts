/**
 * SPRINT CAP-03 — Cargo Knowledge Graph validation.
 *
 * Proves the graph is a pure projection of Canonical UIP evidence:
 * nothing enters without provenance, grades are never upgraded, gaps are
 * reported rather than inferred.
 */
import { describe, expect, it } from "vitest";
import {
  CARGO_CHAIN,
  buildCargoGraph,
  cargoGraphFromEvidence,
  cargoRoleOf,
  createCargoGraphQuery,
} from "@/services/cargo-graph";
import type { NormalizedEvidence } from "@/services/ial/types";

let seq = 0;
const ev = (
  entityId: string,
  kind: NormalizedEvidence["entity"]["kind"],
  fields: Record<string, string | number | boolean> = {},
  over: Partial<NormalizedEvidence> = {},
): NormalizedEvidence =>
  ({
    id: `evidence:customs:${(seq += 1)}`,
    source: "customs",
    sourceName: "Nigeria Customs Service",
    grade: "OBSERVED",
    entity: { kind, id: entityId, label: entityId.split(":").pop() },
    kind: "cargo",
    fields,
    observedAt: `2026-07-2${(seq % 9) + 1}T08:00:00.000Z`,
    retrievedAt: "2026-07-26T08:00:00.000Z",
    freshnessSeconds: 60,
    hash: `hash${seq}`,
    ...over,
  }) as NormalizedEvidence;

/** A full chain: company → BoL → container → item → commodity → voyage →
 *  vessel → port, plus declaration → assessment. */
function chainEvidence(): NormalizedEvidence[] {
  return [
    ev("cargo:manifest:NCS:MF-100", "cargo", {
      "rel.voyage": "voyage:MSC-2201",
      "rel.portOfDischarge": "port:unlocode:NGAPP",
    }),
    ev("cargo:bol:MSCU:BL-88213", "cargo", {
      "rel.manifest": "cargo:manifest:NCS:MF-100",
      "rel.shipper": "company:cac:RC-4411",
      "rel.consignee": "company:cac:RC-9002",
      "rel.carrier": "company:cac:RC-1001",
    }),
    ev("cargo:container:MSCU7811203", "cargo", {
      "rel.bol": "cargo:bol:MSCU:BL-88213",
      "rel.portCall": "portcall:NGAPP:2026-07-21",
    }),
    ev("cargo:item:BL-88213:1", "cargo", {
      "rel.container": "cargo:container:MSCU7811203",
      "rel.commodity": "cargo:commodity:8517.12:handsets",
    }),
    ev("cargo:commodity:8517.12:handsets", "cargo", {
      "rel.hsCode": "cargo:hs:hs2022:8517.12",
    }),
    ev("voyage:MSC-2201", "voyage", { "rel.vessel": "vessel:imo:9438291" }, { kind: "voyage" }),
    ev("vessel:imo:9438291", "vessel", {}, { kind: "identity" }),
    ev(
      "cargo:declaration:NCS:SAD-7781",
      "cargo",
      { "rel.bol": "cargo:bol:MSCU:BL-88213", "rel.declarant": "company:cac:RC-9002" },
      { kind: "compliance" },
    ),
    ev(
      "cargo:assessment:NCS:AS-551",
      "cargo",
      { "rel.declaration": "cargo:declaration:NCS:SAD-7781", dutyPayable: 4_200_000 },
      { kind: "compliance" },
    ),
  ];
}

describe("cargo knowledge graph — model", () => {
  it("derives chain roles from the canonical id namespace only", () => {
    expect(cargoRoleOf("cargo:manifest:NCS:MF-1")).toBe("manifest");
    expect(cargoRoleOf("cargo:bol:MSCU:BL-1")).toBe("bill-of-lading");
    expect(cargoRoleOf("cargo:container:MSCU7811203")).toBe("container");
    expect(cargoRoleOf("cargo:item:BL-1:1")).toBe("cargo-item");
    expect(cargoRoleOf("cargo:commodity:8517.12:x")).toBe("commodity");
    expect(cargoRoleOf("cargo:hs:hs2022:8517.12")).toBe("hs-code");
    expect(cargoRoleOf("cargo:assessment:NCS:AS-1")).toBe("revenue");
    expect(cargoRoleOf("vessel:imo:9438291")).toBe("vessel");
    expect(cargoRoleOf("company:cac:RC-1")).toBe("company");
    expect(cargoRoleOf("port:unlocode:NGAPP")).toBe("port");
  });

  it("declares the full CAP-03 chain", () => {
    expect(CARGO_CHAIN[0]).toBe("company");
    expect(CARGO_CHAIN[CARGO_CHAIN.length - 1]).toBe("investigation");
    expect(CARGO_CHAIN).toContain("inspection");
    expect(CARGO_CHAIN).toContain("revenue");
  });
});

describe("cargo knowledge graph — builder", () => {
  it("builds nodes and edges only from evidence", () => {
    const { graph } = buildCargoGraph(chainEvidence());
    const stats = graph.stats();
    expect(stats.nodes).toBeGreaterThan(10);
    expect(stats.edges).toBeGreaterThan(8);
    for (const n of graph.allNodes()) expect(n.provenance.length).toBeGreaterThan(0);
    for (const e of graph.allEdges()) expect(e.provenance.length).toBeGreaterThan(0);
  });

  it("returns an empty graph for empty evidence — never a seeded one", () => {
    const { graph } = buildCargoGraph([]);
    expect(graph.stats()).toMatchObject({ nodes: 0, edges: 0, evidenceRecords: 0 });
  });

  it("emits reverse edges so the documentary chain reads top-down", () => {
    const { graph } = buildCargoGraph(chainEvidence());
    expect(graph.getEdge("contains::cargo:manifest:NCS:MF-100->cargo:bol:MSCU:BL-88213")).toBeDefined();
    expect(graph.getEdge("covers::cargo:bol:MSCU:BL-88213->cargo:container:MSCU7811203")).toBeDefined();
    expect(graph.getEdge("stows::cargo:container:MSCU7811203->cargo:item:BL-88213:1")).toBeDefined();
  });

  it("strengthens an edge when a second source asserts it, never overwrites", () => {
    const base = ev("cargo:bol:MSCU:BL-1", "cargo", { "rel.shipper": "company:cac:RC-1" });
    const second = ev(
      "cargo:bol:MSCU:BL-1",
      "cargo",
      { "rel.shipper": "company:cac:RC-1" },
      { source: "nimasa", sourceName: "NIMASA", grade: "REPORTED" },
    );
    const { graph } = buildCargoGraph([base, second]);
    const edge = graph.getEdge("shipped_by::cargo:bol:MSCU:BL-1->company:cac:RC-1")!;
    expect(edge.sources.length).toBe(2);
    expect(edge.provenance.length).toBe(2);
    // Grade is the strongest supporting grade — never invented above it.
    expect(edge.grade).toBe("OBSERVED");
    expect(edge.weight).toBeGreaterThan(0.5);
  });

  it("refuses self-loops and unknown-node edges", () => {
    const { graph } = buildCargoGraph([
      ev("cargo:bol:MSCU:BL-2", "cargo", { "rel.shipper": "cargo:bol:MSCU:BL-2" }),
    ]);
    expect(graph.allEdges()).toHaveLength(0);
  });
});

describe("cargo knowledge graph — query interface", () => {
  const q = () => createCargoGraphQuery(buildCargoGraph(chainEvidence()).graph);

  it("traverses relationships with narrative and weakest-link grading", () => {
    const paths = q().traverse("cargo:bol:MSCU:BL-88213", { maxDepth: 2 });
    expect(paths.length).toBeGreaterThan(3);
    expect(paths[0].narrative).toContain("—[");
    expect(paths.every((p) => p.hops <= 2)).toBe(true);
  });

  it("finds paths between a container and the carrying vessel", () => {
    const paths = q().pathsBetween("cargo:container:MSCU7811203", "vessel:imo:9438291", {
      maxDepth: 6,
    });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].nodeIds[0]).toBe("cargo:container:MSCU7811203");
    expect(paths[0].nodeIds.at(-1)).toBe("vessel:imo:9438291");
  });

  it("discovers related entities ordered by hop distance", () => {
    const related = q().relatedEntities("cargo:bol:MSCU:BL-88213", { maxDepth: 3 });
    expect(related.length).toBeGreaterThan(4);
    expect(related[0].hops).toBe(1);
    expect(related.every((r) => r.reason.length > 0)).toBe(true);
  });

  it("reconstructs a chronologically ordered timeline", () => {
    const events = q().timeline("cargo:bol:MSCU:BL-88213");
    expect(events.length).toBeGreaterThan(0);
    const times = events.map((e) => e.at);
    expect([...times].sort()).toEqual(times);
    expect(events.every((e) => e.evidenceIds.length > 0)).toBe(true);
  });

  it("builds investigation context and reports chain gaps honestly", () => {
    const ctx = q().investigationContext("cargo:bol:MSCU:BL-88213");
    expect(ctx.focus).not.toBeNull();
    expect(ctx.evidenceCount).toBeGreaterThan(0);
    // No inspection or investigation evidence exists in the fixture.
    expect(ctx.gaps).toContain("inspection");
    expect(ctx.gaps).toContain("investigation");
    expect(ctx.summary.join(" ")).toContain("officer decides");
  });

  it("reports absence instead of inventing a chain for unknown entities", () => {
    const ctx = q().investigationContext("cargo:bol:UNKNOWN");
    expect(ctx.focus).toBeNull();
    expect(ctx.gaps.length).toBe(CARGO_CHAIN.length);
    expect(ctx.grade).toBe("UNKNOWN");
  });
});

describe("cargo knowledge graph — OIE / Copilot facade", () => {
  const f = () => cargoGraphFromEvidence(chainEvidence());

  it("exposes the four mandated operations with citations", () => {
    const answers = [
      f().traverse("cargo:bol:MSCU:BL-88213"),
      f().related("cargo:bol:MSCU:BL-88213"),
      f().context("cargo:bol:MSCU:BL-88213"),
      f().timeline("cargo:bol:MSCU:BL-88213"),
    ];
    expect(answers.map((a) => a.operation)).toEqual([
      "relationship-traversal",
      "related-entity-discovery",
      "investigation-context",
      "timeline-reconstruction",
    ]);
    for (const a of answers) {
      expect(a.empty).toBe(false);
      expect(a.lines.length).toBeGreaterThan(1);
      expect(a.citations.length).toBeGreaterThan(0);
    }
  });

  it("returns an explicit empty answer for entities with no evidence", () => {
    const a = f().traverse("vessel:imo:0000000");
    expect(a.empty).toBe(true);
    expect(a.citations).toHaveLength(0);
    expect(a.lines.join(" ")).toContain("no evidence");
  });
});
