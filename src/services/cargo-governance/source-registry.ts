/**
 * National Maritime Data Source Registry (GOV-02).
 *
 * The canonical classification of every evidence source Seaphore may consume
 * for Cargo Intelligence. This is governance metadata only — it declares what
 * a source is, what it may be trusted for, and when it should be integrated.
 * It never performs I/O and never selects a provider at runtime.
 */
import type { DataSourceRecord } from "./types";

export const NATIONAL_MARITIME_DATA_SOURCES: ReadonlyArray<DataSourceRecord> = [
  // ── Government ────────────────────────────────────────────────────────
  {
    id: "ncs-declarations",
    name: "NCS Declarations (NICIS II)",
    sourceClass: "GOVERNMENT",
    authority: "Nigeria Customs Service",
    jurisdiction: ["NG"],
    evidenceTypes: [
      "customs-declaration",
      "cargo-declaration",
      "revenue-assessment",
      "container-event",
    ],
    capabilities: ["CAPABILITY.CARGO", "CAPABILITY.REVENUE"],
    trustLevel: "AUTHORITY_OF_RECORD",
    coverage: {
      breadth: 0.95,
      depth: 0.9,
      note: "All formal import/export declarations lodged in Nigeria.",
    },
    updateFrequency: "EVENT_DRIVEN",
    priority: "P0",
    integrationStatus: "SPECIFIED",
    recommendedUsage:
      "Primary authority for declared cargo, HS classification and duty payable. Never override a declaration with a commercial estimate — surface the discrepancy instead.",
  },
  {
    id: "nimasa-returns",
    name: "NIMASA Returns",
    sourceClass: "GOVERNMENT",
    authority: "Nigerian Maritime Administration and Safety Agency",
    jurisdiction: ["NG"],
    evidenceTypes: ["manifest-return", "voyage-report", "port-clearance", "inspection-record"],
    capabilities: ["CAPABILITY.CARGO", "CAPABILITY.REVENUE", "CAPABILITY.COMPLIANCE"],
    trustLevel: "AUTHORITY_OF_RECORD",
    coverage: {
      breadth: 0.85,
      depth: 0.8,
      note: "Manifest returns and voyage reporting for Nigerian port calls.",
    },
    updateFrequency: "DAILY",
    priority: "P0",
    integrationStatus: "SPECIFIED",
    recommendedUsage:
      "Authoritative corroboration for declared manifests and levy exposure. Use to confirm or contradict customs declarations, not to replace them.",
  },

  // ── Commercial ────────────────────────────────────────────────────────
  {
    id: "importgenius",
    name: "ImportGenius",
    sourceClass: "COMMERCIAL",
    authority: "ImportGenius (commercial trade data aggregator)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["bill-of-lading", "shipment-record", "consignee-shipper-link"],
    capabilities: ["CAPABILITY.CARGO", "CAPABILITY.OWNERSHIP"],
    trustLevel: "VERIFIED_COMMERCIAL",
    coverage: {
      breadth: 0.6,
      depth: 0.7,
      note: "Bill-of-lading level shipment records for major trade lanes.",
    },
    updateFrequency: "WEEKLY",
    priority: "P1",
    integrationStatus: "NOT_STARTED",
    recommendedUsage:
      "Corroborating shipment evidence and counterparty discovery. Treat BoL fields as declared-by-carrier, not verified.",
  },
  {
    id: "volza",
    name: "Volza",
    sourceClass: "COMMERCIAL",
    authority: "Volza (commercial trade data aggregator)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["shipment-record", "trade-flow-statistic", "consignee-shipper-link"],
    capabilities: ["CAPABILITY.CARGO", "CAPABILITY.TRADE"],
    trustLevel: "AGGREGATED",
    coverage: { breadth: 0.55, depth: 0.6, note: "Aggregated import/export flows by HS code." },
    updateFrequency: "MONTHLY",
    priority: "P2",
    integrationStatus: "NOT_STARTED",
    recommendedUsage:
      "Trade-pattern context and volume baselines. Not admissible as the sole basis for a revenue finding.",
  },
  {
    id: "trademo",
    name: "TradeMo",
    sourceClass: "COMMERCIAL",
    authority: "TradeMo (commercial trade intelligence)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["shipment-record", "supply-chain-link"],
    capabilities: ["CAPABILITY.CARGO", "CAPABILITY.TRADE"],
    trustLevel: "AGGREGATED",
    coverage: { breadth: 0.5, depth: 0.55, note: "Supply-chain linkage across shipment records." },
    updateFrequency: "MONTHLY",
    priority: "P3",
    integrationStatus: "NOT_STARTED",
    recommendedUsage:
      "Secondary corroboration for counterparty networks. Lowest-weight commercial cargo source.",
  },
  {
    id: "marinetraffic",
    name: "MarineTraffic",
    sourceClass: "COMMERCIAL",
    authority: "MarineTraffic (commercial AIS provider)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["ais-position", "port-call", "voyage-track"],
    capabilities: ["CAPABILITY.VESSEL", "CAPABILITY.CARGO"],
    trustLevel: "VERIFIED_COMMERCIAL",
    coverage: { breadth: 0.75, depth: 0.7, note: "Terrestrial and satellite AIS with port calls." },
    updateFrequency: "REALTIME",
    priority: "P1",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Voyage corroboration for cargo movements — confirms the carrying vessel actually called the declared port.",
  },
  {
    id: "datalastic",
    name: "Datalastic",
    sourceClass: "COMMERCIAL",
    authority: "Datalastic (commercial AIS provider)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["ais-position", "voyage-track"],
    capabilities: ["CAPABILITY.VESSEL", "CAPABILITY.CARGO"],
    trustLevel: "VERIFIED_COMMERCIAL",
    coverage: { breadth: 0.7, depth: 0.6, note: "AIS positions and vessel particulars." },
    updateFrequency: "REALTIME",
    priority: "P2",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Redundant AIS path. Use for cross-source agreement on voyage evidence when MarineTraffic is degraded.",
  },

  // ── Supporting ────────────────────────────────────────────────────────
  {
    id: "equasis",
    name: "Equasis",
    sourceClass: "SUPPORTING",
    authority: "Equasis (EC / flag-state consortium)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["vessel-particulars", "ownership-record", "psc-inspection"],
    capabilities: ["CAPABILITY.VESSEL", "CAPABILITY.OWNERSHIP", "CAPABILITY.COMPLIANCE"],
    trustLevel: "REGULATORY",
    coverage: { breadth: 0.8, depth: 0.75, note: "Vessel particulars and registered ownership." },
    updateFrequency: "MONTHLY",
    priority: "P1",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Carrier identity and ownership support for cargo attribution. Not a cargo source in itself.",
  },
  {
    id: "opencorporates",
    name: "OpenCorporates",
    sourceClass: "SUPPORTING",
    authority: "OpenCorporates (registry aggregator)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["company-registration", "officer-record"],
    capabilities: ["CAPABILITY.OWNERSHIP", "CAPABILITY.CARGO"],
    trustLevel: "AGGREGATED",
    coverage: { breadth: 0.7, depth: 0.6, note: "Company registration data across jurisdictions." },
    updateFrequency: "WEEKLY",
    priority: "P1",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Importer/consignee verification. Registry snapshots may lag — always project the retrieval date.",
  },
  {
    id: "imo-gisis",
    name: "IMO GISIS",
    sourceClass: "SUPPORTING",
    authority: "International Maritime Organization",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["vessel-particulars", "company-imo-number", "casualty-record"],
    capabilities: ["CAPABILITY.VESSEL", "CAPABILITY.OWNERSHIP", "CAPABILITY.COMPLIANCE"],
    trustLevel: "REGULATORY",
    coverage: { breadth: 0.85, depth: 0.7, note: "Regulator-held vessel and company identifiers." },
    updateFrequency: "MONTHLY",
    priority: "P1",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Identity anchor for vessels and registered owners referenced by cargo evidence.",
  },
  {
    id: "ofac",
    name: "OFAC Sanctions",
    sourceClass: "SUPPORTING",
    authority: "US Department of the Treasury, OFAC",
    jurisdiction: ["US", "GLOBAL"],
    evidenceTypes: ["sanctions-designation"],
    capabilities: ["CAPABILITY.SANCTIONS", "CAPABILITY.COMPLIANCE", "CAPABILITY.CARGO"],
    trustLevel: "AUTHORITY_OF_RECORD",
    coverage: { breadth: 1, depth: 0.9, note: "Complete SDN and consolidated listings." },
    updateFrequency: "DAILY",
    priority: "P0",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Mandatory screening of cargo counterparties and carriers. A name match is a lead, never a determination.",
  },
  {
    id: "un-security-council",
    name: "UN Security Council Consolidated List",
    sourceClass: "SUPPORTING",
    authority: "United Nations Security Council",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["sanctions-designation"],
    capabilities: ["CAPABILITY.SANCTIONS", "CAPABILITY.COMPLIANCE", "CAPABILITY.CARGO"],
    trustLevel: "AUTHORITY_OF_RECORD",
    coverage: { breadth: 1, depth: 0.85, note: "UN consolidated designations." },
    updateFrequency: "WEEKLY",
    priority: "P0",
    integrationStatus: "INTEGRATED",
    recommendedUsage:
      "Mandatory screening alongside OFAC. Designations are binding; matching is probabilistic and must be officer-confirmed.",
  },

  // ── Derived ───────────────────────────────────────────────────────────
  {
    id: "global-fishing-watch",
    name: "Global Fishing Watch",
    sourceClass: "DERIVED",
    authority: "Global Fishing Watch (analytic non-profit)",
    jurisdiction: ["GLOBAL"],
    evidenceTypes: ["dark-event", "encounter-event", "loitering-event"],
    capabilities: ["CAPABILITY.VESSEL", "CAPABILITY.CARGO"],
    trustLevel: "DERIVED_ANALYTIC",
    coverage: {
      breadth: 0.45,
      depth: 0.65,
      note: "Modelled behaviour events derived from AIS and satellite inference.",
    },
    updateFrequency: "DAILY",
    priority: "P2",
    integrationStatus: "CREDENTIALS_PENDING",
    recommendedUsage:
      "Behavioural indicators (AIS gaps, STS encounters) that raise cargo questions. Derived — always labelled INFERRED and never presented as observed fact.",
  },
];

export function sourceById(id: string): DataSourceRecord | undefined {
  return NATIONAL_MARITIME_DATA_SOURCES.find((s) => s.id === id);
}

export function sourcesForCapability(capability: string): ReadonlyArray<DataSourceRecord> {
  return NATIONAL_MARITIME_DATA_SOURCES.filter((s) => s.capabilities.includes(capability));
}

export function sourcesByClass(sourceClass: DataSourceRecord["sourceClass"]) {
  return NATIONAL_MARITIME_DATA_SOURCES.filter((s) => s.sourceClass === sourceClass);
}
