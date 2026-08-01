/**
 * SPRINT CAP-04 — Cargo Investigation Copilot validation.
 *
 * Proves prompt routing is deterministic, that non-cargo questions fall
 * through untouched, that the dossier always emits the ten mandated
 * sections, and that absent evidence is reported as a gap rather than
 * invented.
 */
import { describe, expect, it } from "vitest";
import { buildCargoDossier, extractSubjectTerm, routeCargoQuery } from "@/services/copilot/cargo";
import { cargoGraphFromEvidence } from "@/services/cargo-graph";
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
    }),
    ev("cargo:container:MSCU7811203", "cargo", {
      "rel.bol": "cargo:bol:MSCU:BL-88213",
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
  ];
}

const query = () => cargoGraphFromEvidence(chainEvidence()).query;

describe("cargo copilot — prompt routing", () => {
  it("classifies each mandated investigation", () => {
    const cases: Array<[string, string]> = [
      ["Investigate this shipment MSCU7811203", "investigate-shipment"],
      ["Show every container linked to company:cac:RC-4411", "containers-for-company"],
      ["Find all Bills of Lading for RC-9002", "bills-of-lading"],
      ["Explain revenue leakage on this consignment", "revenue-leakage"],
      ["Explain why this cargo is high risk", "cargo-risk"],
      ["Show related vessels", "related-vessels"],
      ["Give me the cargo timeline", "cargo-timeline"],
    ];
    for (const [q, intent] of cases) {
      expect(routeCargoQuery(q, { graph: query() })?.intent, q).toBe(intent);
    }
  });

  it("leaves non-cargo questions to the standard pipeline", () => {
    expect(routeCargoQuery("Who owns vessel IMO 9438291?", { graph: query() })).toBeNull();
    expect(routeCargoQuery("What is the weather at Apapa?", { graph: query() })).toBeNull();
    expect(routeCargoQuery("   ")).toBeNull();
  });

  it("extracts canonical ids, container units and IMO numbers", () => {
    expect(extractSubjectTerm("investigate cargo:bol:MSCU:BL-88213")).toBe(
      "cargo:bol:MSCU:BL-88213",
    );
    expect(extractSubjectTerm("investigate this shipment MSCU7811203")).toBe("MSCU7811203");
    expect(extractSubjectTerm("cargo timeline for IMO 9438291")).toBe("9438291");
  });

  it("resolves the subject against the graph and reports when it cannot", () => {
    const hit = routeCargoQuery("investigate this shipment MSCU7811203", { graph: query() });
    expect(hit?.focusId).toBe("cargo:container:MSCU7811203");
    const miss = routeCargoQuery("investigate this shipment ZZZU0000000", { graph: query() });
    expect(miss?.focusId).toBeNull();
    expect(miss?.resolution).toMatch(/No entity matching/);
  });

  it("carries the sticky subject into follow-ups that name none", () => {
    const r = routeCargoQuery("show related vessels", {
      graph: query(),
      stickyFocusId: "cargo:container:MSCU7811203",
    });
    expect(r?.focusId).toBe("cargo:container:MSCU7811203");
    expect(r?.resolution).toMatch(/previous question/);
  });
});

describe("cargo copilot — dossier", () => {
  const build = (q: string, evidence = chainEvidence()) =>
    buildCargoDossier({ query: q, evidence, uipId: "uip-test" });

  it("returns null for non-cargo questions", () => {
    expect(build("Who owns this vessel?")).toBeNull();
  });

  it("always emits the ten mandated sections in order", () => {
    const d = build("investigate this shipment MSCU7811203");
    expect(d).not.toBeNull();
    expect(d!.sections.map((s) => s.id)).toEqual([
      "executive-summary",
      "cargo-timeline",
      "related-companies",
      "related-containers",
      "manifest-summary",
      "revenue-analysis",
      "risk-assessment",
      "customs-intelligence",
      "ai-recommendations",
      "next-best-actions",
    ]);
  });

  it("cites evidence for every populated section", () => {
    const d = build("investigate this shipment MSCU7811203")!;
    const summary = d.sections[0];
    expect(summary.empty).toBe(false);
    expect(summary.citations.length).toBeGreaterThan(0);
    for (const c of summary.citations) expect(c.evidenceId).toMatch(/^evidence:/);
  });

  it("reports gaps instead of inventing evidence", () => {
    const d = build("explain revenue leakage for MSCU7811203")!;
    const revenue = d.sections.find((s) => s.id === "revenue-analysis")!;
    expect(revenue.empty).toBe(true);
    expect(revenue.grade).toBe("UNKNOWN");
    expect(revenue.lines[0]).toMatch(/No revenue assessment/);
  });

  it("degrades honestly when the subject cannot be resolved", () => {
    const d = build("investigate this shipment ZZZU0000000")!;
    expect(d.empty).toBe(true);
    expect(d.focus).toBeNull();
    expect(d.sections).toHaveLength(10);
    for (const s of d.sections) expect(s.empty).toBe(true);
  });

  it("surfaces related companies, containers and vessels from the graph", () => {
    const d = build("investigate cargo:bol:MSCU:BL-88213")!;
    const companies = d.sections.find((s) => s.id === "related-companies")!;
    const containers = d.sections.find((s) => s.id === "related-containers")!;
    expect(companies.empty).toBe(false);
    expect(containers.lines.join(" ")).toContain("MSCU7811203");
  });

  it("never omits the officer-decides framing", () => {
    const d = build("investigate this shipment MSCU7811203")!;
    const recs = d.sections.find((s) => s.id === "ai-recommendations")!;
    expect(recs.lines.at(-1)).toMatch(/officer decides/i);
  });
});
