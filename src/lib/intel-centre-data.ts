/**
 * Intelligence Centre DEMO fixtures.
 *
 * One invented dataset so vessels, IMOs, MMSIs, ports, companies, cargo
 * and revenue line up across every centre. None of it came from a
 * provider. Replace with real Supabase queries when the data foundation
 * goes live — the component shapes are stable.
 *
 * ## Confidence never exceeds `unconfirmed`
 *
 * `observed` is documented as "directly observed / measured" and
 * `verified` as "confirmed by authoritative source". No value here was
 * either, so neither tier may appear in this file. Surfaces rendering it
 * carry `DemoDataNotice`.
 */
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";

export type RiskLevel = "high" | "medium" | "low" | "unknown";
export type ManifestStatus = "validated" | "pending" | "duplicate" | "amended";
export type AlertSeverity = "high" | "medium" | "low" | "info";
export type AlertStatus = "NEW" | "ACK" | "RESOLVED";

export interface Port {
  code: "APP" | "TCT" | "ONN" | "PHC" | "CAL";
  name: string;
  city: string;
  /** rough lat/lng — used for SVG projection, not navigation. */
  lat: number;
  lng: number;
  /** relative x/y (0..1) on our stylised Nigerian coast map. */
  x: number;
  y: number;
  congestionIndex: number; // 0..100
  avgWaitHours: number;
  avgClearanceHours: number;
  todaysEta: number;
  todaysDeparture: number;
}

export const PORTS: Port[] = [
  {
    code: "APP",
    name: "Apapa Port",
    city: "Lagos",
    lat: 6.44,
    lng: 3.36,
    x: 0.18,
    y: 0.72,
    congestionIndex: 82,
    avgWaitHours: 41,
    avgClearanceHours: 96,
    todaysEta: 12,
    todaysDeparture: 9,
  },
  {
    code: "TCT",
    name: "Tin Can Island",
    city: "Lagos",
    lat: 6.42,
    lng: 3.34,
    x: 0.22,
    y: 0.76,
    congestionIndex: 74,
    avgWaitHours: 33,
    avgClearanceHours: 82,
    todaysEta: 9,
    todaysDeparture: 8,
  },
  {
    code: "ONN",
    name: "Onne Port",
    city: "Rivers",
    lat: 4.72,
    lng: 7.15,
    x: 0.58,
    y: 0.68,
    congestionIndex: 55,
    avgWaitHours: 22,
    avgClearanceHours: 61,
    todaysEta: 7,
    todaysDeparture: 6,
  },
  {
    code: "PHC",
    name: "Port Harcourt",
    city: "Rivers",
    lat: 4.77,
    lng: 7.01,
    x: 0.62,
    y: 0.62,
    congestionIndex: 47,
    avgWaitHours: 18,
    avgClearanceHours: 54,
    todaysEta: 5,
    todaysDeparture: 5,
  },
  {
    code: "CAL",
    name: "Calabar Port",
    city: "Cross River",
    lat: 4.95,
    lng: 8.32,
    x: 0.82,
    y: 0.58,
    congestionIndex: 31,
    avgWaitHours: 11,
    avgClearanceHours: 42,
    todaysEta: 3,
    todaysDeparture: 4,
  },
];

export interface Company {
  id: string;
  name: string;
  role: "Owner" | "Operator" | "Manager" | "Beneficial Owner" | "Agent" | "Insurer";
  country: string;
  cacNumber?: string;
  verified: ConfidenceTier;
}

export const COMPANIES: Company[] = [
  {
    id: "co-oceanline",
    name: "OceanLine Shipping SA",
    role: "Owner",
    country: "Panama",
    verified: "verified",
  },
  {
    id: "co-delta",
    name: "Delta Freight Ltd",
    role: "Operator",
    country: "Nigeria",
    cacNumber: "RC-482911",
    verified: "verified",
  },
  {
    id: "co-gulfmar",
    name: "GulfMarine Holdings",
    role: "Manager",
    country: "UAE",
    verified: "observed",
  },
  {
    id: "co-sahara",
    name: "Sahara Cargo Nigeria",
    role: "Agent",
    country: "Nigeria",
    cacNumber: "RC-611280",
    verified: "verified",
  },
  {
    id: "co-trident",
    name: "Trident Maritime Group",
    role: "Beneficial Owner",
    country: "Cyprus",
    verified: "inferred",
  },
  {
    id: "co-northstar",
    name: "Northstar Bulk Carriers",
    role: "Owner",
    country: "Liberia",
    verified: "observed",
  },
  {
    id: "co-atlaslog",
    name: "Atlas Logistics Nigeria",
    role: "Agent",
    country: "Nigeria",
    cacNumber: "RC-702445",
    verified: "verified",
  },
];

