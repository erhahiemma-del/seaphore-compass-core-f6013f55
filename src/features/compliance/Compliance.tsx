import { useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  FileWarning,
  ClipboardCheck,
  FileX,
  Ban,
  Banknote,
  Bell,
  Search,
  Sparkles,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  Circle,
  FileText,
  Camera,
  Files,
  ScrollText,
  Landmark,
  Anchor,
  Ship,
  Waves,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { IntelMap, type IntelMapEntity } from "@/components/intelligence/IntelMap";
import { PORTS, VESSELS, vesselById } from "@/lib/intel-centre-data";
import { cn } from "@/lib/utils";

/* ============================================================
 * Compliance Intelligence Centre
 * Regulatory compliance · Detect violations · Reduce risk · Protect revenue
 * ============================================================ */

type TabKey =
  | "overview"
  | "violations"
  | "inspections"
  | "certificates"
  | "sanctions"
  | "watchlists"
  | "regulations"
  | "evidence"
  | "investigations"
  | "timeline";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "violations", label: "Violations" },
  { key: "inspections", label: "Inspections" },
  { key: "certificates", label: "Certificates" },
  { key: "sanctions", label: "Sanctions" },
  { key: "watchlists", label: "Watchlists" },
  { key: "regulations", label: "Regulations" },
  { key: "evidence", label: "Evidence" },
  { key: "investigations", label: "Investigations" },
  { key: "timeline", label: "Timeline" },
];

/* ------------------------------------------------------------
 * KPI ribbon
 * ---------------------------------------------------------- */

interface KpiTile {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  icon: React.ComponentType<{ className?: string }>;
  tone: "ok" | "warn" | "risk" | "info" | "revenue" | "neutral";
}

const KPIS: KpiTile[] = [
  { label: "Compliance Score",     value: "91%",    delta: "6%",  trend: "up",   icon: ShieldCheck,    tone: "ok" },
  { label: "Open Violations",      value: "38",     delta: "12",  trend: "up",   icon: ShieldAlert,    tone: "risk" },
  { label: "Watchlisted Vessels",  value: "14",     delta: "3",   trend: "up",   icon: AlertOctagon,   tone: "warn" },
  { label: "Pending Inspections",  value: "27",     delta: "5",   trend: "up",   icon: ClipboardCheck, tone: "info" },
  { label: "Expired Certificates", value: "18",     delta: "4",   trend: "up",   icon: FileX,          tone: "warn" },
  { label: "Sanction Matches",     value: "6",      delta: "2",   trend: "up",   icon: Ban,            tone: "risk" },
  { label: "Revenue Risk",         value: "₦3.4B",  delta: "N1.28", trend: "up", icon: Banknote,       tone: "revenue" },
  { label: "Compliance Alerts",    value: "23",     delta: "7",   trend: "up",   icon: Bell,           tone: "warn" },
];

const TONE_ICON_BG: Record<KpiTile["tone"], string> = {
  ok:      "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]",
  warn:    "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]",
  risk:    "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]",
  info:    "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]",
  revenue: "bg-emerald-500/15 text-emerald-400",
  neutral: "bg-slate-500/15 text-slate-300",
};

