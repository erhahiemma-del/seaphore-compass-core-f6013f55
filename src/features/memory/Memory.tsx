import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Download,
  FileText,
  MoreHorizontal,
  Radio,
  Search,
  Ship,
  Sparkles,
  StickyNote,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import {
  EvidenceDrilldown,
  type EvidenceDrilldownData,
} from "@/components/intelligence/EvidenceDrilldown";
import { KnowledgeGraph } from "@/components/intelligence/KnowledgeGraph";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { cn } from "@/lib/utils";

import {
  ENTITY_SUBTABS,
  GRAPH_EDGES,
  GRAPH_NODES,
  MEMORY_ENTITY,
  MEMORY_INSIGHTS,
  MEMORY_TABS,
  SIMILAR_ENTITIES,
  type EntitySubtab,
  type MemoryTabKey,
} from "@/lib/lifecycle-data";

// ─────────────────────────────────────────────────────────────────────────────
// Local reference data (matches spec — deterministic, non-secret)
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_META = {
  mmsi: "636017857",
  callSign: "DSXH7",
  flag: "Liberia",
  flagEmoji: "🇱🇷",
  type: "Container Ship",
  built: 2011,
  gt: "36,782",
  dwt: "48,123",
  investigated: 17,
  openCases: 2,
  riskScore: 82,
  riskBand: "High" as const,
  confidencePct: 82,
  confidenceLabel: "Strong",
  revenueAtRisk: "₦612M",
};

type EntityKind = "Vessels" | "Companies" | "Persons" | "Ports" | "Cargo" | "Manifests";
type RelKind = "Owns" | "Operates" | "Chartered By" | "Visited" | "Shipped" | "Associated With" | "All Types";

const ENTITY_TYPE_COUNTS: Array<{ key: EntityKind; count: number }> = [
  { key: "Vessels", count: 11 },
  { key: "Companies", count: 8 },
  { key: "Persons", count: 5 },
  { key: "Ports", count: 6 },
  { key: "Cargo", count: 7 },
  { key: "Manifests", count: 9 },
];

const REL_TYPE_COUNTS: Array<{ key: RelKind; count: number }> = [
  { key: "Owns", count: 6 },
  { key: "Operates", count: 7 },
  { key: "Chartered By", count: 4 },
  { key: "Visited", count: 8 },
  { key: "Shipped", count: 5 },
  { key: "Associated With", count: 10 },
  { key: "All Types", count: 40 },
];

const LEGEND: Array<{ label: string; color: string }> = [
  { label: "Vessel", color: "var(--color-blue)" },
  { label: "Company", color: "var(--color-purple)" },
  { label: "Person", color: "var(--color-amber, #F59E0B)" },
  { label: "Port", color: "var(--color-teal)" },
  { label: "Cargo", color: "var(--color-gold, #C79A2E)" },
  { label: "Manifest", color: "var(--color-slate, #64748B)" },
];

const RECOMMENDED_ACTIONS = [
  { label: "Review recent port calls", risk: "HIGH" as const, dot: "var(--color-blue)" },
  { label: "Verify beneficial ownership", risk: "HIGH" as const, dot: "var(--color-purple)" },
  { label: "Check sanction list updates", risk: "MEDIUM" as const, dot: "var(--color-amber, #F59E0B)" },
  { label: "Request missing manifests", risk: "MEDIUM" as const, dot: "var(--color-slate, #64748B)" },
  { label: "Monitor next port: Abidjan", risk: "LOW" as const, dot: "var(--color-green)" },
];

const KEY_INSIGHTS_TAGGED = [
  { text: "This vessel is owned by Oceanic Lines Ltd.", tier: "observed" as const },
  { text: "Beneficial ownership traces to Mr. Adewale Ogunleye.", tier: "inferred" as const },
  { text: "Visited 6 high-risk ports in the last 12 months.", tier: "observed" as const },
  { text: "Associated with 7 investigations across 3 countries.", tier: "verified" as const },
  { text: "Revenue impact estimated at ₦612M.", tier: "inferred" as const },
];