export interface Vessel {
  id: string;
  name: string;
  imo: string;
  mmsi: string;
  type: "Container" | "Tanker" | "Bulk Carrier" | "General Cargo" | "RoRo";
  flag: string;
  ownerId: string;
  operatorId: string;
  managerId: string;
  insurerId?: string;
  classSociety: string;
  yearBuilt: number;
  gt: number; // gross tonnage
  dwt: number;
  destinationPort: Port["code"];
  originPort: string;
  originCountry: string;
  status: ManifestStatus;
  riskScore: number; // 0..100
  riskLevel: RiskLevel;
  etaISO: string; // ISO datetime today
  agent: string;
  voyage: string;
  sanctionsHit: boolean;
  aisBlackoutHours: number;
  pscInspections: {
    date: string;
    port: string;
    deficiencies: number;
    result: "Passed" | "Detained" | "Deficiencies";
  }[];
}

const TODAY = new Date();
const iso = (h: number) => {
  const d = new Date(TODAY);
  d.setHours(h, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
};

export const VESSELS: Vessel[] = [
  {
    id: "v-ocean-pearl",
    name: "MV Ocean Pearl",
    imo: "9438291",
    mmsi: "657123400",
    type: "Container",
    flag: "Panama",
    ownerId: "co-oceanline",
    operatorId: "co-delta",
    managerId: "co-gulfmar",
    insurerId: "co-trident",
    classSociety: "DNV",
    yearBuilt: 2014,
    gt: 41200,
    dwt: 52300,
    destinationPort: "APP",
    originPort: "Rotterdam",
    originCountry: "Netherlands",
    status: "pending",
    riskScore: 78,
    riskLevel: "high",
    etaISO: iso(9),
    agent: "Sahara Cargo Nigeria",
    voyage: "OP-2412",
    sanctionsHit: false,
    aisBlackoutHours: 6.2,
    pscInspections: [
      { date: "2026-03-04", port: "Rotterdam", deficiencies: 2, result: "Deficiencies" },
      { date: "2025-11-19", port: "Algeciras", deficiencies: 0, result: "Passed" },
    ],
  },
  {
    id: "v-gulf-trader",
    name: "MT Gulf Trader",
    imo: "9612104",
    mmsi: "657204811",
    type: "Tanker",
    flag: "Liberia",
    ownerId: "co-northstar",
    operatorId: "co-gulfmar",
    managerId: "co-gulfmar",
    classSociety: "ABS",
    yearBuilt: 2017,
    gt: 58400,
    dwt: 74100,
    destinationPort: "PHC",
    originPort: "Rotterdam",
    originCountry: "Netherlands",
    status: "validated",
    riskScore: 42,
    riskLevel: "medium",
    etaISO: iso(11),
    agent: "Atlas Logistics Nigeria",
    voyage: "GT-3311",
    sanctionsHit: false,
    aisBlackoutHours: 0.0,
    pscInspections: [
      { date: "2026-02-11", port: "Antwerp", deficiencies: 1, result: "Deficiencies" },
    ],
  },
  {
    id: "v-delta-star",
    name: "MV Delta Star",
    imo: "9701332",
    mmsi: "657412201",
    type: "Container",
    flag: "Marshall Islands",
    ownerId: "co-delta",
    operatorId: "co-delta",
    managerId: "co-delta",
    classSociety: "LR",
    yearBuilt: 2019,
    gt: 33900,
    dwt: 41800,
    destinationPort: "APP",
    originPort: "Shanghai",
    originCountry: "China",
    status: "duplicate",
    riskScore: 88,
    riskLevel: "high",
    etaISO: iso(13),
    agent: "Sahara Cargo Nigeria",
    voyage: "DS-1907",
    sanctionsHit: false,
    aisBlackoutHours: 12.4,
    pscInspections: [],
  },
  {
    id: "v-lagos-voyager",
    name: "MV Lagos Voyager",
    imo: "9522041",
    mmsi: "657802214",
    type: "General Cargo",
    flag: "Nigeria",
    ownerId: "co-oceanline",
    operatorId: "co-atlaslog",
    managerId: "co-atlaslog",
    classSociety: "BV",
    yearBuilt: 2012,
    gt: 21400,
    dwt: 27600,
    destinationPort: "TCT",
    originPort: "Santos",
    originCountry: "Brazil",
    status: "validated",
    riskScore: 21,
    riskLevel: "low",
    etaISO: iso(7),
    agent: "Atlas Logistics Nigeria",
    voyage: "LV-0442",
    sanctionsHit: false,
    aisBlackoutHours: 0.5,
    pscInspections: [{ date: "2026-01-20", port: "Santos", deficiencies: 0, result: "Passed" }],
  },
  {
    id: "v-sahara-wind",
    name: "MV Sahara Wind",
    imo: "9744820",
    mmsi: "657650012",
    type: "Bulk Carrier",
    flag: "Panama",
    ownerId: "co-sahara",
    operatorId: "co-sahara",
    managerId: "co-gulfmar",
    classSociety: "NK",
    yearBuilt: 2020,
    gt: 62100,
    dwt: 82400,
    destinationPort: "ONN",
    originPort: "Tuticorin",
    originCountry: "India",
    status: "amended",
    riskScore: 66,
    riskLevel: "medium",
    etaISO: iso(15),
    agent: "Sahara Cargo Nigeria",
    voyage: "SW-2205",
    sanctionsHit: false,
    aisBlackoutHours: 3.1,
    pscInspections: [],
  },
  {
    id: "v-niger-runner",
    name: "MT Niger Runner",
    imo: "9330077",
    mmsi: "657140018",
    type: "Tanker",
    flag: "St. Kitts",
    ownerId: "co-trident",
    operatorId: "co-trident",
    managerId: "co-trident",
    classSociety: "RINA",
    yearBuilt: 2008,
    gt: 46800,
    dwt: 59200,
    destinationPort: "CAL",
    originPort: "Fujairah",
    originCountry: "UAE",
    status: "pending",
    riskScore: 91,
    riskLevel: "high",
    etaISO: iso(17),
    agent: "Sahara Cargo Nigeria",
    voyage: "NR-8801",
    sanctionsHit: true,
    aisBlackoutHours: 18.7,
    pscInspections: [{ date: "2025-12-04", port: "Fujairah", deficiencies: 4, result: "Detained" }],
  },
  {
    id: "v-baltic-horizon",
    name: "MV Baltic Horizon",
    imo: "9855291",
    mmsi: "657332214",
    type: "Container",
    flag: "Malta",
    ownerId: "co-oceanline",
    operatorId: "co-oceanline",
    managerId: "co-gulfmar",
    classSociety: "DNV",
    yearBuilt: 2022,
    gt: 51200,
    dwt: 64800,
    destinationPort: "APP",
    originPort: "Hamburg",
    originCountry: "Germany",
    status: "validated",
    riskScore: 18,
    riskLevel: "low",
    etaISO: iso(8),
    agent: "Atlas Logistics Nigeria",
    voyage: "BH-4419",
    sanctionsHit: false,
    aisBlackoutHours: 0.0,
    pscInspections: [{ date: "2026-04-02", port: "Hamburg", deficiencies: 0, result: "Passed" }],
  },
  {
    id: "v-atlantic-crown",
    name: "MV Atlantic Crown",
    imo: "9611830",
    mmsi: "657212233",
    type: "RoRo",
    flag: "Bahamas",
    ownerId: "co-delta",
    operatorId: "co-delta",
    managerId: "co-delta",
    classSociety: "ABS",
    yearBuilt: 2016,
    gt: 28700,
    dwt: 12400,
    destinationPort: "TCT",
    originPort: "Antwerp",
    originCountry: "Belgium",
    status: "validated",
    riskScore: 34,
    riskLevel: "medium",
    etaISO: iso(10),
    agent: "Sahara Cargo Nigeria",
    voyage: "AC-1130",
    sanctionsHit: false,
    aisBlackoutHours: 0.0,
    pscInspections: [],
  },
  {
    id: "v-serengeti-bay",
    name: "MV Serengeti Bay",
    imo: "9482055",
    mmsi: "657441120",
    type: "Bulk Carrier",
    flag: "Liberia",
    ownerId: "co-northstar",
    operatorId: "co-northstar",
    managerId: "co-gulfmar",
    classSociety: "LR",
    yearBuilt: 2015,
    gt: 55400,
    dwt: 71800,
    destinationPort: "PHC",
    originPort: "Novorossiysk",
    originCountry: "Russia",
    status: "pending",
    riskScore: 72,
    riskLevel: "high",
    etaISO: iso(14),
    agent: "Atlas Logistics Nigeria",
    voyage: "SB-2028",
    sanctionsHit: false,
    aisBlackoutHours: 8.9,
    pscInspections: [],
  },
  {
    id: "v-aegean-falcon",
    name: "MV Aegean Falcon",
    imo: "9788112",
    mmsi: "657115501",
    type: "Container",
    flag: "Greece",
    ownerId: "co-atlaslog",
    operatorId: "co-atlaslog",
    managerId: "co-atlaslog",
    classSociety: "BV",
    yearBuilt: 2021,
    gt: 47800,
    dwt: 60100,
    destinationPort: "APP",
    originPort: "Piraeus",
    originCountry: "Greece",
    status: "validated",
    riskScore: 27,
    riskLevel: "low",
    etaISO: iso(6),
    agent: "Atlas Logistics Nigeria",
    voyage: "AF-3308",
    sanctionsHit: false,
    aisBlackoutHours: 0.0,
    pscInspections: [{ date: "2026-03-22", port: "Piraeus", deficiencies: 0, result: "Passed" }],
  },
];

export const vesselById = (id: string) => VESSELS.find((v) => v.id === id);
export const companyById = (id: string) => COMPANIES.find((c) => c.id === id);
export const portByCode = (c: string) => PORTS.find((p) => p.code === c);

// ─────────────────────────────────────────────────────────────────────────
// Cargo
// ─────────────────────────────────────────────────────────────────────────

export type CargoType =
  "Raw Materials" | "Consumer Goods" | "Machinery" | "Chemicals" | "Fuel & Energy" | "Others";

export interface CargoItem {
  containerNo: string;
  vesselId: string;
  voyage: string;
  hsCode: string;
  description: string;
  type: CargoType;
  origin: string;
  destination: string; // port code
  declaredValueNGN: number;
  weightMT: number;
  riskLevel: RiskLevel;
  riskScore: number;
  status: "Cleared" | "Held" | "Inspection" | "Discrepancy";
  dangerousGoods: boolean;
  misclassified: boolean;
}

export const CARGO: CargoItem[] = [
  {
    containerNo: "MSCU7811203",
    vesselId: "v-ocean-pearl",
    voyage: "OP-2412",
    hsCode: "8471.30",
    description: "Portable computers",
    type: "Consumer Goods",
    origin: "Netherlands",
    destination: "APP",
    declaredValueNGN: 412_000_000,
    weightMT: 18.4,
    riskLevel: "high",
    riskScore: 82,
    status: "Held",
    dangerousGoods: false,
    misclassified: true,
  },
  {
    containerNo: "MAEU4402118",
    vesselId: "v-ocean-pearl",
    voyage: "OP-2412",
    hsCode: "3004.90",
    description: "Pharmaceutical preparations",
    type: "Chemicals",
    origin: "Netherlands",
    destination: "APP",
    declaredValueNGN: 288_000_000,
    weightMT: 12.1,
    riskLevel: "medium",
    riskScore: 54,
    status: "Inspection",
    dangerousGoods: false,
    misclassified: false,
  },
  {
    containerNo: "CMAU9982017",
    vesselId: "v-delta-star",
    voyage: "DS-1907",
    hsCode: "8517.12",
    description: "Mobile telephones",
    type: "Consumer Goods",
    origin: "China",
    destination: "APP",
    declaredValueNGN: 631_000_000,
    weightMT: 9.8,
    riskLevel: "high",
    riskScore: 88,
    status: "Discrepancy",
    dangerousGoods: false,
    misclassified: true,
  },
  {
    containerNo: "HLXU3320041",
    vesselId: "v-delta-star",
    voyage: "DS-1907",
    hsCode: "2933.99",
    description: "Heterocyclic compounds",
    type: "Chemicals",
    origin: "China",
    destination: "APP",
    declaredValueNGN: 197_000_000,
    weightMT: 22.5,
    riskLevel: "high",
    riskScore: 79,
    status: "Held",
    dangerousGoods: true,
    misclassified: false,
  },
  {
    containerNo: "GULF7712204",
    vesselId: "v-gulf-trader",
    voyage: "GT-3311",
    hsCode: "2710.19",
    description: "Gas oil (diesel)",
    type: "Fuel & Energy",
    origin: "Netherlands",
    destination: "PHC",
    declaredValueNGN: 2_140_000_000,
    weightMT: 41200,
    riskLevel: "medium",
    riskScore: 48,
    status: "Cleared",
    dangerousGoods: true,
    misclassified: false,
  },
  {
    containerNo: "LGVX4488210",
    vesselId: "v-lagos-voyager",
    voyage: "LV-0442",
    hsCode: "0901.21",
    description: "Roasted coffee",
    type: "Raw Materials",
    origin: "Brazil",
    destination: "TCT",
    declaredValueNGN: 88_000_000,
    weightMT: 24.0,
    riskLevel: "low",
    riskScore: 12,
    status: "Cleared",
    dangerousGoods: false,
    misclassified: false,
  },
  {
    containerNo: "SWND2210043",
    vesselId: "v-sahara-wind",
    voyage: "SW-2205",
    hsCode: "1006.30",
    description: "Semi-milled rice",
    type: "Raw Materials",
    origin: "India",
    destination: "ONN",
    declaredValueNGN: 512_000_000,
    weightMT: 6100,
    riskLevel: "medium",
    riskScore: 44,
    status: "Inspection",
    dangerousGoods: false,
    misclassified: true,
  },
  {
    containerNo: "NIGR8830018",
    vesselId: "v-niger-runner",
    voyage: "NR-8801",
    hsCode: "2710.12",
    description: "Motor spirit",
    type: "Fuel & Energy",
    origin: "UAE",
    destination: "CAL",
    declaredValueNGN: 3_880_000_000,
    weightMT: 58400,
    riskLevel: "high",
    riskScore: 94,
    status: "Held",
    dangerousGoods: true,
    misclassified: false,
  },
  {
    containerNo: "BHZN0044120",
    vesselId: "v-baltic-horizon",
    voyage: "BH-4419",
    hsCode: "8703.23",
    description: "Motor cars 1500-3000cc",
    type: "Machinery",
    origin: "Germany",
    destination: "APP",
    declaredValueNGN: 1_320_000_000,
    weightMT: 320,
    riskLevel: "low",
    riskScore: 22,
    status: "Cleared",
    dangerousGoods: false,
    misclassified: false,
  },
  {
    containerNo: "ATCR7719802",
    vesselId: "v-atlantic-crown",
    voyage: "AC-1130",
    hsCode: "8704.22",
    description: "Motor vehicles for goods",
    type: "Machinery",
    origin: "Belgium",
    destination: "TCT",
    declaredValueNGN: 908_000_000,
    weightMT: 480,
    riskLevel: "medium",
    riskScore: 39,
    status: "Cleared",
    dangerousGoods: false,
    misclassified: false,
  },
  {
    containerNo: "SGBY1120033",
    vesselId: "v-serengeti-bay",
    voyage: "SB-2028",
    hsCode: "1001.99",
    description: "Wheat (excl. seed)",
    type: "Raw Materials",
    origin: "Russia",
    destination: "PHC",
    declaredValueNGN: 1_775_000_000,
    weightMT: 44100,
    riskLevel: "high",
    riskScore: 71,
    status: "Discrepancy",
    dangerousGoods: false,
    misclassified: true,
  },
  {
    containerNo: "AEGF2201055",
    vesselId: "v-aegean-falcon",
    voyage: "AF-3308",
    hsCode: "3923.30",
    description: "Plastic bottles",
    type: "Consumer Goods",
    origin: "Greece",
    destination: "APP",
    declaredValueNGN: 142_000_000,
    weightMT: 16.2,
    riskLevel: "low",
    riskScore: 19,
    status: "Cleared",
    dangerousGoods: false,
    misclassified: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Revenue
// ─────────────────────────────────────────────────────────────────────────

export interface RevenueLine {
  type: "Import Duty" | "CISS" | "VAT" | "3% Levy" | "Other Fees";
  amountNGN: number;
  colour: string;
}

export const REVENUE_BY_TYPE: RevenueLine[] = [
  { type: "Import Duty", amountNGN: 18_400_000_000, colour: "#2563EB" },
  { type: "CISS", amountNGN: 2_100_000_000, colour: "#7C3AED" },
  { type: "VAT", amountNGN: 11_800_000_000, colour: "#1E6B3A" },
  { type: "3% Levy", amountNGN: 4_950_000_000, colour: "#B06A00" },
  { type: "Other Fees", amountNGN: 1_620_000_000, colour: "#5A6B7B" },
];

export const REVENUE_FUNNEL = [
  { stage: "Expected", valueNGN: 44_200_000_000 },
  { stage: "Assessed", valueNGN: 40_100_000_000 },
  { stage: "Collected", valueNGN: 34_600_000_000 },
  { stage: "Recovered", valueNGN: 2_800_000_000 },
  { stage: "Outstanding", valueNGN: 6_800_000_000 },
];

export const REVENUE_WATERFALL = [
  { stage: "Expected", valueNGN: 44_200_000_000, kind: "start" as const },
  { stage: "Assessments", valueNGN: -4_100_000_000, kind: "neg" as const },
  { stage: "Deductions", valueNGN: -1_900_000_000, kind: "neg" as const },
  { stage: "Leakage", valueNGN: -6_400_000_000, kind: "leak" as const },
  { stage: "Recovered", valueNGN: 2_800_000_000, kind: "pos" as const },
  { stage: "Actual", valueNGN: 34_600_000_000, kind: "end" as const },
];

export const TOP_COMPANIES_AT_RISK = [
  {
    company: "Trident Maritime Group",
    revenueAtRiskNGN: 2_140_000_000,
    riskScore: 91,
    trend: "up" as const,
  },
  {
    company: "Sahara Cargo Nigeria",
    revenueAtRiskNGN: 1_620_000_000,
    riskScore: 74,
    trend: "flat" as const,
  },
  {
    company: "Delta Freight Ltd",
    revenueAtRiskNGN: 980_000_000,
    riskScore: 66,
    trend: "up" as const,
  },
  {
    company: "GulfMarine Holdings",
    revenueAtRiskNGN: 740_000_000,
    riskScore: 58,
    trend: "down" as const,
  },
  {
    company: "Northstar Bulk Carriers",
    revenueAtRiskNGN: 612_000_000,
    riskScore: 52,
    trend: "flat" as const,
  },
];

export const TOP_RISK_PORTS = PORTS.map((p, i) => ({
  port: p.name,
  code: p.code,
  revenueAtRiskNGN: [2_800_000_000, 1_950_000_000, 1_240_000_000, 780_000_000, 420_000_000][i]!,
  contributionPct: [38, 27, 17, 11, 7][i]!,
  trend: (["up", "up", "flat", "down", "flat"] as const)[i]!,
}));

// ─────────────────────────────────────────────────────────────────────────
// Alerts / Evidence / Ownership
// ─────────────────────────────────────────────────────────────────────────

export type AlertType =
  | "High Risk Arrival"
  | "AIS Blackout Observed"
  | "Duplicate Manifest Observed"
  | "Revenue Discrepancy Observed"
  | "Watchlist Match"
  | "Dangerous Goods"
  | "Late Submission";

export interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  detail: string;
  severity: AlertSeverity;
  timeISO: string;
  status: AlertStatus;
  vesselId?: string;
  confidence: ConfidenceTier;
}

export const ALERTS: AlertItem[] = [
  {
    id: "al-01",
    type: "High Risk Arrival",
    title: "MV Ocean Pearl inbound Apapa",
    detail: "Risk score 78 · pending validation · ETA 09:22 UTC",
    severity: "high",
    timeISO: iso(8),
    status: "NEW",
    vesselId: "v-ocean-pearl",
    confidence: "unconfirmed",
  },
  {
    id: "al-02",
    type: "AIS Blackout Observed",
    title: "MT Niger Runner AIS gap 18.7h",
    detail: "Last position off Fujairah · resumed 320nm south of Lagos",
    severity: "high",
    timeISO: iso(7),
    status: "NEW",
    vesselId: "v-niger-runner",
    confidence: "unconfirmed",
  },
  {
    id: "al-03",
    type: "Duplicate Manifest Observed",
    title: "MV Delta Star manifest matches DS-1904",
    detail: "3 containers listed under two BOLs · SGD-issued 08 Apr",
    severity: "high",
    timeISO: iso(6),
    status: "ACK",
    vesselId: "v-delta-star",
    confidence: "unconfirmed",
  },
  {
    id: "al-04",
    type: "Revenue Discrepancy Observed",
    title: "Assessed vs declared value ₦412M gap",
    detail: "Container MSCU7811203 · HS 8471.30 · potential ₦88M duty",
    severity: "high",
    timeISO: iso(5),
    status: "NEW",
    vesselId: "v-ocean-pearl",
    confidence: "inferred",
  },
  {
    id: "al-05",
    type: "Watchlist Match",
    title: "Trident Maritime Group sanctions hit",
    detail: "Match against OFAC SDN list · 92% name similarity",
    severity: "high",
    timeISO: iso(4),
    status: "NEW",
    vesselId: "v-niger-runner",
    confidence: "unconfirmed",
  },
  {
    id: "al-06",
    type: "Dangerous Goods",
    title: "IMDG Class 3 flammable liquids inbound",
    detail: "MT Gulf Trader · 41,200 MT gas oil · Onne berth 4",
    severity: "medium",
    timeISO: iso(3),
    status: "ACK",
    vesselId: "v-gulf-trader",
    confidence: "unconfirmed",
  },
  {
    id: "al-07",
    type: "Late Submission",
    title: "Pre-arrival notice 6h late",
    detail: "MV Serengeti Bay agent submitted after 24h window",
    severity: "medium",
    timeISO: iso(2),
    status: "NEW",
    vesselId: "v-serengeti-bay",
    confidence: "unconfirmed",
  },
  {
    id: "al-08",
    type: "High Risk Arrival",
    title: "MV Sahara Wind risk 66",
    detail: "Amended manifest · 3 HS re-codes in 24h",
    severity: "medium",
    timeISO: iso(1),
    status: "NEW",
    vesselId: "v-sahara-wind",
    confidence: "unconfirmed",
  },
  {
    id: "al-09",
    type: "Late Submission",
    title: "Cargo declaration submitted late",
    detail: "MV Atlantic Crown · declaration 3h past cut-off",
    severity: "low",
    timeISO: iso(0),
    status: "RESOLVED",
    vesselId: "v-atlantic-crown",
    confidence: "unconfirmed",
  },
];

export type EvidenceKind =
  | "Bill of Lading"
  | "Manifest"
  | "Invoice"
  | "Container List"
  | "Cargo Declaration"
  | "Inspection Report"
  | "Photo"
  | "AIS Snapshot"
  | "Certificate"
  | "Payment Receipt";

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  refNumber: string;
  format: "PDF" | "JPG" | "PNG" | "CSV" | "XML" | "JSON";
  uploadedAt: string;
  uploadedBy: string;
  linkedInvestigation?: string;
  linkedVesselId?: string;
  confidence: ConfidenceTier;
  sizeKb: number;
}

export const EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-01",
    kind: "Bill of Lading",
    refNumber: "MSC-OP-2412-01",
    format: "PDF",
    uploadedAt: iso(6),
    uploadedBy: "Officer Adeyemi",
    linkedInvestigation: "INV-2412-01",
    linkedVesselId: "v-ocean-pearl",
    confidence: "unconfirmed",
    sizeKb: 412,
  },
  {
    id: "ev-02",
    kind: "Manifest",
    refNumber: "MAN-OP-2412",
    format: "XML",
    uploadedAt: iso(6),
    uploadedBy: "Sahara Cargo Ni.",
    linkedInvestigation: "INV-2412-01",
    linkedVesselId: "v-ocean-pearl",
    confidence: "unconfirmed",
    sizeKb: 88,
  },
  {
    id: "ev-03",
    kind: "Container List",
    refNumber: "CTR-OP-2412",
    format: "CSV",
    uploadedAt: iso(6),
    uploadedBy: "Sahara Cargo Ni.",
    linkedInvestigation: "INV-2412-01",
    linkedVesselId: "v-ocean-pearl",
    confidence: "unconfirmed",
    sizeKb: 21,
  },
  {
    id: "ev-04",
    kind: "Cargo Declaration",
    refNumber: "CD-DS-1907",
    format: "PDF",
    uploadedAt: iso(5),
    uploadedBy: "Officer Bello",
    linkedInvestigation: "INV-2412-02",
    linkedVesselId: "v-delta-star",
    confidence: "unconfirmed",
    sizeKb: 208,
  },
  {
    id: "ev-05",
    kind: "Photo",
    refNumber: "IMG-DS-1907-A",
    format: "JPG",
    uploadedAt: iso(5),
    uploadedBy: "Officer Bello",
    linkedInvestigation: "INV-2412-02",
    linkedVesselId: "v-delta-star",
    confidence: "unconfirmed",
    sizeKb: 3120,
  },
  {
    id: "ev-06",
    kind: "AIS Snapshot",
    refNumber: "AIS-NR-8801",
    format: "JSON",
    uploadedAt: iso(4),
    uploadedBy: "System",
    linkedInvestigation: "INV-2412-03",
    linkedVesselId: "v-niger-runner",
    confidence: "unconfirmed",
    sizeKb: 14,
  },
  {
    id: "ev-07",
    kind: "Certificate",
    refNumber: "PSC-GT-2026-02",
    format: "PDF",
    uploadedAt: iso(4),
    uploadedBy: "Officer Adeyemi",
    linkedInvestigation: "INV-2412-04",
    linkedVesselId: "v-gulf-trader",
    confidence: "unconfirmed",
    sizeKb: 604,
  },
  {
    id: "ev-08",
    kind: "Inspection Report",
    refNumber: "IR-SW-2205",
    format: "PDF",
    uploadedAt: iso(3),
    uploadedBy: "Officer Chukwu",
    linkedInvestigation: "INV-2412-05",
    linkedVesselId: "v-sahara-wind",
    confidence: "unconfirmed",
    sizeKb: 512,
  },
  {
    id: "ev-09",
    kind: "Invoice",
    refNumber: "INV-OP-2412-01",
    format: "PDF",
    uploadedAt: iso(6),
    uploadedBy: "Sahara Cargo Ni.",
    linkedInvestigation: "INV-2412-01",
    linkedVesselId: "v-ocean-pearl",
    confidence: "unconfirmed",
    sizeKb: 92,
  },
  {
    id: "ev-10",
    kind: "Payment Receipt",
    refNumber: "RCP-2412-A44",
    format: "PDF",
    uploadedAt: iso(2),
    uploadedBy: "Officer Adeyemi",
    linkedInvestigation: "INV-2412-06",
    linkedVesselId: "v-baltic-horizon",
    confidence: "unconfirmed",
    sizeKb: 44,
  },
];