function KpiCard({ tile }: { tile: KpiTile }) {
  const Icon = tile.icon;
  return (
    <div className="rounded-lg border border-line/60 bg-surface-1 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", TONE_ICON_BG[tile.tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-slate">{tile.label}</div>
          <div className="mt-0.5 text-[20px] font-semibold leading-none text-foreground">{tile.value}</div>
          <div className="mt-1 text-[10.5px] text-[color:var(--color-red)]">
            ↑ {tile.delta} vs last 30 days
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
 * Domain data (seeded / deterministic)
 * ---------------------------------------------------------- */

type ComplianceStatus = "PASS" | "REVIEW" | "FAIL";

interface ComplianceRow {
  id: string;
  entity: string;
  subtitle: string;
  kind: "Vessel" | "Company";
  certs: "ok" | "warn" | "fail";
  inspection: "ok" | "warn" | "fail";
  sanctions: "ok" | "warn" | "fail" | "na";
  regulations: string;
  score: number;
  status: ComplianceStatus;
}

const MATRIX: ComplianceRow[] = [
  { id: "v-ocean-pearl",    entity: "MV Ocean Pearl",      subtitle: "IMO 9432187", kind: "Vessel",  certs: "ok",   inspection: "ok",   sanctions: "na",   regulations: "8 / 8", score: 96, status: "PASS" },
  { id: "v-crimson",        entity: "MV Crimson Endeavour", subtitle: "IMO 9837456", kind: "Vessel",  certs: "fail", inspection: "warn", sanctions: "fail", regulations: "3 / 8", score: 42, status: "FAIL" },
  { id: "v-blue-horizon",   entity: "MV Blue Horizon",     subtitle: "IMO 9766453", kind: "Vessel",  certs: "ok",   inspection: "ok",   sanctions: "ok",   regulations: "7 / 8", score: 78, status: "REVIEW" },
  { id: "co-abc-shipping",  entity: "ABC Shipping Ltd.",   subtitle: "RC 1234567",  kind: "Company", certs: "ok",   inspection: "ok",   sanctions: "ok",   regulations: "6 / 8", score: 71, status: "REVIEW" },
  { id: "co-global",        entity: "Global Chartering Inc.", subtitle: "RC 5566778", kind: "Company", certs: "ok", inspection: "ok",   sanctions: "warn", regulations: "5 / 8", score: 38, status: "FAIL" },
];

interface TimelineEvent {
  time: string;
  title: string;
  entity: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "INFO";
}

const TIMELINE: TimelineEvent[] = [
  { time: "May 27, 2026 09:15", title: "ISPS Certificate expired",       entity: "MV Crimson Endeavour", severity: "HIGH" },
  { time: "May 27, 2026 08:40", title: "Arrived Apapa Anchorage",        entity: "MV Crimson Endeavour", severity: "INFO" },
  { time: "May 26, 2026 14:22", title: "Sanctions list updated (OFAC)",  entity: "Beneficial Owner: John Doe", severity: "HIGH" },
  { time: "May 25, 2026 11:05", title: "Inspection scheduled",           entity: "MV Crimson Endeavour", severity: "MEDIUM" },
  { time: "May 24, 2026 16:30", title: "Ownership change detected",      entity: "MV Crimson Endeavour", severity: "MEDIUM" },
  { time: "May 23, 2026 10:12", title: "Port State Control inspection",  entity: "MV Crimson Endeavour", severity: "INFO" },
];

interface Regulation {
  code: "SOLAS" | "MARPOL" | "ISPS" | "STCW" | "MLC" | "Nigeria Customs" | "NIMASA";
  compliant: number;
  total: number;
  status: "Compliant" | "Non-Compliant";
  icon: React.ComponentType<{ className?: string }>;
}

const REGULATIONS: Regulation[] = [
  { code: "SOLAS",           compliant: 7, total: 9, status: "Non-Compliant", icon: ShieldCheck },
  { code: "MARPOL",          compliant: 6, total: 8, status: "Non-Compliant", icon: Waves },
  { code: "ISPS",            compliant: 0, total: 2, status: "Non-Compliant", icon: Ban },
  { code: "STCW",            compliant: 6, total: 7, status: "Compliant",     icon: ClipboardCheck },
  { code: "MLC",             compliant: 5, total: 6, status: "Compliant",     icon: FileText },
  { code: "Nigeria Customs", compliant: 4, total: 5, status: "Compliant",     icon: Landmark },
  { code: "NIMASA",          compliant: 6, total: 8, status: "Non-Compliant", icon: Anchor },
];

interface Investigation {
  id: string;
  entity: string;
  type: string;
  risk: "High" | "Medium" | "Low";
  officer: string;
  status: "Open" | "In Progress" | "Closed";
  opened: string;
}

const INVESTIGATIONS: Investigation[] = [
  { id: "INV-2026-00421", entity: "MV Crimson Endeavour",  type: "Compliance Violation", risk: "High",   officer: "John Bello",    status: "Open",        opened: "May 27, 2026" },
  { id: "INV-2026-00312", entity: "ABC Shipping Ltd.",     type: "Ownership Fraud",       risk: "High",   officer: "Mary Akinyemi", status: "In Progress", opened: "May 25, 2026" },
  { id: "INV-2026-00298", entity: "Global Chartering Inc.", type: "Sanctions Evasion",    risk: "High",   officer: "Ibrahim Yusuf", status: "Open",        opened: "May 24, 2026" },
];

const MAP_LAYERS = [
  { key: "hra",       label: "High Risk Arrivals", color: "#C0392B" },
  { key: "insp",      label: "Inspections",         color: "#3B82F6" },
  { key: "detained",  label: "Detained Vessels",    color: "#B06A00" },
  { key: "watch",     label: "Watchlisted",         color: "#A855F7" },
  { key: "sanction",  label: "Sanctioned Vessels",  color: "#DC2626" },
  { key: "ports",     label: "Ports",               color: "#1E6B3A" },
  { key: "traffic",   label: "Traffic Density",     color: "#5A6B7B" },
] as const;

type LayerKey = typeof MAP_LAYERS[number]["key"];

/* ------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------- */

function StatusDot({ v }: { v: "ok" | "warn" | "fail" | "na" }) {
  if (v === "na")   return <span className="text-slate">—</span>;
  if (v === "ok")   return <CheckCircle2 className="h-4 w-4 text-[color:var(--color-green)]" />;
  if (v === "warn") return <AlertTriangle className="h-4 w-4 text-[color:var(--color-amber)]" />;
  return <XCircle className="h-4 w-4 text-[color:var(--color-red)]" />;
}

function ScoreBar({ pct, status }: { pct: number; status: ComplianceStatus }) {
  const barColor =
    status === "PASS" ? "bg-[color:var(--color-green)]" :
    status === "REVIEW" ? "bg-[color:var(--color-amber)]" :
    "bg-[color:var(--color-red)]";
  return (
    <div className="flex items-center gap-2">
      <div className="text-[11.5px] tabular-nums text-foreground">{pct}%</div>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: ComplianceStatus }) {
  const tone =
    s === "PASS"   ? "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]" :
    s === "REVIEW" ? "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]" :
                     "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide", tone)}>
      {s}
    </span>
  );
}

