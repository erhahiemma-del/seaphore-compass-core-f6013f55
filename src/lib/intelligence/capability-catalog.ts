/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT GOV-01 — Intelligence Capability Catalog
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Single source of truth for every intelligence capability in the
 *  Seaphore platform. Pure data — no runtime logic, no architecture
 *  changes, no imports from live services.
 *
 *  Every field is grounded in repository evidence:
 *    - evidenceProviders  → src/connectors/catalog.ts
 *    - uipProjections     → src/lib/projection-contract/registry.ts
 *    - dashboardSurfaces  → src/routes/*, src/features/*
 *    - dependencies       → verified from actual import graph
 *
 *  Status vocabulary:
 *    OPERATIONAL  — live code wired end-to-end, evidence-backed
 *    DESIGNING    — architecture defined, partial implementation
 *    PLANNED      — roadmap item, no implementation yet
 *
 *  Maturity vocabulary (1–5):
 *    1 — Concept only
 *    2 — Architecture defined
 *    3 — Core pipeline implemented
 *    4 — Fully wired, credential-blocked
 *    5 — Fully operational (live evidence, no blockers)
 * ─────────────────────────────────────────────────────────────────────
 */

export type CapabilityStatus = "OPERATIONAL" | "DESIGNING" | "PLANNED";
export type MaturityLevel = 1 | 2 | 3 | 4 | 5;
export type CapabilityDomain =
  | "vessel"
  | "cargo"
  | "revenue"
  | "risk"
  | "compliance"
  | "port"
  | "environmental"
  | "operational";

export interface CapabilityKpi {
  readonly label: string;
  readonly source: string;
  readonly unit?: string;
}

export interface CapabilityEntry {
  readonly id: string;
  readonly domain: CapabilityDomain;
  readonly name: string;
  readonly purpose: string;
  readonly status: CapabilityStatus;
  readonly maturity: MaturityLevel;
  readonly owner: string;

  /** Canonical entity types this capability produces evidence about. */
  readonly canonicalEntities: ReadonlyArray<string>;

  /** Evidence providers that feed this capability (connector IDs from catalog.ts). */
  readonly evidenceProviders: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly sprint: string;
    readonly credentialStatus: "OPERATIONAL" | "AWAITING_CREDENTIALS" | "PLANNED";
  }>;

  /** Canonical UIP projection contract IDs (from registry.ts). */
  readonly uipProjections: ReadonlyArray<string>;

  /** OIE outputs this capability drives. */
  readonly oieOutputs: ReadonlyArray<string>;

  /** Routes / components where this capability surfaces in the officer UI. */
  readonly dashboardSurfaces: ReadonlyArray<{
    readonly label: string;
    readonly route: string;
  }>;

  /** Copilot features enabled by this capability. */
  readonly copilotFeatures: ReadonlyArray<string>;

  /** Officer-facing KPIs produced by this capability. */
  readonly kpis: ReadonlyArray<CapabilityKpi>;

  /** Capability IDs this capability depends on. */
  readonly dependencies: ReadonlyArray<string>;

  /** Known blockers preventing full operationalisation. */
  readonly blockers: ReadonlyArray<string>;

  /** Date of last catalog review. */
  readonly reviewedAt: string;
}

const REVIEWED = "2026-07-27";