// Ownership edges: (from → to) with role + confidence
export interface OwnershipEdge {
  fromId: string;
  toId: string;
  label:
    | "owns"
    | "operates"
    | "manages"
    | "insures"
    | "agent-of"
    | "beneficial-owner"
    | "subsidiary-of"
    | "associated-with";
  confidence: ConfidenceTier;
  sourceNote: string;
}

export const OWNERSHIP_EDGES: OwnershipEdge[] = [
  {
    fromId: "co-oceanline",
    toId: "v-ocean-pearl",
    label: "owns",
    confidence: "unconfirmed",
    sourceNote: "IMO GISIS registry",
  },
  {
    fromId: "co-delta",
    toId: "v-ocean-pearl",
    label: "operates",
    confidence: "unconfirmed",
    sourceNote: "Time charter registered",
  },
  {
    fromId: "co-gulfmar",
    toId: "v-ocean-pearl",
    label: "manages",
    confidence: "unconfirmed",
    sourceNote: "Class society filing",
  },
  {
    fromId: "co-trident",
    toId: "co-oceanline",
    label: "beneficial-owner",
    confidence: "inferred",
    sourceNote: "Shared director pattern",
  },
  {
    fromId: "co-trident",
    toId: "v-niger-runner",
    label: "owns",
    confidence: "unconfirmed",
    sourceNote: "OFAC SDN linkage",
  },
  {
    fromId: "co-northstar",
    toId: "v-gulf-trader",
    label: "owns",
    confidence: "unconfirmed",
    sourceNote: "IMO GISIS registry",
  },
  {
    fromId: "co-northstar",
    toId: "v-serengeti-bay",
    label: "owns",
    confidence: "unconfirmed",
    sourceNote: "IMO GISIS registry",
  },
  {
    fromId: "co-delta",
    toId: "v-delta-star",
    label: "owns",
    confidence: "unconfirmed",
    sourceNote: "CAC filing RC-482911",
  },
  {
    fromId: "co-sahara",
    toId: "v-ocean-pearl",
    label: "agent-of",
    confidence: "unconfirmed",
    sourceNote: "NPA agent registry",
  },
  {
    fromId: "co-atlaslog",
    toId: "v-lagos-voyager",
    label: "agent-of",
    confidence: "unconfirmed",
    sourceNote: "NPA agent registry",
  },
  {
    fromId: "co-oceanline",
    toId: "co-delta",
    label: "associated-with",
    confidence: "inferred",
    sourceNote: "Cross-holding pattern",
  },
];