function SeverityChip({ s }: { s: TimelineEvent["severity"] }) {
  const tone =
    s === "HIGH"   ? "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]" :
    s === "MEDIUM" ? "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]" :
    s === "LOW"    ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]" :
                     "bg-slate-500/15 text-slate-300";
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide", tone)}>{s}</span>;
}

/* ------------------------------------------------------------
 * Panels
 * ---------------------------------------------------------- */

function ComplianceProfilePanel() {
  const scorePct = 42;
  const ringColor = "var(--color-red)";
  const bgArc = `conic-gradient(${ringColor} ${scorePct * 3.6}deg, color-mix(in oklab, ${ringColor} 15%, transparent) 0)`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line/60 bg-surface-1 p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold text-foreground">MV Crimson Endeavour</div>
          <div className="mt-0.5 text-[11px] text-slate">IMO 9837456</div>
        </div>
        <span className="rounded bg-[color:var(--color-red)]/15 px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--color-red)]">
          HIGH RISK
        </span>
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-y-1.5 text-[11.5px]">
        <div className="text-slate">Status</div>       <div className="text-[color:var(--color-red)]">Non-Compliant</div>
        <div className="text-slate">Location</div>     <div className="text-foreground">Waiting – Apapa Anchorage</div>
        <div className="text-slate">Last Port</div>    <div className="text-foreground">Lagos, Nigeria</div>
        <div className="text-slate">ETA</div>          <div className="text-foreground">May 27, 2026  10:40</div>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-line/60 bg-surface-2/40 p-3">
        <div className="relative h-16 w-16 rounded-full" style={{ background: bgArc }}>
          <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-surface-1 text-[13px] font-semibold text-foreground">
            {scorePct}%
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.05em] text-slate">Compliance Score</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[color:var(--color-red)]">
            <ArrowUpRight className="h-3 w-3 rotate-180" /> High Risk
          </div>
          <ConfidenceChip tier="verified" size={9} />
        </div>
      </div>

      <button className="mt-1 inline-flex items-center justify-center gap-1 rounded-md bg-[color:var(--color-blue)]/15 px-3 py-2 text-[12px] font-medium text-[color:var(--color-blue)] hover:bg-[color:var(--color-blue)]/25">
        View Full Profile →
      </button>
    </div>
  );
}