const KNOWLEDGE_ASSETS = [
  { title: "Pattern: Ship-to-Ship Transfer", detail: "23 related cases" },
  { title: "Lesson: AIS Gap Manipulation", detail: "12 related cases" },
  { title: "Report: Revenue Leakage Trends Q1 2026", detail: "5 related entities" },
  { title: "Officer Note: Ownership Tracing Methods", detail: "Last updated May 15, 2026" },
];

// Rows for the bottom intelligence table — set per active sub-tab
type BottomRow = {
  date: string;
  primary: string;
  from: string;
  to: string;
  confidence: number;
  evidence: string;
  source: string;
};

const REL_ROWS: BottomRow[] = [
  { date: "May 26, 2026", primary: "Owned By", from: "Oceanic Lines Ltd.", to: "MV Ocean Pearl", confidence: 92, evidence: "Corporate Registry", source: "NIMASA" },
  { date: "May 25, 2026", primary: "Chartered By", from: "Global Chartering Inc.", to: "MV Ocean Pearl", confidence: 88, evidence: "Charter Party", source: "Document" },
  { date: "May 24, 2026", primary: "Visited", from: "MV Ocean Pearl", to: "Apapa Port", confidence: 96, evidence: "AIS Data", source: "Seaphore" },
  { date: "May 22, 2026", primary: "Shipped", from: "MV Ocean Pearl", to: "Crude Oil (HS 2709)", confidence: 90, evidence: "Bill of Lading", source: "Customs" },
  { date: "May 20, 2026", primary: "Associated With", from: "MV Ocean Pearl", to: "INV-2026-00431", confidence: 91, evidence: "Investigation Link", source: "Seaphore" },
];

const HISTORY_ROWS: BottomRow[] = [
  { date: "Jun 04, 2026", primary: "AIS Blackout", from: "MV Ocean Pearl", to: "Bonny Transit", confidence: 88, evidence: "Satellite AIS", source: "SpireGlobal" },
  { date: "May 30, 2026", primary: "Manifest Amended", from: "MV Ocean Pearl", to: "BOL #MSKU8842119", confidence: 84, evidence: "Terminal Log", source: "APM" },
  { date: "May 18, 2026", primary: "Port Call", from: "MV Ocean Pearl", to: "Apapa", confidence: 96, evidence: "AIS Data", source: "Seaphore" },
];

const INVESTIGATION_ROWS: BottomRow[] = [
  { date: "Jun 04, 2026", primary: "INV-2026-00431", from: "Cdr. J. Bello", to: "Open", confidence: 78, evidence: "5 items", source: "Seaphore" },
  { date: "Apr 21, 2026", primary: "INV-2026-00220", from: "Lt. K. Musa", to: "Closed · Duty reassessed", confidence: 86, evidence: "9 items", source: "Seaphore" },
  { date: "Feb 08, 2026", primary: "INV-2026-00091", from: "Cdr. J. Bello", to: "Closed · Fine issued", confidence: 82, evidence: "6 items", source: "Seaphore" },
];

const DOCUMENT_ROWS: BottomRow[] = [
  { date: "Jun 04, 2026", primary: "Bill of Lading", from: "Terminal Operator", to: "BOL #MSKU8842119", confidence: 96, evidence: "PDF · 312 KB", source: "APM Terminals" },
  { date: "May 30, 2026", primary: "Charter Party", from: "Global Chartering Inc.", to: "MV Ocean Pearl", confidence: 88, evidence: "PDF · 214 KB", source: "Document" },
  { date: "May 18, 2026", primary: "Weighbridge Photo", from: "Apapa Terminal CCTV", to: "Gate 4", confidence: 74, evidence: "IMG · 1.4 MB", source: "CCTV" },
];