export const CAPABILITY_CATALOG: ReadonlyArray<CapabilityEntry> = [
  // ─────────────────────────────────────────────────────────────────
  //  1. VESSEL INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.vessel-intelligence",
    domain: "vessel",
    name: "Vessel Intelligence",
    purpose:
      "Acquire, fuse and project authoritative vessel identity, ownership, position, and behavioural evidence. " +
      "Enables officers to answer: Who owns this vessel? Where is it? Has it behaved anomalously? " +
      "Is it sanctioned? Every claim is evidence-backed and graded.",
    status: "OPERATIONAL",
    maturity: 4,
    owner: "Intelligence Acquisition Layer (IAL) / IFE",
    canonicalEntities: ["vessel", "company", "person", "port"],
    evidenceProviders: [
      { id: "equasis", name: "Equasis", sprint: "EP-03", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "imo-gisis", name: "IMO GISIS", sprint: "EP-04", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "global-fishing-watch", name: "Global Fishing Watch", sprint: "EP-06", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "ofac", name: "US Treasury OFAC (SDN)", sprint: "EP-07", credentialStatus: "OPERATIONAL" },
      { id: "un-security-council", name: "UN Security Council", sprint: "EP-08", credentialStatus: "OPERATIONAL" },
      { id: "open-sanctions", name: "OpenSanctions", sprint: "EP-01", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "copernicus-cdse", name: "Copernicus CDSE", sprint: "EP-COPERNICUS-01", credentialStatus: "AWAITING_CREDENTIALS" },
    ],
    uipProjections: [
      "ial.equasis-evidence-provider",
      "ial.imo-gisis-evidence-provider",
      "ial.gfw-vessel-evidence",
      "ial.gfw-movement-history",
      "ial.ofac-evidence-provider",
      "ial.un-security-council-evidence-provider",
      "ial.opensanctions-evidence-provider",
      "capability.identity-confidence",
      "capability.maritime-knowledge-graph",
    ],
    oieOutputs: [
      "Vessel risk assessment (8-section OIE brief)",
      "Ownership investigation playbook output",
      "Voyage comparison analysis",
      "Sanctions screening assessment",
      "AIS dark-activity pattern detection (OKL)",
    ],
    dashboardSurfaces: [
      { label: "Vessel Intelligence Centre", route: "/vessel" },
      { label: "Ownership Network Graph", route: "/ownership" },
      { label: "Entity Profile", route: "/entity/:id" },
      { label: "Knowledge Graph", route: "/knowledge-graph" },
      { label: "Copilot Workspace", route: "/copilot" },
    ],
    copilotFeatures: [
      "Vessel risk assessment on bare entity mention (UX-001)",
      "Pronoun resolution (who owns it? → carries vessel anchor)",
      "Ownership investigation playbook",
      "Sanctions screening via OpenSanctions capability",
      "AIS gap and dark-activity explanation",
    ],
    kpis: [
      { label: "Vessels tracked", source: "IAL / UIP rawEvidence", unit: "count" },
      { label: "Identity confidence score", source: "IFE packageConfidence", unit: "0–1" },
      { label: "Sanctions hits", source: "OpenSanctions / OFAC / UNSC", unit: "count" },
      { label: "Ownership depth", source: "MKG traversal", unit: "hops" },
      { label: "AIS gap events", source: "GFW movement evidence", unit: "count" },
    ],
    dependencies: [],
    blockers: [
      "EQUASIS_USERNAME + EQUASIS_PASSWORD not configured",
      "IMO_GISIS_API_TOKEN not configured",
      "GFW_API_TOKEN not configured",
      "OPENSANCTIONS_API_KEY not configured",
      "COPERNICUS_USERNAME + COPERNICUS_PASSWORD not configured",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  2. CARGO INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.cargo-intelligence",
    domain: "cargo",
    name: "Cargo Intelligence",
    purpose:
      "Acquire and project cargo declarations, HS codes, container movements, bill-of-lading chains, " +
      "and declared-vs-actual mismatches from the authority of record (NCS/NICIS II). " +
      "Enables manifest correlation, misclassification detection, and duty exposure calculation.",
    status: "OPERATIONAL",
    maturity: 3,
    owner: "Cargo Intelligence Capability (CAP-02, EP-CARGO-01)",
    canonicalEntities: ["cargo", "vessel", "company", "port"],
    evidenceProviders: [
      { id: "ncs-customs", name: "NCS Customs (NICIS II)", sprint: "EP-CARGO-01", credentialStatus: "AWAITING_CREDENTIALS" },
    ],
    uipProjections: [
      "cargo.workspace.manifest",
      "cargo.workspace.container",
      "cargo.workspace.cargo",
      "cargo.workspace.trade",
      "cargo.workspace.revenue",
      "cargo.workspace.risk",
      "cargo.copilot.routing",
      "cargo.copilot.dossier",
      "cargo.copilot.sticky-focus",
      "cargo.graph.build",
      "cargo.graph.facade",
      "cargo.graph.investigation-context",
    ],
    oieOutputs: [
      "Cargo investigation playbook (10-section dossier)",
      "Manifest intelligence playbook",
      "Revenue leakage findings (scanForLeakage)",
      "HS code mismatch detection",
      "Container chain investigation context",
    ],
    dashboardSurfaces: [
      { label: "Cargo Intelligence Centre", route: "/cargo" },
      { label: "Manifest Intelligence Centre", route: "/manifest" },
      { label: "Cargo Workspace — Manifest", route: "/cargo-workspace/manifest" },
      { label: "Cargo Workspace — Container", route: "/cargo-workspace/container" },
      { label: "Cargo Workspace — Cargo", route: "/cargo-workspace/cargo" },
      { label: "Cargo Workspace — Trade", route: "/cargo-workspace/trade" },
      { label: "Cargo Knowledge Graph", route: "/cargo-workspace/cargo" },
    ],
    copilotFeatures: [
      "Cargo Truth Engine — 7 routing intents (container lookup, HS code, manifest, revenue, trade lane, entity, DG)",
      "10-section cargo dossier with evidence citations",
      "Sticky focus carry-forward across turns",
      "Revenue leakage recommendations from NCS evidence",
      "DG flag detection and escalation",
    ],
    kpis: [
      { label: "Manifest records", source: "NCS / Canonical UIP cargo evidence", unit: "count" },
      { label: "Distinct HS codes", source: "cargo evidence fields.hsCode", unit: "count" },
      { label: "Dangerous goods flags", source: "cargo evidence fields.dangerousGoods", unit: "count" },
      { label: "Declared vs actual mismatches", source: "tonnage discrepancy detector", unit: "count" },
      { label: "Containers tracked", source: "distinct containerNumber in evidence", unit: "count" },
    ],
    dependencies: ["cap.vessel-intelligence"],
    blockers: [
      "NCS_CUSTOMS_API_BASE_URL not configured",
      "NCS_CUSTOMS_API_TOKEN not configured",
      "Formal NCS/NICIS II API engagement required (government procurement)",
      "NcsCustomsProvider.id bug: id='customs' should be 'ncs-customs' (2-min fix)",
      "NcsCustomsProvider.projectionContractId bug: 'capability.cargo' not in registry (2-min fix)",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  3. REVENUE INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.revenue-intelligence",
    domain: "revenue",
    name: "Revenue Intelligence",
    purpose:
      "Detect and quantify government revenue leakage: manifest under-declaration, unpaid port fees, " +
      "cargo under-valuation, movement mismatches, and compliance-linked fee bypasses. " +
      "Every finding carries magnitude, confidence, factors, citations, and requires officer approval " +
      "before enforcement action.",
    status: "OPERATIONAL",
    maturity: 3,
    owner: "Revenue Leakage Detection Engine (Sprint 1G)",
    canonicalEntities: ["cargo", "company", "vessel", "port"],
    evidenceProviders: [
      { id: "ncs-customs", name: "NCS Customs (NICIS II)", sprint: "EP-CARGO-01", credentialStatus: "AWAITING_CREDENTIALS" },
    ],
    uipProjections: [
      "capability.revenue-leakage-detection",
      "cargo.workspace.revenue",
      "mig.dashboard-manifest-projection",
    ],
    oieOutputs: [
      "Revenue leakage playbook findings",
      "Leakage category breakdown (manifest-under-declaration, unpaid-port-fee, cargo-under-value, movement-mismatch, compliance-bypass)",
      "Top companies by revenue at risk",
      "Port-level leakage heatmap",
    ],
    dashboardSurfaces: [
      { label: "Revenue Intelligence Centre", route: "/revenue" },
      { label: "Cargo Workspace — Revenue", route: "/cargo-workspace/revenue" },
      { label: "Revenue Leakage Route", route: "/revenue-leakage" },
    ],
    copilotFeatures: [
      "Revenue Assurance Copilot",
      "Leakage finding magnitude and citation display",
      "Officer-approval gate before enforcement recommendation",
      "Top leakage port and company identification",
    ],
    kpis: [
      { label: "Leakage findings", source: "scanForLeakage(uip.rawEvidence)", unit: "count" },
      { label: "Estimated exposure", source: "findings.reduce(s + magnitude)", unit: "NGN" },
      { label: "High/critical findings", source: "findings.filter(priority=critical|high)", unit: "count" },
      { label: "Officer-approved actions", source: "findings.filter(humanApproved)", unit: "count" },
    ],
    dependencies: ["cap.cargo-intelligence"],
    blockers: [
      "All cargo intelligence blockers apply (NCS credentials + provider bugs)",
      "Revenue figures are projected from live NCS evidence — no mock data path",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  4. RISK INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.risk-intelligence",
    domain: "risk",
    name: "Risk Intelligence",
    purpose:
      "Compute composite risk scores from multi-source fused evidence and project them as " +
      "actionable operational patterns. Covers: AIS dark-activity, sanctions proximity, " +
      "ownership opacity, cargo misclassification risk, and port congestion anomalies. " +
      "OKL produces explainable patterns with confidence pyramids; OSAE scores operational priority.",
    status: "OPERATIONAL",
    maturity: 4,
    owner: "Operational Knowledge Layer (OKL) / OSAE / PIE",
    canonicalEntities: ["vessel", "company", "cargo", "port"],
    evidenceProviders: [
      { id: "open-sanctions", name: "OpenSanctions", sprint: "EP-01", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "ofac", name: "US Treasury OFAC", sprint: "EP-07", credentialStatus: "OPERATIONAL" },
      { id: "un-security-council", name: "UN Security Council", sprint: "EP-08", credentialStatus: "OPERATIONAL" },
      { id: "global-fishing-watch", name: "Global Fishing Watch", sprint: "EP-06", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "copernicus-cdse", name: "Copernicus CDSE", sprint: "EP-COPERNICUS-01", credentialStatus: "AWAITING_CREDENTIALS" },
    ],
    uipProjections: [
      "capability.osae-assessment",
      "capability.predictive-intelligence-engine",
      "capability.operational-knowledge-layer",
      "capability.national-maritime-risk",
      "reasoning.confidence-composite",
      "reasoning.alternative-explanations",
    ],
    oieOutputs: [
      "Vessel risk assessment (8-section brief)",
      "OKL operational patterns with Confidence Pyramid",
      "PIE predictions: AIS behaviour forecast, sanctions proximity, ownership churn",
      "National maritime risk dashboard",
      "OSAE priority queue (severity-ranked)",
    ],
    dashboardSurfaces: [
      { label: "National Risk Dashboard", route: "/national-risk" },
      { label: "Predictions Engine", route: "/predictions" },
      { label: "Operational Knowledge Surface", route: "/operational-knowledge" },
      { label: "Decision Support", route: "/decide" },
      { label: "Detect Surface", route: "/detect" },
    ],
    copilotFeatures: [
      "Risk assessment on any vessel/company/cargo query",
      "OKL pattern explanation with Confidence Pyramid",
      "PIE factor breakdown and alternative hypotheses",
      "Decision support (officer approves, system recommends)",
    ],
    kpis: [
      { label: "Active risk scores", source: "Supabase risk_scores table", unit: "count" },
      { label: "Average risk composite", source: "mean(risk_scores.score)", unit: "0–1" },
      { label: "High-risk entities", source: "OKL pattern classification", unit: "count" },
      { label: "PIE predictions active", source: "PIE prediction store", unit: "count" },
    ],
    dependencies: ["cap.vessel-intelligence", "cap.cargo-intelligence"],
    blockers: [
      "OPENSANCTIONS_API_KEY not configured (sanctions proximity incomplete)",
      "GFW_API_TOKEN not configured (AIS behaviour detection incomplete)",
      "COPERNICUS credentials not configured (SAR corroboration unavailable)",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  5. COMPLIANCE INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.compliance-intelligence",
    domain: "compliance",
    name: "Compliance Intelligence",
    purpose:
      "Monitor regulatory compliance: ISM certificates, vessel inspection records, port state control " +
      "detentions, SOLAS requirements, MARPOL status, and sanctions programme adherence. " +
      "Surfaces compliance gaps before a vessel enters Nigerian waters.",
    status: "DESIGNING",
    maturity: 3,
    owner: "Compliance Engine (Sprint COMP-01, planned)",
    canonicalEntities: ["vessel", "company", "port"],
    evidenceProviders: [
      { id: "equasis", name: "Equasis (ISM, class, PSC)", sprint: "EP-03", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "imo-gisis", name: "IMO GISIS (certificates)", sprint: "EP-04", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "open-sanctions", name: "OpenSanctions (sanctions programme)", sprint: "EP-01", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "ofac", name: "OFAC (US sanctions)", sprint: "EP-07", credentialStatus: "OPERATIONAL" },
    ],
    uipProjections: [
      "capability.sanctions-hits",
      "capability.screening-run-history",
      "compliance.report-metadata",
      "compliance.audit-log-row",
    ],
    oieOutputs: [
      "Compliance review playbook (holds clearance on expired mandatory certificates)",
      "Certificate expiry alerts",
      "Sanctions programme compliance assessment",
      "PSC detention history analysis",
    ],
    dashboardSurfaces: [
      { label: "Compliance Intelligence Centre", route: "/compliance" },
    ],
    copilotFeatures: [
      "Compliance review playbook trigger",
      "Certificate expiry explanation",
      "Sanctions programme attribution",
    ],
    kpis: [
      { label: "Vessels with expired certificates", source: "Equasis / IMO GISIS evidence", unit: "count" },
      { label: "Active sanctions screenings", source: "OpenSanctions / OFAC / UNSC", unit: "count" },
      { label: "Compliance exceptions", source: "Compliance playbook output", unit: "count" },
    ],
    dependencies: ["cap.vessel-intelligence"],
    blockers: [
      "EQUASIS_USERNAME + EQUASIS_PASSWORD not configured",
      "IMO_GISIS_API_TOKEN not configured",
      "OPENSANCTIONS_API_KEY not configured",
      "Compliance route uses intel-centre-data.ts mock data — not yet migrated to UIP",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  6. PORT INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.port-intelligence",
    domain: "port",
    name: "Port Intelligence",
    purpose:
      "Monitor Nigerian port operations: vessel traffic, berth utilisation, port-call attribution, " +
      "anchorage zone monitoring, congestion indices, and gate event tracking. " +
      "Integrates satellite SAR imagery from Copernicus for anchorage-zone vessel detection " +
      "independent of AIS.",
    status: "DESIGNING",
    maturity: 3,
    owner: "Port Operations Intelligence (Sprint PORT-01, in design)",
    canonicalEntities: ["port", "vessel", "cargo"],
    evidenceProviders: [
      { id: "global-fishing-watch", name: "GFW (port visits)", sprint: "EP-06", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "copernicus-cdse", name: "Copernicus CDSE (SAR anchorage)", sprint: "EP-COPERNICUS-01", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "environmental-intelligence", name: "Environmental Intelligence", sprint: "EP-05", credentialStatus: "OPERATIONAL" },
    ],
    uipProjections: [
      "ial.copernicus-cdse-evidence-provider",
      "ial.gfw-movement-history",
      "ial.environmental-intelligence-provider",
      "cargo.workspace.manifest",
    ],
    oieOutputs: [
      "Port intelligence playbook (enhanced monitoring for high-risk port arrivals)",
      "Anchorage zone vessel count from SAR",
      "Port congestion index",
      "Vessel ETA and departure tracking",
    ],
    dashboardSurfaces: [
      { label: "Port Operations Centre", route: "/ports" },
      { label: "Manifest Intelligence (arrival timeline)", route: "/manifest" },
    ],
    copilotFeatures: [
      "Port intelligence playbook trigger",
      "SAR-based vessel detection explanation (Copernicus evidence)",
      "Port congestion advisory",
    ],
    kpis: [
      { label: "Vessels at anchorage (SAR)", source: "Copernicus CDSE evidence", unit: "count" },
      { label: "Port congestion index", source: "intel-centre-data (placeholder)", unit: "0–100" },
      { label: "ETA arrivals today", source: "GFW port visits / manifest evidence", unit: "count" },
    ],
    dependencies: ["cap.vessel-intelligence"],
    blockers: [
      "GFW_API_TOKEN not configured",
      "COPERNICUS_USERNAME + COPERNICUS_PASSWORD not configured",
      "Ports route (/ports) uses intel-centre-data.ts mock data — pending UIP migration",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  7. ENVIRONMENTAL INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.environmental-intelligence",
    domain: "environmental",
    name: "Environmental Intelligence",
    purpose:
      "Provide OBSERVED environmental observations (wave height, wind, SST, visibility) from a " +
      "multi-source adapter architecture (Open-Meteo Marine as Source 1; NOAA, Copernicus, ECMWF " +
      "as future adapters). Evidence is observation only — no sea state interpretation, " +
      "no risk scoring. Interpretation belongs to the IFE/OIE layers.",
    status: "OPERATIONAL",
    maturity: 5,
    owner: "Environmental Intelligence Provider (Sprint EP-05)",
    canonicalEntities: ["port", "vessel"],
    evidenceProviders: [
      { id: "environmental-intelligence", name: "Environmental Intelligence (Open-Meteo)", sprint: "EP-05", credentialStatus: "OPERATIONAL" },
      { id: "copernicus-cdse", name: "Copernicus CDSE (satellite)", sprint: "EP-COPERNICUS-01", credentialStatus: "AWAITING_CREDENTIALS" },
    ],
    uipProjections: [
      "ial.environmental-intelligence-provider",
      "ial.copernicus-cdse-evidence-provider",
    ],
    oieOutputs: [
      "Environmental context for vessel risk assessment",
      "Voyage route weather window analysis",
      "Anchorage zone sea state observation",
      "Satellite scene metadata for anchorage monitoring",
    ],
    dashboardSurfaces: [
      { label: "Copilot Workspace (environmental context)", route: "/copilot" },
      { label: "Evidence Provenance Panel", route: "/intelligence-evidence" },
    ],
    copilotFeatures: [
      "Environmental observation citation in OIE briefs",
      "Sea state evidence in voyage comparison playbook",
      "SAR imagery metadata for anchorage zone analysis (Copernicus)",
    ],
    kpis: [
      { label: "Environmental observations acquired", source: "Open-Meteo Marine API (keyless)", unit: "count/hour" },
      { label: "Satellite scenes indexed", source: "Copernicus CDSE STAC", unit: "count/day" },
      { label: "Cache hit rate", source: "EvidenceCache TTL=1h", unit: "%" },
    ],
    dependencies: [],
    blockers: [
      "COPERNICUS_USERNAME + COPERNICUS_PASSWORD required for Sentinel imagery (core provider works without them)",
    ],
    reviewedAt: REVIEWED,
  },

  // ─────────────────────────────────────────────────────────────────
  //  8. OPERATIONAL INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────
  {
    id: "cap.operational-intelligence",
    domain: "operational",
    name: "Operational Intelligence",
    purpose:
      "Orchestrate the full officer intelligence cycle: receive query → acquire evidence → fuse → " +
      "generate briefing → surface via Copilot → produce MIBC report. " +
      "The OIE (8 modules, 8 playbooks), OKL (explainable patterns), and MIBC (PDF/DOCX/XLSX/PPTX) " +
      "form the complete operational intelligence delivery chain.",
    status: "OPERATIONAL",
    maturity: 4,
    owner: "OIE / OKL / MIBC Pipeline",
    canonicalEntities: ["vessel", "company", "cargo", "port", "voyage"],
    evidenceProviders: [
      { id: "open-sanctions", name: "OpenSanctions (primary SANCTIONS)", sprint: "EP-01", credentialStatus: "AWAITING_CREDENTIALS" },
      { id: "ofac", name: "OFAC (corroborating)", sprint: "EP-07", credentialStatus: "OPERATIONAL" },
      { id: "un-security-council", name: "UNSC (corroborating)", sprint: "EP-08", credentialStatus: "OPERATIONAL" },
      { id: "environmental-intelligence", name: "Environmental Intelligence", sprint: "EP-05", credentialStatus: "OPERATIONAL" },
    ],
    uipProjections: [
      "oie.eight-section-brief",
      "oie.query-interpretation",
      "oie.raw-prompt",
      "capability.unified-intelligence-package",
      "capability.operational-knowledge-layer",
      "capability.maritime-intelligence-briefing-centre",
      "capability.maritime-investigation-workspace",
      "capability.mission-planning",
      "capability.investigation-workflows",
      "capability.investigation-mission-bridge",
      "capability.mibc-background-scheduler",
      "copilot.command-registry",
      "copilot.executive-brief",
    ],
    oieOutputs: [
      "8-section operational brief (executive summary, situation overview, key findings, operational impact, recommendations, information gaps, next questions, confidence explanation)",
      "8 playbooks: cargo-investigation, manifest-investigation, revenue-leakage, port-intelligence, vessel-risk-assessment, ownership-investigation, compliance-review, voyage-comparison",
      "OKL patterns: repeat offender, suspicious routing, dark AIS, ownership networks, cargo anomalies, sanctions exposure",
      "MIBC reports: PDF, DOCX, XLSX, PPTX with Supabase storage upload",
      "Mission planning and investigation workflow bridge",
    ],
    dashboardSurfaces: [
      { label: "Copilot Workspace", route: "/copilot" },
      { label: "Investigation Workspace", route: "/workspace/:id" },
      { label: "Briefing Centre (MIBC)", route: "/briefing-centre" },
      { label: "Operational Knowledge", route: "/operational-knowledge" },
      { label: "Investigations", route: "/investigations" },
      { label: "Missions", route: "/missions" },
      { label: "Intelligence Evidence", route: "/intelligence-evidence" },
      { label: "Decision Support", route: "/decide" },
    ],
    copilotFeatures: [
      "First-turn briefing with no clarification card on bare entity mention",
      "Conversational context carry-forward (sticky entity anchor)",
      "Pronoun resolution across turns",
      "All 8 OIE playbooks triggered by query classification",
      "Cargo Truth Engine — 7 routing intents, 10-section dossier",
      "OKL Patterns Panel with Confidence Pyramid",
      "MIBC report generation from copilot briefing",
    ],
    kpis: [
      { label: "OIE queries processed", source: "runOIEFn server function", unit: "count" },
      { label: "Briefings generated", source: "MIBC engine", unit: "count" },
      { label: "Confidence composite (mean)", source: "IFE packageConfidence", unit: "0–1" },
      { label: "Playbooks triggered", source: "OIE planner skill selection", unit: "count/session" },
      { label: "Reports exported", source: "MIBC exportReport() / job-drainer", unit: "count" },
    ],
    dependencies: [
      "cap.vessel-intelligence",
      "cap.cargo-intelligence",
      "cap.revenue-intelligence",
      "cap.risk-intelligence",
      "cap.environmental-intelligence",
    ],
    blockers: [
      "LOVABLE_API_KEY required for live Gemini/GPT reasoning (injected by Lovable Cloud at runtime; absent locally — uses deterministic fallback)",
      "OPENSANCTIONS_API_KEY required for full sanctions playbook",
    ],
    reviewedAt: REVIEWED,
  },
];

// ─────────────────────────────────────────────────────────────────────
//  DEPENDENCY MATRIX
// ─────────────────────────────────────────────────────────────────────

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: "requires" | "enhances";
}

export const DEPENDENCY_MATRIX: ReadonlyArray<DependencyEdge> = CAPABILITY_CATALOG.flatMap(
  (cap) =>
    cap.dependencies.map((dep) => ({
      from: cap.id,
      to: dep,
      kind: "requires" as const,
    })),
);

// ─────────────────────────────────────────────────────────────────────
//  CATALOG ACCESSORS
// ─────────────────────────────────────────────────────────────────────

export function getCapability(id: string): CapabilityEntry | undefined {
  return CAPABILITY_CATALOG.find((c) => c.id === id);
}

export function capabilitiesByStatus(status: CapabilityStatus): ReadonlyArray<CapabilityEntry> {
  return CAPABILITY_CATALOG.filter((c) => c.status === status);
}

export function capabilitiesByDomain(domain: CapabilityDomain): ReadonlyArray<CapabilityEntry> {
  return CAPABILITY_CATALOG.filter((c) => c.domain === domain);
}

export function catalogSummary() {
  const total = CAPABILITY_CATALOG.length;
  const operational = CAPABILITY_CATALOG.filter((c) => c.status === "OPERATIONAL").length;
  const designing = CAPABILITY_CATALOG.filter((c) => c.status === "DESIGNING").length;
  const planned = CAPABILITY_CATALOG.filter((c) => c.status === "PLANNED").length;
  const avgMaturity =
    Math.round(
      (CAPABILITY_CATALOG.reduce((s, c) => s + c.maturity, 0) / total) * 10,
    ) / 10;
  const totalBlockers = CAPABILITY_CATALOG.reduce((s, c) => s + c.blockers.length, 0);
  const totalProviders = new Set(
    CAPABILITY_CATALOG.flatMap((c) => c.evidenceProviders.map((p) => p.id)),
  ).size;
  const operationalProviders = CAPABILITY_CATALOG.flatMap((c) =>
    c.evidenceProviders.filter((p) => p.credentialStatus === "OPERATIONAL"),
  ).length;
  return {
    total,
    operational,
    designing,
    planned,
    avgMaturity,
    totalBlockers,
    totalProviders,
    operationalProviders,
  };
}