// Watchlists
export const WATCHLISTS = [
  { name: "High Risk Vessels", count: 14, updated: "2h ago" },
  { name: "Sanctioned Entities", count: 8, updated: "6h ago" },
  { name: "Repeat Offenders", count: 22, updated: "1d ago" },
  { name: "PEP Watchlist", count: 47, updated: "3h ago" },
];

// PEP + entity resolution disambiguation samples
export const PEP_SCREEN = [
  {
    name: "A. Chukwuma Okoro",
    role: "Former Board Member — Trident Maritime",
    confidence: "unconfirmed" as ConfidenceTier,
    hit: true,
  },
  {
    name: "M. K. Bello",
    role: "Director — Delta Freight Ltd",
    confidence: "inferred" as ConfidenceTier,
    hit: true,
  },
  {
    name: "S. J. Adeleke",
    role: "Beneficial Owner — GulfMarine (UAE)",
    confidence: "inferred" as ConfidenceTier,
    hit: false,
  },
];

export const ENTITY_DISAMBIGUATION = [
  {
    canonical: "Delta Freight Ltd (NG, RC-482911)",
    candidates: [
      "Delta Freight Limited (NG)",
      "Delta Cargo Freight (GH)",
      "Delta Freight Services Ltd (KE)",
    ],
    confidence: "unconfirmed" as ConfidenceTier,
  },
  {
    canonical: "OceanLine Shipping SA (PA)",
    candidates: ["Ocean Line Shipping Co. (LR)", "OceanLine Marine (SG)"],
    confidence: "unconfirmed" as ConfidenceTier,
  },
];

// Cargo type distribution
export const CARGO_TYPE_MIX: { type: CargoType; pct: number; colour: string }[] = [
  { type: "Raw Materials", pct: 28, colour: "#2563EB" },
  { type: "Consumer Goods", pct: 22, colour: "#7C3AED" },
  { type: "Machinery", pct: 14, colour: "#1E6B3A" },
  { type: "Chemicals", pct: 12, colour: "#B06A00" },
  { type: "Fuel & Energy", pct: 18, colour: "#C0392B" },
  { type: "Others", pct: 6, colour: "#5A6B7B" },
];

// A tiny deterministic sparkline generator so KPI trends are stable.
export function sparkSeries(seed: number, len = 20): number[] {
  const out: number[] = [];
  let v = 50 + (seed % 20);
  for (let i = 0; i < len; i++) {
    v += Math.sin(seed + i) * 6 + (i % 3 === 0 ? 4 : -2);
    out.push(Math.max(5, Math.min(95, Math.round(v))));
  }
  return out;
}

export const naira = (n: number) => {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n}`;
};

export const fmtTime = (isoStr: string) =>
  new Date(isoStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