const BOTTOM_BY_TAB: Partial<Record<EntitySubtab, { title: string; rows: BottomRow[]; primaryHeader: string }>> = {
  Relationships: { title: "Recent Relationships", rows: REL_ROWS, primaryHeader: "RELATIONSHIP" },
  History: { title: "Recent History", rows: HISTORY_ROWS, primaryHeader: "EVENT" },
  Investigations: { title: "Related Investigations", rows: INVESTIGATION_ROWS, primaryHeader: "CASE" },
  Documents: { title: "Recent Documents", rows: DOCUMENT_ROWS, primaryHeader: "DOCUMENT" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function MemoryPage() {
  const [tab, setTab] = useState<MemoryTabKey>("profiles");
  const [sub, setSub] = useState<EntitySubtab>("Relationships");
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<EntityKind>>(
    new Set(ENTITY_TYPE_COUNTS.map((t) => t.key)),
  );
  const [activeRels, setActiveRels] = useState<Set<RelKind>>(
    new Set(REL_TYPE_COUNTS.map((t) => t.key)),
  );
  const [confidence, setConfidence] = useState(0);
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const [drill, setDrill] = useState<EvidenceDrilldownData | null>(null);

  const bottom = useMemo(
    () => BOTTOM_BY_TAB[sub] ?? BOTTOM_BY_TAB.Relationships!,
    [sub],
  );

  const e = MEMORY_ENTITY;

  const openKpi = (data: EvidenceDrilldownData) => setDrill(data);
  const openRow = (r: BottomRow) =>
    setDrill(rowDrilldown(r, bottom.primaryHeader, sub));


  return (
    <AppShell title="Institutional Memory" subtitle="Knowledge & Learning" mode="light">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        {/* Page title + search */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-display text-foreground">Institutional Memory</h1>
            <p className="type-small text-slate">Capture, connect and learn from every case, entity and pattern.</p>
          </div>
          <div className="relative w-full max-w-[520px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
            <input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Search IMO, Vessel, Company, Voyage, Container, BOL, Port, License…"
              className="h-10 w-full rounded-md border border-line bg-card pl-9 pr-10 text-[12px] text-foreground placeholder:text-slate focus:border-[color:var(--color-blue)] focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-slate">/</kbd>
          </div>
        </div>

        {/* Top module tabs */}
        <nav className="flex flex-wrap items-center gap-1 border-b border-line">
          {MEMORY_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key as MemoryTabKey)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold motion-fast",
                  active
                    ? "text-[color:var(--color-blue)]"
                    : "text-foreground/70 hover:text-foreground",
                )}
              >
                {t.label}
                {"isNew" in t && t.isNew && (
                  <span
                    className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: "#7C3AED", backgroundColor: "#7C3AED14" }}
                  >
                    NEW
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[color:var(--color-blue)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Entity Profile header */}
        <PanelCard>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[color:var(--color-navy)]/80 to-[color:var(--color-blue)]/60 text-white">
              <Ship className="h-10 w-10 opacity-80" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="type-h1 text-foreground">{e.name}</h2>
                <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#DC2626", backgroundColor: "#DC262614" }}>
                  HIGH RISK
                </span>
                <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#C79A2E", backgroundColor: "#C79A2E14" }}>
                  WATCHLIST
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate">
                <span><span className="text-foreground/70">IMO</span> <span className="font-semibold text-foreground">{e.imo}</span></span>
                <Dot />
                <span><span className="text-foreground/70">MMSI</span> <span className="font-semibold text-foreground">{ENTITY_META.mmsi}</span></span>
                <Dot />
                <span><span className="text-foreground/70">Call Sign</span> <span className="font-semibold text-foreground">{ENTITY_META.callSign}</span></span>
                <Dot />
                <span><span className="text-foreground/70">Flag</span> <span className="font-semibold text-foreground">{ENTITY_META.flag} {ENTITY_META.flagEmoji}</span></span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate">
                <span><span className="text-foreground/70">Type</span> <span className="font-semibold text-foreground">{ENTITY_META.type}</span></span>
                <Dot />
                <span><span className="text-foreground/70">Built</span> <span className="font-semibold text-foreground">{ENTITY_META.built}</span></span>
                <Dot />
                <span><span className="text-foreground/70">GT</span> <span className="font-semibold text-foreground">{ENTITY_META.gt}</span></span>
                <Dot />
                <span><span className="text-foreground/70">DWT</span> <span className="font-semibold text-foreground">{ENTITY_META.dwt}</span></span>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-6 text-right sm:grid-cols-5">
              <Kpi
                label="Investigated"
                value={`${ENTITY_META.investigated}`}
                suffix="times"
                onClick={() => openKpi(KPI_DRILLDOWNS.investigated)}
              />
              <Kpi
                label="Open Cases"
                value={String(ENTITY_META.openCases)}
                onClick={() => openKpi(KPI_DRILLDOWNS.openCases)}
              />
              <Kpi
                label="Risk Score"
                value={`${ENTITY_META.riskScore}`}
                suffix="/100"
                tone="danger"
                caption={ENTITY_META.riskBand}
                onClick={() => openKpi(KPI_DRILLDOWNS.riskScore)}
              />
              <ConfidenceKpi
                pct={ENTITY_META.confidencePct}
                label={ENTITY_META.confidenceLabel}
                onClick={() => openKpi(KPI_DRILLDOWNS.confidence)}
              />
              <Kpi
                label="Revenue at Risk"
                value={ENTITY_META.revenueAtRisk}
                onClick={() => openKpi(KPI_DRILLDOWNS.revenueAtRisk)}
              />
            </div>


            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground/80 motion-fast hover:bg-surface-2">
                <StickyNote className="h-3.5 w-3.5" /> Add Note
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground/80 motion-fast hover:bg-surface-2">
                <Download className="h-3.5 w-3.5" /> Export Entity Profile
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-card text-slate motion-fast hover:bg-surface-2">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-2">
            {ENTITY_SUBTABS.map((s) => {
              const active = sub === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSub(s)}
                  className={cn(
                    "relative rounded-none px-3 py-2 text-[12px] font-semibold motion-fast",
                    active
                      ? "text-[color:var(--color-blue)]"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {s}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-[9px] h-0.5 bg-[color:var(--color-blue)]" />
                  )}
                </button>
              );
            })}
          </div>
        </PanelCard>

        {/* 3-column workspace */}
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          {/* Left sidebar: Snapshot + Filters */}
          <aside className="space-y-3">
            <PanelCard>
              <PanelHead title="Entity Snapshot" />
              <dl className="space-y-1.5 text-[12px]">
                <SnapRow label="INVESTIGATED" value={`${e.investigatedCount} times`} />
                <SnapRow label="OPEN INVESTIGATIONS" value={String(e.openInvestigations)} />
                <SnapRow label="CLOSED INVESTIGATIONS" value={String(e.closedInvestigations)} />
                <SnapRow label="RISK LEVEL" custom={<RiskPill level={e.riskLevel} />} />
                <SnapRow
                  label="TREND"
                  custom={
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-red)]">
                      ↗ Rising
                    </span>
                  }
                />
                <SnapRow label="FIRST SEEN" value={e.firstSeen} />
                <SnapRow label="LAST SEEN" value={e.lastSeen} />
                <SnapRow label="KNOWN SINCE" value={e.knownSince} />
                <SnapRow label="WATCHLIST" value={e.watchlist ? "Yes" : "No"} />
              </dl>
              <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
                View Full Entity Profile <ArrowRight className="h-3 w-3" />
              </button>
            </PanelCard>

            <PanelCard>
              <PanelHead title="Relationship Filters" />
              <div className="type-label mb-1.5 text-slate">ENTITY TYPES</div>
              <ul className="space-y-1 text-[12px]">
                {ENTITY_TYPE_COUNTS.map((t) => (
                  <FilterRow
                    key={t.key}
                    label={t.key}
                    count={t.count}
                    checked={activeKinds.has(t.key)}
                    onToggle={() =>
                      setActiveKinds((prev) => {
                        const n = new Set(prev);
                        n.has(t.key) ? n.delete(t.key) : n.add(t.key);
                        return n;
                      })
                    }
                  />
                ))}
              </ul>
              <div className="type-label mb-1.5 mt-3 text-slate">RELATIONSHIP TYPES</div>
              <ul className="space-y-1 text-[12px]">
                {REL_TYPE_COUNTS.map((t) => (
                  <FilterRow
                    key={t.key}
                    label={t.key}
                    count={t.count}
                    checked={activeRels.has(t.key)}
                    onToggle={() =>
                      setActiveRels((prev) => {
                        const n = new Set(prev);
                        n.has(t.key) ? n.delete(t.key) : n.add(t.key);
                        return n;
                      })
                    }
                  />
                ))}
              </ul>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="type-label text-slate">Confidence Threshold</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={confidence}
                  onChange={(ev) => setConfidence(Number(ev.target.value))}
                  className="w-full accent-[color:var(--color-blue)]"
                />
                <div className="flex justify-between text-[10px] text-slate">
                  <span>0%</span>
                  <span>{confidence}%</span>
                  <span>100%</span>
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => setEvidenceOnly((v) => !v)}
                  className={cn(
                    "relative inline-flex h-4 w-8 items-center rounded-full motion-fast",
                    evidenceOnly ? "bg-[color:var(--color-blue)]" : "bg-line",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3 w-3 rounded-full bg-white shadow motion-fast",
                      evidenceOnly ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </button>
                <span className="font-semibold text-foreground/80">Evidence Only</span>
              </label>
            </PanelCard>
          </aside>

          {/* Center: Knowledge Graph */}
          <PanelCard variant="edge">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--color-green)]">
                  <Radio className="h-3 w-3" /> LIVE
                </span>
                <span className="text-slate">
                  Displaying <span className="font-semibold text-foreground">11 entities</span>,{" "}
                  <span className="font-semibold text-foreground">10 relationships</span>
                </span>
              </div>
            </div>
            <KnowledgeGraph
              nodes={GRAPH_NODES}
              edges={GRAPH_EDGES}
              focalId="v1"
              height={520}
              minimap
              persistKey="memory:mv-ocean-pearl"
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 text-[10px] text-slate">
              {LEGEND.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
              <span className="mx-2 h-3 w-px bg-line" />
              <span className="inline-flex items-center gap-1.5">
                <span className="h-px w-4 bg-foreground/70" /> Direct Relationship
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-px w-4 border-t border-dashed border-foreground/50" /> Indirect Relationship
              </span>
            </div>
          </PanelCard>

          {/* Right sidebar */}
          <aside className="space-y-3">
            <PanelCard>
              <header className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-purple)]/10 text-[color:var(--color-purple)]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="type-h2 flex-1 text-foreground">Seaphore Copilot</span>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "#7C3AED", backgroundColor: "#7C3AED14" }}>
                  BETA
                </span>
              </header>
              <div className="type-label mb-1 text-slate">KEY INSIGHTS</div>
              <ul className="space-y-2 text-[12px]">
                {KEY_INSIGHTS_TAGGED.map((i) => (
                  <li key={i.text} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-teal)]" />
                    <span className="flex-1 text-foreground/85">{i.text}</span>
                    <ConfidenceChip tier={i.tier} size={9} />
                  </li>
                ))}
              </ul>
              {MEMORY_INSIGHTS.length > 0 ? null : null}
            </PanelCard>

            <PanelCard>
              <PanelHead title="Recommended Actions" />
              <ul className="space-y-1 text-[12px]">
                {RECOMMENDED_ACTIONS.map((a) => (
                  <li key={a.label} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.dot }} />
                    <span className="min-w-0 flex-1 truncate text-foreground/85">{a.label}</span>
                    <RiskPill level={a.risk} />
                  </li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard>
              <header className="mb-2 flex items-center justify-between">
                <span className="type-h2 text-foreground">Similar Entities</span>
                <button className="text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">View all</button>
              </header>
              <ul className="space-y-2 text-[12px]">
                {SIMILAR_ENTITIES.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]">
                      <Ship className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">{s.name}</div>
                      <div className="type-mono text-[10px] text-slate">IMO {9000000 + parseInt(s.id.slice(-5), 10)}</div>
                    </div>
                    <span className="text-[11px] font-bold text-[color:var(--color-teal)]">{s.matchPct}% Similar</span>
                  </li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard>
              <header className="mb-2 flex items-center justify-between">
                <span className="type-h2 text-foreground">Knowledge Assets (Related)</span>
                <button className="text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">View all</button>
              </header>
              <ul className="space-y-2 text-[12px]">
                {KNOWLEDGE_ASSETS.map((k) => (
                  <li key={k.title} className="flex items-start gap-2">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-gold,#C79A2E)]" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{k.title}</div>
                      <div className="text-[10px] text-slate">{k.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </PanelCard>
          </aside>
        </div>

        {/* Bottom intelligence table — varies by active sub-tab */}
        <PanelCard>
          <header className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate" />
              <h3 className="type-h2 text-foreground">{bottom.title}</h3>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-slate">
                {sub}
              </span>
            </div>
            <button className="text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">View all</button>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line text-left type-label text-slate">
                  <th className="py-2 pr-4">DATE</th>
                  <th className="py-2 pr-4">{bottom.primaryHeader}</th>
                  <th className="py-2 pr-4">FROM</th>
                  <th className="py-2 pr-4">TO</th>
                  <th className="py-2 pr-4">CONFIDENCE</th>
                  <th className="py-2 pr-4">EVIDENCE</th>
                  <th className="py-2 pr-4">SOURCE</th>
                </tr>
              </thead>
              <tbody>
                {bottom.rows.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => openRow(r)}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2/50"
                    title="Open evidence drilldown"
                  >
                    <td className="py-2 pr-4 text-slate">{r.date}</td>
                    <td className="py-2 pr-4 font-semibold text-[color:var(--color-blue)] underline decoration-dotted underline-offset-2">{r.primary}</td>
                    <td className="py-2 pr-4 text-foreground/85">{r.from}</td>
                    <td className="py-2 pr-4 text-foreground/85">{r.to}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold" style={{ color: "#0E7C7B", backgroundColor: "#0E7C7B14" }}>
                        {r.confidence}%
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-foreground/85">{r.evidence}</td>
                    <td className="py-2 pr-4 text-slate">{r.source}</td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentational helpers
// ─────────────────────────────────────────────────────────────────────────────

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-slate/50" aria-hidden />;
}

function Kpi({
  label,
  value,
  suffix,
  caption,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  suffix?: string;
  caption?: string;
  tone?: "danger";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group text-left",
        onClick && "cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-2/60 motion-fast",
      )}
      title={onClick ? "Open evidence drilldown" : undefined}
    >
      <div className="type-label text-slate">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-[20px] font-extrabold text-foreground",
            onClick && "group-hover:underline decoration-dotted underline-offset-2",
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-[11px] font-semibold text-slate">{suffix}</span>}
      </div>
      {caption && (
        <div
          className={cn(
            "type-label",
            tone === "danger" ? "text-[color:var(--color-red)]" : "text-slate",
          )}
        >
          {caption}
        </div>
      )}
    </Tag>
  );
}

function ConfidenceKpi({
  pct,
  label,
  onClick,
}: {
  pct: number;
  label: string;
  onClick?: () => void;
}) {
  const size = 44;
  const r = 18;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group text-left",
        onClick && "cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-2/60 motion-fast",
      )}
      title={onClick ? "Open evidence drilldown" : undefined}
    >
      <div className="type-label text-slate">Confidence</div>
      <div className="mt-0.5 flex items-center gap-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line, #E2E8F0)" strokeWidth={4} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-teal)"
            strokeWidth={4}
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          <text
            x="50%"
            y="52%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground"
            fontSize="11"
            fontWeight="800"
          >
            {pct}
          </text>
        </svg>
        <div>
          <div className="text-[18px] font-extrabold text-foreground">{pct}%</div>
          <div className="type-label text-[color:var(--color-teal)]">{label}</div>
        </div>
      </div>
    </Tag>
  );
}


function SnapRow({
  label,
  value,
  custom,
}: {
  label: string;
  value?: string;
  custom?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-1 last:border-0">
      <span className="type-label text-slate">{label}</span>
      {custom ?? <span className="text-[12px] font-semibold text-foreground">{value}</span>}
    </div>
  );
}

function FilterRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-surface-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-[color:var(--color-blue)]"
        />
        <span className="flex-1 text-foreground/85">{label}</span>
        <span className="type-mono text-[11px] text-slate">{count}</span>
      </label>
    </li>
  );
}