function CopilotPanel() {
  const insights = [
    { text: "MV Crimson Endeavour has 3 compliance gaps driving high risk.", tag: "HIGH" as const },
    { text: "ISPS Certificate expired 27 days ago.",                          tag: "HIGH" as const },
    { text: "-linked beneficial owner is on OFAC SDN list.",                  tag: "HIGH" as const },
    { text: "Similar vessels had 67% detention rate.",                        tag: "MEDIUM" as const },
    { text: "Potential revenue risk estimated at ₦420M.",                     tag: "MEDIUM" as const },
  ];
  const actions = [
    { text: "Schedule comprehensive inspection",       tag: "HIGH" as const },
    { text: "Issue detention notice",                   tag: "HIGH" as const },
    { text: "Request ISPS certificate renewal",         tag: "MEDIUM" as const },
    { text: "Verify beneficial ownership documents",    tag: "REVIEW" as const },
    { text: "Notify NPA & Customs",                     tag: "LOW" as const },
  ];

  const tagTone: Record<string, string> = {
    HIGH:   "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]",
    MEDIUM: "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]",
    LOW:    "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]",
    REVIEW: "bg-slate-500/15 text-slate-300",
  };

  return (
    <div className="rounded-lg border border-line/60 bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[color:var(--color-blue)]" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground">
            SEAPHORE COPILOT
          </span>
          <span className="rounded bg-[color:var(--color-blue)]/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-[color:var(--color-blue)]">
            BETA
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-md border border-line/60 bg-surface-2/50 px-2 py-1.5">
        <input
          className="flex-1 bg-transparent text-[11.5px] text-foreground placeholder:text-slate outline-none"
          placeholder="Ask a compliance question..."
        />
        <button className="flex h-6 w-6 items-center justify-center rounded bg-[color:var(--color-blue)] text-white hover:opacity-90">
          <Send className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">Key Insights</div>
        <ul className="mt-1.5 space-y-1.5">
          {insights.map((i) => (
            <li key={i.text} className="flex items-start justify-between gap-2 text-[11.5px] text-foreground/90">
              <span className="flex items-start gap-1.5">
                <Circle className="mt-1 h-1.5 w-1.5 fill-[color:var(--color-red)] text-[color:var(--color-red)]" />
                {i.text}
              </span>
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold", tagTone[i.tag])}>{i.tag}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">Recommended Actions</div>
        <ul className="mt-1.5 space-y-1.5">
          {actions.map((a) => (
            <li key={a.text} className="flex items-start justify-between gap-2 text-[11.5px] text-foreground/90">
              <span className="flex items-start gap-1.5">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[color:var(--color-red)]" />
                {a.text}
              </span>
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold", tagTone[a.tag])}>{a.tag}</span>
            </li>
          ))}
        </ul>
        <button className="mt-2 text-[11px] text-[color:var(--color-blue)] hover:underline">View all actions →</button>
      </div>
    </div>
  );
}

const RISK_DRIVERS = [
  { label: "Certificates",  value: 35, color: "#DC2626" },
  { label: "Sanctions",     value: 22, color: "#F59E0B" },
  { label: "Cargo",         value: 18, color: "#10B981" },
  { label: "Ownership",     value: 14, color: "#3B82F6" },
  { label: "AIS / Behaviour", value: 11, color: "#06B6D4" },
];

function RiskDriversPanel() {
  return (
    <div className="rounded-lg border border-line/60 bg-surface-1 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Risk Drivers</div>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-[110px] w-[110px] shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={RISK_DRIVERS}
                dataKey="value"
                innerRadius={38}
                outerRadius={54}
                paddingAngle={2}
                stroke="none"
              >
                {RISK_DRIVERS.map((d) => <Cell key={d.label} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[16px] font-semibold text-foreground leading-none">65%</div>
            <div className="text-[9px] uppercase tracking-[0.06em] text-slate">Total Risk</div>
          </div>
        </div>
        <ul className="flex-1 space-y-1 text-[11px]">
          {RISK_DRIVERS.map((d) => (
            <li key={d.label} className="flex items-center justify-between gap-2 text-foreground/90">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: d.color }} />
                {d.label}
              </span>
              <span className="tabular-nums text-slate">{d.value}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const EVIDENCE_SNAPSHOT = [
  { label: "Certificates",       value: 12,  icon: ScrollText },
  { label: "Inspection Reports", value: 8,   icon: ClipboardCheck },
  { label: "Bills of Lading",    value: 24,  icon: FileText },
  { label: "Manifest",           value: 16,  icon: Files },
  { label: "Sanctions Lists",    value: 6,   icon: Ban },
  { label: "Audit Trail",        value: 143, icon: FileWarning },
  { label: "Photos",             value: 19,  icon: Camera },
  { label: "Officer Notes",      value: 27,  icon: FileText },
];

function EvidenceSnapshotPanel() {
  return (
    <div className="rounded-lg border border-line/60 bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Evidence Snapshot</div>
        <button className="text-[11px] text-[color:var(--color-blue)] hover:underline">View all</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {EVIDENCE_SNAPSHOT.map((e) => {
          const Icon = e.icon;
          return (
            <div key={e.label} className="flex items-center gap-2 rounded-md border border-line/50 bg-surface-2/40 p-2">
              <Icon className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] text-slate leading-tight">{e.label}</div>
                <div className="text-[13px] font-semibold text-foreground leading-tight">{e.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
 * Map — builds entities from vessels + ports and filters by layers
 * ---------------------------------------------------------- */

function buildComplianceMapEntities(layers: Set<LayerKey>): IntelMapEntity[] {
  const out: IntelMapEntity[] = [];
  if (layers.has("ports")) {
    PORTS.forEach((p) => out.push({
      id: `port-${p.code}`,
      kind: "port",
      name: p.name,
      position: { lat: p.lat, lng: p.lng },
      risk: "unknown",
      confidence: "verified",
      subtitle: `${p.code} · ${p.city}`,
    }));
  }
  VESSELS.forEach((v, i) => {
    const port = PORTS.find((p) => p.code === v.destinationPort);
    if (!port) return;
    const highRisk = v.riskLevel === "high";
    const sanctioned = v.sanctionsHit;
    const detained = v.pscInspections?.some((x) => x.result === "Detained");

    const show =
      (layers.has("hra") && highRisk) ||
      (layers.has("sanction") && sanctioned) ||
      (layers.has("detained") && detained) ||
      (layers.has("insp") && (v.pscInspections?.length ?? 0) > 0) ||
      (layers.has("watch") && v.riskScore > 60);
    if (!show) return;

    const rad = ((i * 47) % 360) * Math.PI / 180;
    out.push({
      id: v.id,
      kind: "vessel",
      name: v.name,
      position: {
        lat: port.lat - Math.abs(Math.sin(rad)) * 0.4 - 0.15,
        lng: port.lng + Math.cos(rad) * 0.4,
      },
      risk: v.riskLevel,
      confidence: v.sanctionsHit ? "inferred" : v.status === "validated" ? "verified" : "observed",
      subtitle: `${v.type} · IMO ${v.imo}`,
      meta: [
        ["Flag", v.flag],
        ["Risk score", String(v.riskScore)],
        ["Voyage", v.voyage],
      ],
    });
  });
  return out;
}

/* ------------------------------------------------------------
 * Main
 * ---------------------------------------------------------- */

export function ComplianceCentre() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [layers, setLayers] = useState<Set<LayerKey>>(
    () => new Set<LayerKey>(["hra", "insp", "detained", "watch", "sanction", "ports"])
  );

  const toggleLayer = (k: LayerKey) => {
    setLayers((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const mapEntities = useMemo(() => buildComplianceMapEntities(layers), [layers]);

  return (
    <AppShell
      title="Compliance Intelligence Centre"
      subtitle="Regulatory compliance. Detect violations. Reduce risk. Protect revenue."
      mode="dark"
    >
      <div className="space-y-3 p-4">
        {/* Search bar */}
        <div className="flex items-center gap-2 rounded-md border border-line/60 bg-surface-1 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate" />
          <input
            className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-slate outline-none"
            placeholder="Search Vessel, IMO, Company, Certificate, Regulation..."
          />
          <button className="inline-flex items-center gap-1 rounded bg-[color:var(--color-blue)]/15 px-2 py-1 text-[11.5px] font-medium text-[color:var(--color-blue)]">
            <Sparkles className="h-3 w-3" /> AI Copilot
          </button>
        </div>

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {KPIS.map((k) => <KpiCard key={k.label} tile={k} />)}
        </div>

        {/* Tabs + filters row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1">
          <nav className="flex flex-wrap items-center gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  tab === t.key
                    ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]"
                    : "text-slate hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate">
            <SelectPill label="All Entities" />
            <SelectPill label="All Risk Levels" />
            <SelectPill label="All Ports" />
            <SelectPill label="May 20 – May 27, 2026" />
            <button className="text-[color:var(--color-blue)] hover:underline">Reset</button>
          </div>
        </div>

        {/* Body: Left (map+matrix+timeline+regs+invs) | Right (copilot/insights/drivers/evidence) */}
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {/* Map row: layers | map | profile */}
            <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)_260px]">
              <div className="rounded-lg border border-line/60 bg-surface-1 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">Map Layers</div>
                <ul className="mt-2 space-y-1.5">
                  {MAP_LAYERS.map((l) => {
                    const on = layers.has(l.key);
                    return (
                      <li key={l.key} className="flex items-center justify-between text-[11.5px] text-foreground/90">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                          {l.label}
                        </span>
                        <button
                          onClick={() => toggleLayer(l.key)}
                          className={cn(
                            "relative h-3.5 w-6 rounded-full transition-colors",
                            on ? "bg-[color:var(--color-green)]" : "bg-slate-600/50",
                          )}
                          aria-pressed={on}
                          aria-label={`Toggle ${l.label}`}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all",
                              on ? "left-3" : "left-0.5",
                            )}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 border-t border-line/50 pt-2">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">Risk Legend</div>
                  <ul className="mt-1.5 space-y-1 text-[11.5px] text-foreground/90">
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-red)]" />High</li>
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-amber)]" />Medium</li>
                    <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-green)]" />Low</li>
                  </ul>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-line/60 bg-surface-1">
                <IntelMap entities={mapEntities} height={340} />
              </div>

              <ComplianceProfilePanel />
            </div>

            {/* Matrix + Timeline row */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <section className="rounded-lg border border-line/60 bg-surface-1">
                <header className="flex items-center justify-between px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Compliance Matrix</div>
                  <button className="text-[11px] text-[color:var(--color-blue)] hover:underline">View full matrix →</button>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full border-t border-line/50 text-[11.5px]">
                    <thead className="text-[10px] uppercase tracking-[0.06em] text-slate">
                      <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left">
                        <th>Entity</th><th>Type</th>
                        <th className="!text-center">Certificates</th>
                        <th className="!text-center">Inspection</th>
                        <th className="!text-center">Sanctions</th>
                        <th>Regulations</th>
                        <th>Compliance Score</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground/90">
                      {MATRIX.map((r) => (
                        <tr key={r.id} className="border-t border-line/40 hover:bg-surface-2/40 [&>td]:px-3 [&>td]:py-2">
                          <td>
                            <div className="font-semibold text-foreground">{r.entity}</div>
                            <div className="text-[10.5px] text-slate">{r.subtitle}</div>
                          </td>
                          <td>{r.kind}</td>
                          <td className="text-center"><div className="inline-flex"><StatusDot v={r.certs} /></div></td>
                          <td className="text-center"><div className="inline-flex"><StatusDot v={r.inspection} /></div></td>
                          <td className="text-center"><div className="inline-flex"><StatusDot v={r.sanctions} /></div></td>
                          <td className="tabular-nums">{r.regulations}</td>
                          <td><ScoreBar pct={r.score} status={r.status} /></td>
                          <td><StatusPill s={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-line/60 bg-surface-1">
                <header className="flex items-center justify-between px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Compliance Timeline</div>
                  <button className="text-[11px] text-[color:var(--color-blue)] hover:underline">View all</button>
                </header>
                <ol className="relative border-t border-line/50 px-3 py-2">
                  <div className="absolute left-[18px] top-3 bottom-3 w-px bg-line/60" />
                  {TIMELINE.map((e, i) => (
                    <li key={i} className="relative flex gap-3 py-2 pl-4">
                      <span className={cn(
                        "absolute left-0 top-2.5 h-2 w-2 rounded-full ring-2 ring-surface-1",
                        e.severity === "HIGH" ? "bg-[color:var(--color-red)]" :
                        e.severity === "MEDIUM" ? "bg-[color:var(--color-amber)]" :
                        "bg-[color:var(--color-blue)]"
                      )} />
                      <div className="min-w-[112px] text-[10.5px] text-slate">{e.time}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11.5px] font-medium text-foreground">{e.title}</div>
                          <SeverityChip s={e.severity} />
                        </div>
                        <div className="text-[10.5px] text-slate">{e.entity}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {/* Regulations + Investigations */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <section className="rounded-lg border border-line/60 bg-surface-1">
                <header className="flex items-center justify-between px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Regulation Compliance</div>
                  <button className="text-[11px] text-slate hover:text-foreground">Select Regulation ▾</button>
                </header>
                <div className="grid grid-cols-3 gap-2 border-t border-line/50 p-3 md:grid-cols-4 xl:grid-cols-7">
                  {REGULATIONS.map((r) => {
                    const Icon = r.icon;
                    const nc = r.status === "Non-Compliant";
                    return (
                      <div key={r.code} className="rounded-md border border-line/50 bg-surface-2/40 p-2 text-center">
                        <div className={cn(
                          "mx-auto flex h-8 w-8 items-center justify-center rounded-full",
                          nc ? "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]"
                             : "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]",
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-foreground">{r.code}</div>
                        <div className="text-[10.5px] text-slate tabular-nums">{r.compliant} / {r.total}</div>
                        <div className={cn(
                          "mt-0.5 text-[10px] font-semibold",
                          nc ? "text-[color:var(--color-red)]" : "text-[color:var(--color-green)]",
                        )}>{r.status}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border border-line/60 bg-surface-1">
                <header className="flex items-center justify-between px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Related Investigations</div>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full border-t border-line/50 text-[11px]">
                    <thead className="text-[10px] uppercase tracking-[0.06em] text-slate">
                      <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left">
                        <th>Investigation ID</th><th>Entity</th><th>Type</th><th>Risk</th><th>Officer</th><th>Status</th><th>Opened</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground/90">
                      {INVESTIGATIONS.map((i) => (
                        <tr key={i.id} className="border-t border-line/40 hover:bg-surface-2/40 [&>td]:px-3 [&>td]:py-2">
                          <td className="font-mono text-[color:var(--color-blue)]">{i.id}</td>
                          <td>{i.entity}</td>
                          <td>{i.type}</td>
                          <td className="text-[color:var(--color-red)]">{i.risk}</td>
                          <td>{i.officer}</td>
                          <td>
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              i.status === "Open" ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]" :
                              i.status === "In Progress" ? "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]" :
                              "bg-slate-500/15 text-slate-300",
                            )}>{i.status}</span>
                          </td>
                          <td>{i.opened}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="space-y-3">
            <CopilotPanel />
            <RiskDriversPanel />
            <EvidenceSnapshotPanel />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SelectPill({ label }: { label: string }) {
  return (
    <button className="inline-flex items-center gap-1 rounded-md border border-line/60 bg-surface-1 px-2 py-1 text-[11px] text-foreground/90 hover:border-line">
      {label}
      <span className="text-slate">▾</span>
    </button>
  );
}
