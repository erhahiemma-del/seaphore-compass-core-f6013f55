/**
 * SPRINT CAP-04 — Cargo Investigation Copilot · dossier builder.
 *
 * Consumes the Canonical UIP only, through the Cargo Knowledge Graph
 * (CAP-03) and the frozen revenue-leakage capability. Emits the ten
 * mandated officer sections. Every line is derived from evidence that
 * exists; anything absent is reported as a gap, never inferred.
 */
import {
  CARGO_ROLE_LABEL,
  cargoGraphFromEvidence,
  createCargoGraphQuery,
  buildCargoGraph,
  weakestGrade,
  type CargoGraphNode,
  type CargoGraphQuery,
  type CargoInvestigationContext,
  type CargoRelatedEntity,
} from "@/services/cargo-graph";
import { scanForLeakage, type LeakageFinding } from "@/services/revenue-leakage";
import type { EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";
import { routeCargoQuery, type CargoRoutingOptions } from "./routing";
import type {
  CargoCitation,
  CargoDossier,
  CargoRoute,
  CargoSection,
  CargoSectionId,
} from "./types";

const SECTION_TITLES: Record<CargoSectionId, string> = {
  "executive-summary": "Executive Summary",
  "cargo-timeline": "Cargo Timeline",
  "related-companies": "Related Companies",
  "related-containers": "Related Containers",
  "manifest-summary": "Manifest Summary",
  "revenue-analysis": "Revenue Analysis",
  "risk-assessment": "Risk Assessment",
  "customs-intelligence": "Customs Intelligence",
  "ai-recommendations": "AI Recommendations",
  "next-best-actions": "Next Best Actions",
};

const SECTION_ORDER: ReadonlyArray<CargoSectionId> = [
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
];

function citationsOf(nodes: ReadonlyArray<CargoGraphNode>): CargoCitation[] {
  const seen = new Map<string, CargoCitation>();
  for (const n of nodes) {
    for (const p of n.provenance) {
      if (!seen.has(p.evidenceId)) {
        seen.set(p.evidenceId, {
          evidenceId: p.evidenceId,
          source: p.sourceName,
          observedAt: p.observedAt,
          grade: p.grade,
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
}

function gradeOf(nodes: ReadonlyArray<CargoGraphNode>): EvidenceGrade {
  if (nodes.length === 0) return "UNKNOWN";
  return weakestGrade(nodes.map((n) => n.grade));
}

function section(
  id: CargoSectionId,
  lines: ReadonlyArray<string>,
  nodes: ReadonlyArray<CargoGraphNode>,
  gap: string | null,
  citations?: ReadonlyArray<CargoCitation>,
): CargoSection {
  const cites = citations ?? citationsOf(nodes);
  const empty = lines.length === 0;
  return {
    id,
    title: SECTION_TITLES[id],
    lines: empty ? [gap ?? "No evidence supports this section."] : lines,
    grade: cites.length > 0 ? gradeOf(nodes) : "UNKNOWN",
    citations: cites,
    empty,
    gap,
  };
}

const fmtMoney = (amount: number, currency: string): string =>
  `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;

function rolesOf(related: ReadonlyArray<CargoRelatedEntity>, role: string) {
  return related.filter((r) => r.node.role === role);
}

export interface BuildCargoDossierInput {
  readonly query: string;
  readonly evidence: ReadonlyArray<NormalizedEvidence>;
  readonly uipId?: string | null;
  readonly stickyFocusId?: string | null;
  /** Pre-computed leakage findings; recomputed from evidence when absent. */
  readonly findings?: ReadonlyArray<LeakageFinding>;
  readonly now?: string;
}

/**
 * Route the query and, when it is a cargo investigation, build the
 * dossier. Returns `null` for non-cargo questions so the caller falls
 * through to the standard OIE pipeline.
 */
export function buildCargoDossier(input: BuildCargoDossierInput): CargoDossier | null {
  const { graph } = buildCargoGraph(input.evidence);
  const gq = createCargoGraphQuery(graph);
  const routingOpts: CargoRoutingOptions = {
    graph: gq,
    stickyFocusId: input.stickyFocusId ?? null,
  };
  const route = routeCargoQuery(input.query, routingOpts);
  if (!route) return null;

  const findings =
    input.findings ?? (input.evidence.length > 0 ? scanForLeakage(input.evidence) : []);
  return assembleDossier({ route, gq, findings, input });
}

/** Build a dossier for an already-decided route (command dispatch path). */
export function buildCargoDossierForRoute(
  route: CargoRoute,
  input: BuildCargoDossierInput,
): CargoDossier {
  const facade = cargoGraphFromEvidence(input.evidence);
  const findings =
    input.findings ?? (input.evidence.length > 0 ? scanForLeakage(input.evidence) : []);
  return assembleDossier({ route, gq: facade.query, findings, input });
}

function assembleDossier(args: {
  route: CargoRoute;
  gq: CargoGraphQuery;
  findings: ReadonlyArray<LeakageFinding>;
  input: BuildCargoDossierInput;
}): CargoDossier {
  const { route, gq, findings, input } = args;
  const generatedAt = input.now ?? new Date().toISOString();
  const focus = route.focusId ? gq.node(route.focusId) : null;
  const ctx: CargoInvestigationContext | null = focus
    ? gq.investigationContext(focus.id, { maxDepth: 4 })
    : null;

  if (!focus || !ctx) {
    return {
      route,
      focus: null,
      context: null,
      sections: SECTION_ORDER.map((id) =>
        section(id, [], [], unresolvedGap(route)),
      ),
      timeline: [],
      gaps: [],
      grade: "UNKNOWN",
      evidenceCount: 0,
      uipId: input.uipId ?? null,
      generatedAt,
      empty: true,
    };
  }

  const related = ctx.related;
  const companies = rolesOf(related, "company");
  const containers = rolesOf(related, "container");
  const vessels = rolesOf(related, "vessel");
  const manifests = rolesOf(related, "manifest");
  const bols = rolesOf(related, "bill-of-lading");
  const items = rolesOf(related, "cargo-item");
  const commodities = rolesOf(related, "commodity");
  const ports = rolesOf(related, "port");
  const inspections = rolesOf(related, "inspection");
  const revenueNodes = rolesOf(related, "revenue");

  // Leakage findings scoped to entities that appear in this investigation.
  const inScope = new Set<string>([focus.id, ...related.map((r) => r.node.id)]);
  const scopedFindings = findings.filter((f) => inScope.has(f.subjectId));
  const leakage = scopedFindings.reduce((sum, f) => sum + f.magnitude, 0);
  const currency = scopedFindings[0]?.magnitudeCurrency ?? "NGN";

  const sections: CargoSection[] = [];

  /* 1 — Executive Summary */
  sections.push(
    section(
      "executive-summary",
      [
        `${CARGO_ROLE_LABEL[focus.role]} ${focus.label} is reconstructed from ${ctx.evidenceCount} evidence record${ctx.evidenceCount === 1 ? "" : "s"} across ${ctx.sources.length} source${ctx.sources.length === 1 ? "" : "s"}.`,
        `Weakest supporting grade across the chain is ${ctx.grade}; ${related.length} related entit${related.length === 1 ? "y" : "ies"} were discovered within four hops.`,
        scopedFindings.length > 0
          ? `${scopedFindings.length} revenue-leakage finding${scopedFindings.length === 1 ? "" : "s"} totalling ${fmtMoney(leakage, currency)} attach to this investigation.`
          : "No revenue-leakage finding attaches to any entity in this investigation.",
        ctx.gaps.length > 0
          ? `Chain gaps: ${ctx.gaps.map((g) => CARGO_ROLE_LABEL[g]).join(", ")}. These rungs carry no evidence and were not inferred.`
          : "Every rung of the cargo chain carries evidence.",
        `Routed as “${route.intent}”. ${route.resolution}`,
      ],
      [focus, ...related.map((r) => r.node)],
      null,
    ),
  );

  /* 2 — Cargo Timeline */
  sections.push(
    section(
      "cargo-timeline",
      ctx.timeline.map(
        (e) =>
          `${e.at.slice(0, 16).replace("T", " ")} — ${e.label}: ${e.description} (${e.grade}, ${e.sources.join(", ")})`,
      ),
      [focus, ...related.map((r) => r.node)],
      ctx.timeline.length === 0
        ? "No observation timestamps exist for this entity or its neighbours."
        : null,
    ),
  );

  /* 3 — Related Companies */
  sections.push(
    section(
      "related-companies",
      companies.map(
        (c) => `${c.node.label} — ${c.reason} (${c.hops} hop${c.hops === 1 ? "" : "s"}, ${c.grade})`,
      ),
      companies.map((c) => c.node),
      companies.length === 0
        ? "No shipper, consignee, carrier or declarant is evidenced for this entity."
        : null,
    ),
  );

  /* 4 — Related Containers */
  sections.push(
    section(
      "related-containers",
      containers.map(
        (c) =>
          `${c.node.label} — ${c.reason} (${c.hops} hop${c.hops === 1 ? "" : "s"}, ${c.grade})` +
          (c.node.attributes.sealNumber ? ` · seal ${String(c.node.attributes.sealNumber)}` : ""),
      ),
      containers.map((c) => c.node),
      containers.length === 0 ? "No container is evidenced against this entity." : null,
    ),
  );

  /* 5 — Manifest Summary */
  const manifestLines: string[] = [];
  for (const m of manifests) manifestLines.push(`Manifest ${m.node.label} — ${m.reason} (${m.grade})`);
  for (const b of bols) manifestLines.push(`Bill of Lading ${b.node.label} — ${b.reason} (${b.grade})`);
  if (items.length > 0)
    manifestLines.push(
      `${items.length} declared cargo item${items.length === 1 ? "" : "s"}: ${items.slice(0, 6).map((i) => i.node.label).join(", ")}.`,
    );
  if (commodities.length > 0)
    manifestLines.push(
      `Commodities declared: ${commodities.map((c) => c.node.label).join(", ")}.`,
    );
  sections.push(
    section(
      "manifest-summary",
      manifestLines,
      [...manifests, ...bols, ...items, ...commodities].map((n) => n.node),
      manifestLines.length === 0
        ? "No manifest or bill of lading is evidenced for this entity."
        : null,
    ),
  );

  /* 6 — Revenue Analysis */
  const revenueLines: string[] = scopedFindings.map(
    (f) =>
      `${f.headline} — ${fmtMoney(f.magnitude, f.magnitudeCurrency)} (${f.priority}, ${f.confidence}). ${f.explanation}`,
  );
  if (revenueNodes.length > 0)
    revenueLines.push(
      `Revenue assessments on record: ${revenueNodes.map((r) => r.node.label).join(", ")}.`,
    );
  if (scopedFindings.length > 0)
    revenueLines.push(
      `Total exposure across this investigation: ${fmtMoney(leakage, currency)}. Officer approval is required before any enforcement action.`,
    );
  sections.push(
    section(
      "revenue-analysis",
      revenueLines,
      revenueNodes.map((r) => r.node),
      revenueLines.length === 0
        ? "No revenue assessment or leakage finding attaches to this entity."
        : null,
      scopedFindings.length > 0
        ? scopedFindings.flatMap((f) =>
            f.citations.map((c) => ({
              evidenceId: c.evidenceId,
              source: c.source,
              observedAt: f.detectedAt,
              grade: c.grade,
            })),
          )
        : undefined,
    ),
  );

  /* 7 — Risk Assessment */
  const riskLines: string[] = [];
  const highPriority = scopedFindings.filter((f) => f.priority === "critical" || f.priority === "high");
  if (highPriority.length > 0)
    riskLines.push(
      `${highPriority.length} high or critical revenue finding${highPriority.length === 1 ? "" : "s"}: ${highPriority.map((f) => f.headline).join("; ")}.`,
    );
  const flagged = [focus, ...related.map((r) => r.node)].filter((n) =>
    ["sanctioned", "dangerousGoods", "flagged", "riskScore"].some(
      (k) => n.attributes[k] !== undefined && n.attributes[k] !== false,
    ),
  );
  for (const n of flagged)
    riskLines.push(
      `${CARGO_ROLE_LABEL[n.role]} ${n.label} carries risk attributes on the evidence record: ${Object.keys(n.attributes)
        .filter((k) => ["sanctioned", "dangerousGoods", "flagged", "riskScore"].includes(k))
        .join(", ")} (${n.grade}).`,
    );
  if (ctx.gaps.length > 0)
    riskLines.push(
      `Assessment is constrained: ${ctx.gaps.map((g) => CARGO_ROLE_LABEL[g]).join(", ")} carry no evidence, so risk here is incomplete rather than low.`,
    );
  if (ctx.grade === "INFERRED" || ctx.grade === "UNKNOWN")
    riskLines.push(
      `The weakest link in this chain is graded ${ctx.grade}; treat conclusions as provisional until corroborated.`,
    );
  sections.push(
    section(
      "risk-assessment",
      riskLines,
      flagged,
      riskLines.length === 0
        ? "No risk indicator is evidenced against this entity. Absence of a flag is not a clearance."
        : null,
    ),
  );

  /* 8 — Customs Intelligence */
  const customsLines: string[] = [];
  const declarations = related.filter((r) => r.node.id.startsWith("cargo:declaration:"));
  for (const d of declarations)
    customsLines.push(`Customs declaration ${d.node.label} — ${d.reason} (${d.grade}).`);
  for (const i of inspections)
    customsLines.push(`Inspection ${i.node.label} — ${i.reason} (${i.grade}).`);
  for (const p of ports)
    customsLines.push(`Port of record ${p.node.label} — ${p.reason} (${p.grade}).`);
  if (declarations.length === 0)
    customsLines.push("No customs declaration is evidenced for this cargo chain.");
  if (inspections.length === 0)
    customsLines.push("No inspection has been recorded against this cargo chain.");
  sections.push(
    section(
      "customs-intelligence",
      customsLines,
      [...declarations, ...inspections, ...ports].map((n) => n.node),
      declarations.length === 0 || inspections.length === 0
        ? "Customs picture is partial — declaration and/or inspection evidence is absent."
        : null,
    ),
  );

  /* 9 — AI Recommendations */
  const recommendations: string[] = [];
  if (scopedFindings.length > 0)
    recommendations.push(
      `Review the ${scopedFindings.length} revenue finding${scopedFindings.length === 1 ? "" : "s"} against the lodged declaration before releasing the consignment.`,
    );
  if (declarations.length === 0)
    recommendations.push(
      "Obtain the customs declaration for this chain — without it, duty exposure cannot be assessed.",
    );
  if (inspections.length === 0 && (highPriority.length > 0 || flagged.length > 0))
    recommendations.push(
      "Consider a physical inspection: risk indicators are present and no inspection has been recorded.",
    );
  if (containers.length > 0 && items.length === 0)
    recommendations.push(
      "Containers are evidenced but no cargo items are declared against them — request the item-level manifest.",
    );
  if (vessels.length > 0)
    recommendations.push(
      `Cross-check the carrying vessel${vessels.length === 1 ? "" : "s"} (${vessels.map((v) => v.node.label).join(", ")}) against ownership and sanctions intelligence.`,
    );
  if (recommendations.length === 0)
    recommendations.push(
      "The evidenced chain supports no specific recommendation. Acquire further cargo evidence before acting.",
    );
  recommendations.push("The system recommends; the officer decides.");
  sections.push(
    section("ai-recommendations", recommendations, [focus], null),
  );

  /* 10 — Next Best Actions */
  const actions: string[] = [
    `Open an investigation seeded with the ${ctx.evidenceCount} evidence record${ctx.evidenceCount === 1 ? "" : "s"} behind this dossier.`,
    ...ctx.gaps.slice(0, 3).map((g) => `Acquire ${CARGO_ROLE_LABEL[g]} evidence to close the chain gap.`),
  ];
  if (companies.length > 0)
    actions.push(`Run ownership and sanctions checks on ${companies[0].node.label}.`);
  if (scopedFindings.length > 0)
    actions.push("Escalate the revenue findings for officer approval before enforcement.");
  actions.push("Export this dossier into the compliance report for the case file.");
  sections.push(section("next-best-actions", actions, [focus], null));

  return {
    route,
    focus,
    context: ctx,
    sections,
    timeline: ctx.timeline,
    gaps: ctx.gaps,
    grade: ctx.grade,
    evidenceCount: ctx.evidenceCount,
    uipId: input.uipId ?? null,
    generatedAt,
    empty: false,
  };
}

function unresolvedGap(route: CargoRoute): string {
  return `${route.resolution} No cargo dossier can be produced without an entity evidenced in the Canonical UIP.`;
}
